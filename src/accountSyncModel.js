import { sha256 } from '@noble/hashes/sha2.js';
import { assertStateContinuity, assertStateShape } from './localStateStorage.js';

// Pure reconciliation logic. No caller may apply these proposals before the
// existing local checkpoint/write path and the cloud ownership check succeed.
export const ACCOUNT_SYNC_SCHEMA = 1;
const singletonFields = [
  'profile', 'program', 'activeWorkout', 'activeOptionalSession',
  'todayAdaptation', 'flexibleWeek', 'weekScheduleOverrides',
  'workoutOccurrenceOverrides', 'defaultGymProfileId',
  'substitutionPreferences', 'exerciseAliases', 'progressFocusOverrideByPlanId',
  'weightTrackingEnabled', 'dismissedMissedReminderKey',
];
const itemFields = {
  workouts: 'id', optionalSessions: 'id', planVersions: 'id',
  completedTrainingBlocks: 'id', gymProfiles: 'id', customExercises: 'id',
  savedWorkoutTemplates: 'id', workoutCorrections: 'id',
  programChangeHistory: 'id', weightCheckins: 'localDate',
  importedMeasurementSources: 'id',
};
const encode = value => JSON.stringify(value);
// Firestore does not retain JavaScript object-property insertion order. Hash
// the JSON tree in a stable key order so a server round trip verifies the same
// record that was written locally (array order remains meaningful).
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
// The local root is JSON serialized before it is committed. Firestore rejects
// undefined nested fields that JSON omits, so cloud entities use that same
// canonical representation before both hashing and writing.
const asStoredJson = value => JSON.parse(encode(value));
const digest = value => Array.from(sha256(new TextEncoder().encode(encode(canonical(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const entityDigest = (value, ordinal) => digest(ordinal === null ? value : [value, ordinal]);
const key = (domain, entityId) => `${domain}:${encode(entityId)}`;
const same = (a, b) => a === b;
const syncNull = Object.freeze({ __rookSyncNull: 1 });
const isSyncNull = value => value && typeof value === 'object' && Object.keys(value).length === 1 && value.__rookSyncNull === 1;

export function syncEntities(state) {
  if (!state?.profile?.id || ![2, 3].includes(state.schemaVersion)) throw new Error('Invalid local sync lineage or schema.');
  const result = new Map();
  for (const domain of singletonFields) {
    const value = state[domain];
    if (value !== undefined && (value !== null || domain !== 'profile' && (domain !== 'program' || state.profile.onboardingComplete))) {
      const cloudValue = asStoredJson(value === null ? syncNull : value);
      result.set(key(domain, 'root'), { domain, entityId: 'root', ordinal: null, value: cloudValue, digest: entityDigest(cloudValue, null) });
    }
  }
  for (const [domain, idField] of Object.entries(itemFields)) {
    const items = state[domain] || [];
    if (!Array.isArray(items)) throw new Error(`Invalid ${domain} sync collection.`);
    for (const [ordinal, value] of items.entries()) {
      const entityId = value?.[idField];
      if (typeof entityId !== 'string' || !entityId || result.has(key(domain, entityId))) throw new Error(`Invalid or duplicate ${domain} sync identity.`);
      // Workout photo blobs and their local IndexedDB references never leave
      // this device in v1. A remote copy must not advertise a missing photo.
      const cloudValue = asStoredJson(domain === 'workouts' ? (({ photoId, ...rest }) => rest)(value) : value);
      result.set(key(domain, entityId), { domain, entityId, ordinal, value: cloudValue, digest: entityDigest(cloudValue, ordinal) });
    }
  }
  return result;
}

export function classifySyncBootstrap({ localState, cloudProfileId, cloudEntities = new Map(), accountVerified = false }) {
  if (!accountVerified) return 'awaiting-verified-account';
  const profileId = localState?.profile?.id;
  if (!profileId) return 'invalid-local-profile';
  if (cloudEntities.size && !cloudProfileId) return 'cloud-identity-missing';
  const localPopulated = Boolean(localState.profile.onboardingComplete || localState.program || localState.activeWorkout || localState.workouts?.length || localState.savedWorkoutTemplates?.length || localState.customExercises?.length);
  const cloudPopulated = [...cloudEntities.values()].some(entity => !entity.deleted && entity.domain !== 'profile');
  if (cloudProfileId && cloudProfileId !== profileId) return localPopulated ? 'different-lineage' : 'cloud-recovery-required';
  if (!localPopulated && cloudPopulated) return 'cloud-recovery-required';
  if (localPopulated && !cloudPopulated) return 'upload-local-after-checkpoint';
  if (localPopulated && cloudPopulated) return 'reconcile-same-lineage';
  return 'empty';
}

// An acknowledged entry has {revision, digest}. Cloud documents carry
// {revision, digest, deleted, value, syncSchemaVersion}. Absence is never a
// deletion receipt; only an explicit tombstone can remove a local entity.
export function planSyncReconciliation({ localEntities, cloudEntities, acknowledged = new Map(), explicitDeletes = new Set() }) {
  const plan = { upload: [], download: [], settled: [], discarded: [], conflicts: [], blocked: [] };
  const keys = new Set([...localEntities.keys(), ...cloudEntities.keys(), ...acknowledged.keys(), ...explicitDeletes]);
  for (const entityKey of keys) {
    const local = localEntities.get(entityKey), cloud = cloudEntities.get(entityKey), base = acknowledged.get(entityKey);
    if (cloud?.syncSchemaVersion > ACCOUNT_SYNC_SCHEMA) { plan.blocked.push({ key: entityKey, reason: 'newer-cloud-schema' }); continue; }
    if (cloud && (!Number.isSafeInteger(cloud.revision) || cloud.revision < 1 ||
      (Object.hasOwn(itemFields, cloud.domain) ? !Number.isSafeInteger(cloud.ordinal) || cloud.ordinal < 0 : cloud.ordinal !== null) ||
      (cloud.deleted ? cloud.value != null || cloud.digest != null : cloud.value == null || cloud.digest !== entityDigest(cloud.value, cloud.ordinal)))) {
      plan.blocked.push({ key: entityKey, reason: 'invalid-cloud-record' }); continue;
    }
    if (base && (!Number.isSafeInteger(base.revision) || base.revision < 1)) { plan.blocked.push({ key: entityKey, reason: 'invalid-acknowledgement' }); continue; }
    if (base && !cloud) { plan.conflicts.push({ key: entityKey, reason: 'cloud-record-missing' }); continue; }
    if (!base) {
      // A deletion requested after an in-flight first upload must win over
      // that upload's late acknowledgement. Never restore the removed item.
      if (!local && explicitDeletes.has(entityKey)) {
        if (cloud && !cloud.deleted) plan.upload.push({ key: entityKey, operation: 'delete', baseRevision: cloud.revision });
        else plan.discarded.push({ key: entityKey, revision: cloud?.revision || 0 });
        continue;
      }
      if (local && cloud && !cloud.deleted && same(local.digest, cloud.digest)) plan.settled.push({ key: entityKey, revision: cloud.revision });
      else if (local && !cloud) plan.upload.push({ key: entityKey, operation: 'upsert', entity: local, baseRevision: 0 });
      else if (!local && cloud) {
        if (!cloud.deleted) plan.download.push({ key: entityKey, operation: 'upsert', entity: cloud });
        else plan.settled.push({ key: entityKey, revision: cloud.revision });
      } else if (local && cloud) plan.conflicts.push({ key: entityKey, reason: 'unrelated-entity-changes' });
      continue;
    }
    // An acknowledged tombstone is represented locally by no entity and in
    // the acknowledgement by a null digest. That settled absence must not
    // become a new delete request after a later unrelated local edit.
    const localChanged = !same(local?.digest ?? null, base.digest);
    const cloudChanged = cloud.revision !== base.revision || !same(cloud.digest, base.digest);
    if (!localChanged && !cloudChanged) { plan.settled.push({ key: entityKey, revision: cloud.revision }); continue; }
    if (!localChanged && cloudChanged) { plan.download.push({ key: entityKey, operation: cloud.deleted ? 'delete' : 'upsert', entity: cloud }); continue; }
    if (localChanged && !cloudChanged) {
      if (local) plan.upload.push({ key: entityKey, operation: 'upsert', entity: local, baseRevision: base.revision });
      else if (explicitDeletes.has(entityKey)) plan.upload.push({ key: entityKey, operation: 'delete', baseRevision: base.revision });
      else plan.conflicts.push({ key: entityKey, reason: 'delete-intent-missing' });
      continue;
    }
    if (local && !cloud.deleted && same(local.digest, cloud.digest)) plan.settled.push({ key: entityKey, revision: cloud.revision });
    else if (!local && cloud.deleted && explicitDeletes.has(entityKey)) plan.settled.push({ key: entityKey, revision: cloud.revision });
    else plan.conflicts.push({ key: entityKey, reason: 'concurrent-entity-change' });
  }
  return plan;
}

export function syncMutationId({ profileId, deviceId, generation, proposal }) {
  if (!profileId || !deviceId || !Number.isSafeInteger(generation) || generation < 0 || !proposal?.key || !['upsert', 'delete'].includes(proposal.operation)) throw new Error('Invalid sync mutation identity.');
  return digest([ACCOUNT_SYNC_SCHEMA, profileId, deviceId, generation, proposal.key, proposal.operation, proposal.entity?.digest || null]);
}

export function applySyncDownloads(state, downloads) {
  const next = structuredClone(state);
  const downloadedOrder = new Map();
  for (const { key: entityKey, operation, entity } of downloads) {
    const domain = entity?.domain, entityId = entity?.entityId;
    if (entityKey !== key(domain, entityId) || !['upsert', 'delete'].includes(operation)) throw new Error('Invalid cloud entity identity.');
    if (singletonFields.includes(domain)) {
      if (entityId !== 'root') throw new Error('Invalid singleton entity identity.');
      if (operation === 'delete' && ['profile', 'program'].includes(domain)) throw new Error('Cloud cannot delete the profile or program.');
      if (operation === 'upsert' && domain === 'profile' && entity.value?.id !== state.profile.id) throw new Error('Cloud profile lineage mismatch.');
      next[domain] = operation === 'delete' || isSyncNull(entity.value) ? null : structuredClone(entity.value);
    } else if (Object.hasOwn(itemFields, domain)) {
      const idField = itemFields[domain];
      if (!Array.isArray(next[domain])) next[domain] = [];
      const index = next[domain].findIndex(item => item?.[idField] === entityId);
      if (operation === 'delete') {
        if (index >= 0) next[domain].splice(index, 1);
      } else {
        if (entity.value?.[idField] !== entityId) throw new Error('Cloud item identity mismatch.');
        if (!Number.isSafeInteger(entity.ordinal) || entity.ordinal < 0) throw new Error('Cloud item order is invalid.');
        const value = structuredClone(entity.value);
        if (domain === 'workouts' && index >= 0 && next[domain][index].photoId) value.photoId = next[domain][index].photoId;
        if (index >= 0) next[domain][index] = value;
        else next[domain].push(value);
        if (!downloadedOrder.has(domain)) downloadedOrder.set(domain, new Map());
        downloadedOrder.get(domain).set(entityId, entity.ordinal);
      }
    } else throw new Error('Unknown cloud sync domain.');
  }
  for (const [domain, positions] of downloadedOrder) {
    const idField = itemFields[domain];
    const previous = new Map((state[domain] || []).map((item, index) => [item[idField], index]));
    next[domain].sort((a, b) => {
      const aOrder = positions.get(a[idField]) ?? previous.get(a[idField]);
      const bOrder = positions.get(b[idField]) ?? previous.get(b[idField]);
      return aOrder - bOrder || a[idField].localeCompare(b[idField]);
    });
  }
  assertStateShape(next);
  assertStateContinuity(state, next);
  return next;
}

// Used only after an explicit Google sign-in on a genuinely empty device.
// This path does not run through ordinary two-way reconciliation or permit an
// existing populated local profile to be replaced.
export function materializeCloudProfile(emptyState, remote) {
  if (!remote?.profileId || remote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA || !(remote.entities instanceof Map)) throw new Error('Cloud recovery identity is unavailable.');
  const base = structuredClone(emptyState);
  if (base.profile?.onboardingComplete || base.program || base.activeWorkout || base.workouts?.length || base.savedWorkoutTemplates?.length) throw new Error('Cloud recovery requires an empty local profile.');
  base.profile.id = remote.profileId;
  for (const record of remote.entities.values()) if (record.profileId !== remote.profileId) throw new Error('Cloud record lineage mismatch.');
  const profile = remote.entities.get(key('profile', 'root'));
  const program = remote.entities.get(key('program', 'root'));
  if (!profile || profile.deleted || profile.value?.id !== remote.profileId || profile.value?.onboardingComplete !== true ||
      (!program && !['own-workouts','freestyle'].includes(profile.value.preferredTrainingStyle)) || program?.deleted) throw new Error('Cloud recovery is incomplete.');
  const plan = planSyncReconciliation({ localEntities: new Map(), cloudEntities: remote.entities });
  if (plan.blocked.length || plan.conflicts.length || plan.upload.length) throw new Error('Cloud recovery records need review.');
  const restored = applySyncDownloads(base, plan.download);
  if (restored.profile.id !== remote.profileId || !restored.profile.onboardingComplete || !restored.program && !['own-workouts','freestyle'].includes(restored.profile.preferredTrainingStyle)) throw new Error('Cloud recovery failed validation.');
  return restored;
}
