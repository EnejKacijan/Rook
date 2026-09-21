import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import {assertWorkoutTemplates} from './workoutTemplateSchema.js';

// Application data lives only in PRIMARY and the bounded recovery checkpoint.
// Metadata never contains names, exercises, notes, messages, or state payloads.
export const PRIMARY_KEY = 'lift-v2-state';
export const INSTALL_META_KEY = 'rook-install-meta-v1';
export const RECOVERY_KEY = 'rook-recovery-v1';
export const JOURNAL_KEY = 'rook-restore-journal-v1';
export const MAX_RECOVERY_CHARS = 524288;
const MAX_RAW_BYTES = 16 * 1024 * 1024;
const CHECKPOINT_INTERVAL = 60000;
const LEGACY_EVIDENCE_KEYS = ['lift-funnel-events-v1','lift-funnel-once-v1'];
const build = typeof __ROOK_BUILD_ID__ === 'undefined' ? 'development' : __ROOK_BUILD_ID__;
const version = typeof __ROOK_APP_VERSION__ === 'undefined' ? '1.0.0' : __ROOK_APP_VERSION__;
const sessions = new WeakMap();
let lastDiagnostic = {};
const stamp = () => new Date().toISOString();
const fail = (code) => { throw Object.assign(new Error(`Saved ROOK data could not be safely loaded or written (${code}).`), { code }); };
const hash = bytes => Array.from(sha256(bytes), n => n.toString(16).padStart(2, '0')).join('');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Cheap, lossless shape checks on writes; full migrations run at hydration and
// checkpoint creation, not on every +/- tap. Missing legacy fields remain legal.
export function assertStateShape(state) {
  if (!state || ![2, 3].includes(state.schemaVersion)) fail('schema-error');
  if (!object(state.profile)) fail('validation-error');
  assertWorkoutTemplates(state.savedWorkoutTemplates);
  for (const key of ['workouts','planVersions','customExercises','workoutCorrections','optionalSessions','conversations','weightCheckins','programChangeHistory','completedTrainingBlocks','gymProfiles','exerciseAliases','substitutionPreferences','importedMeasurementSources'])
    if (state[key] != null && (!Array.isArray(state[key]) || state[key].some(item => !object(item)))) fail('validation-error');
  for (const key of ['weekScheduleOverrides','workoutOccurrenceOverrides','progressFocusOverrideByPlanId'])
    if (state[key] != null && !object(state[key])) fail('validation-error');
  const plans = [state.program, ...(state.planVersions || []).map(v => v?.program), ...(state.completedTrainingBlocks || []).map(b => b?.program)].filter(Boolean);
  const workouts = [state.activeWorkout, ...(state.workouts || []), ...(state.optionalSessions || []).map(s => s?.workout)].filter(Boolean);
  for (const plan of plans) {
    if (!Array.isArray(plan.days)) fail('validation-error');
    workouts.push(...plan.days);
  }
  for (const workout of workouts)
    if (!workout || !Array.isArray(workout.exercises) || workout.exercises.some(e => !e || !Array.isArray(e.sets) || e.sets.some(s => !object(s)))) fail('validation-error');
  if (state.profile.onboardingComplete && !state.program) fail('validation-error');
  if (state.activeOptionalSession != null && (!object(state.activeOptionalSession) || !['Cardio','Mobility'].includes(state.activeOptionalSession.kind) || !Number.isFinite(Number(state.activeOptionalSession.startedAt)))) fail('validation-error');
  for (const entry of state.weightCheckins || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.localDate) || !Number.isFinite(Number(entry.weightKg)) || Number(entry.weightKg) < 10 || Number(entry.weightKg) > 700) fail('validation-error');
  for (const entry of state.customExercises || []) if (!entry.id || !String(entry.name || '').trim()) fail('validation-error');
  for (const entry of state.completedTrainingBlocks || []) if (!entry.id || !Array.isArray(entry.weeks)) fail('validation-error');
  for (const entry of state.planVersions || []) if (!entry.id || !entry.program) fail('validation-error');
}

export function hasEstablishedData(state) {
  return !!(state?.program || state?.activeWorkout || state?.activeOptionalSession || state?.workouts?.length || state?.optionalSessions?.length || state?.planVersions?.length || state?.conversations?.length || state?.savedWorkoutTemplates?.length);
}

function parseMeta(raw) {
  if (raw === null) return null;
  let meta;
  try { meta = JSON.parse(raw); } catch { fail('metadata-error'); }
  if (meta?.version !== 1 || !Number.isSafeInteger(meta.generation) || meta.generation < 0 || typeof meta.everInitialized !== 'boolean') fail('metadata-error');
  return meta;
}

function remember(outcome, extra = {}) {
  lastDiagnostic = { ...lastDiagnostic, appVersion: version, build, lastEventAt: stamp(), outcome, ...extra };
}
export function recordStartupOutcome(code) { remember(code, { startupOutcome: code }); }
export function localRecoverySummary(storage, hydrate) {
  try { const recovery = readRecovery(storage, hydrate); return recovery ? { createdAt: recovery.createdAt, generation: recovery.generation } : undefined; } catch { return undefined; }
}

function decode(raw, hydrate) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('parse-error'); }
  assertStateShape(parsed);
  try { return hydrate(parsed); } catch (error) { throw Object.assign(new Error('migration-error', { cause: error }), { code: 'migration-error' }); }
}

function hasLegacyUseEvidence(storage) {
  const names = ['onboarding_completed','first_plan_viewed','first_workout_started','first_workout_completed'];
  for (const key of LEGACY_EVIDENCE_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    let entries;
    try { entries = JSON.parse(raw); } catch { return true; }
    if (!Array.isArray(entries)) return true;
    if (entries.some(entry => names.includes(typeof entry === 'string' ? entry : entry?.name) || (entry?.name === 'app_open' && entry?.properties?.path === 'returning'))) return true;
  }
  return false;
}

function encodeCheckpoint(raw, state, generation) {
  const bytes = strToU8(raw);
  if (bytes.length > MAX_RAW_BYTES) fail('recovery-too-large');
  const compressed = gzipSync(bytes, { level: 1, mtime: 0 });
  let binary = '';
  for (let i = 0; i < compressed.length; i += 8192) binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
  const envelope = JSON.stringify({ version: 1, schemaVersion: JSON.parse(raw).schemaVersion, generation, createdAt: stamp(), encoding: 'gzip-base64', bytes: bytes.length, checksum: hash(bytes), payload: btoa(binary) });
  if (envelope.length > MAX_RECOVERY_CHARS) fail('recovery-too-large');
  return envelope;
}

export function readRecovery(storage, hydrate) {
  const raw = storage.getItem(RECOVERY_KEY);
  if (raw === null) return null;
  try {
    if (raw.length > MAX_RECOVERY_CHARS) fail('recovery-invalid');
    const e = JSON.parse(raw);
    if (e.version !== 1 || e.encoding !== 'gzip-base64' || !Number.isSafeInteger(e.generation) || e.generation < 0 || !Number.isSafeInteger(e.bytes) || e.bytes < 1 || e.bytes > MAX_RAW_BYTES || !Number.isFinite(Date.parse(e.createdAt))) fail('recovery-invalid');
    const packed = Uint8Array.from(atob(e.payload), c => c.charCodeAt(0));
    if (packed.length < 18 || new DataView(packed.buffer).getUint32(packed.length - 4, true) !== e.bytes) fail('recovery-invalid');
    const bytes = gunzipSync(packed, { out: new Uint8Array(e.bytes) });
    if (hash(bytes) !== e.checksum) fail('recovery-invalid');
    const value = strFromU8(bytes), state = decode(value, hydrate);
    if (e.schemaVersion !== JSON.parse(value).schemaVersion) fail('recovery-invalid');
    return { raw: value, state, generation: e.generation, createdAt: e.createdAt };
  } catch { fail('recovery-invalid'); }
}

export function readLocalState(storage, hydrate) {
  let raw, meta, recovery;
  try {
    raw = storage.getItem(PRIMARY_KEY);
    meta = parseMeta(storage.getItem(INSTALL_META_KEY));
    if (meta?.deletePending) fail('delete-incomplete');
    if (raw !== null) {
      const state = decode(raw, hydrate);
      sessions.set(storage, { raw, established: hasEstablishedData(state), planSignature: JSON.stringify([state.program,state.planVersions]), lastCheckpointAt: 0 });
      remember('ready', { startupOutcome: 'ready', lastSuccessfulReadAt: stamp(), schemaVersion: state.schemaVersion, serializedChars: raw.length });
      return { status: 'ready', state };
    }
    recovery = readRecovery(storage, hydrate);
    if (recovery || meta?.everInitialized || storage.getItem(JOURNAL_KEY) !== null || (!meta?.explicitDeleteAt && hasLegacyUseEvidence(storage))) fail('primary-missing');
    sessions.set(storage, { raw: null, lastCheckpointAt: 0 });
    recordStartupOutcome(meta?.explicitDeleteAt ? 'explicitly-deleted' : 'empty');
    return { status: 'empty' };
  } catch (error) {
    // Read failures do not write/delete ANY storage. Diagnostic error details
    // stay in memory until a later successful operation or manual inspection.
    try { recovery ||= readRecovery(storage, hydrate); } catch { /* Never offer unvalidated bytes. */ }
    const code = error.code || (error.name === 'SecurityError' ? 'storage-unavailable' : 'read-error');
    recordStartupOutcome(code);
    return { status: 'error', code, error, ...(recovery ? { recovery: { createdAt: recovery.createdAt, generation: recovery.generation } } : {}) };
  }
}

function writeMeta(storage, meta) { storage.setItem(INSTALL_META_KEY, JSON.stringify(meta)); }

export function persistLocalState(raw, { storage, hydrate, reason = 'user-change', replacement = false, preserveRecovery = false } = {}) {
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(raw);
    assertStateShape(parsed);
    let meta;
    try { meta = parseMeta(storage.getItem(INSTALL_META_KEY)); } catch (error) { if (!replacement) throw error; }
    if (meta?.deletePending && !replacement) fail('delete-incomplete');
    if (!replacement && storage.getItem(JOURNAL_KEY) !== null) fail('restore-in-progress');
    const prior = storage.getItem(PRIMARY_KEY), session = sessions.get(storage);
    if (!replacement && session && session.raw !== prior) fail('state-changed');
    if (!replacement && prior === null && (meta?.everInitialized || storage.getItem(RECOVERY_KEY) !== null)) fail('primary-missing');
    const planSignature = JSON.stringify([parsed.program,parsed.planVersions]);
    if (!session || session.planSignature !== planSignature || replacement) decode(raw, hydrate);
    // An initialized app cannot autosave a default state over established data.
    let previous;
    if (prior !== null && prior !== raw && !replacement) {
      if (!session) previous = decode(prior, hydrate);
      if ((session?.established || hasEstablishedData(previous)) && !hasEstablishedData(parsed)) fail('empty-write-blocked');
    }
    if (prior === raw && meta?.everInitialized) { sessions.set(storage, { ...session, raw }); return true; }
    const generation = (meta?.generation || 0) + 1;
    const nextMeta = { ...meta, version: 1, everInitialized: true, generation, committedGeneration: meta?.committedGeneration ?? (meta?.writePending ? 0 : meta?.generation || 0), appVersion: version, build, schemaVersion: parsed.schemaVersion, serializedChars: raw.length, lastWriteReason: reason, writePending: true, deletePending: false };
    // A tiny intent marker is committed before touching PRIMARY. If interrupted,
    // a missing primary will be recovery, never a silent fresh installation.
    writeMeta(storage, nextMeta);
    let checkpointAt = session?.lastCheckpointAt || 0;
    if (prior !== null && prior !== raw && !preserveRecovery && (!checkpointAt || Date.now() - checkpointAt >= CHECKPOINT_INTERVAL)) {
      try { previous ||= decode(prior, hydrate); } catch (error) { if (!replacement) throw error; }
      if (previous) {
        storage.setItem(RECOVERY_KEY, encodeCheckpoint(prior, previous, nextMeta.committedGeneration));
        checkpointAt = Date.now();
      }
    }
    storage.setItem(PRIMARY_KEY, raw); // Web Storage replaces a single value atomically.
    if (storage.getItem(PRIMARY_KEY) !== raw) fail('write-verification-failed');
    sessions.set(storage, { raw, established: hasEstablishedData(parsed), planSignature, lastCheckpointAt: checkpointAt });
    const completed = { ...nextMeta, committedGeneration: generation, writePending: false, lastSuccessfulWriteAt: stamp(), lastSuccessfulReadAt: lastDiagnostic.lastSuccessfulReadAt || meta?.lastSuccessfulReadAt || null, startupOutcome: lastDiagnostic.startupOutcome || meta?.startupOutcome || 'ready' };
    remember('saved', { lastSuccessfulWriteAt: completed.lastSuccessfulWriteAt, generation, lastWriteReason: reason });
    // PRIMARY is already durable. Failure of optional final diagnostics must not
    // falsely report the successfully verified data write as lost.
    try { writeMeta(storage, completed); } catch { remember('saved-metadata-pending'); }
    return true;
  } catch (error) {
    remember(error?.name === 'QuotaExceededError' ? 'quota-error' : error?.code || 'write-error');
    return false;
  }
}

export function restoreLocalCheckpoint(storage, hydrate) {
  if (storage.getItem(JOURNAL_KEY) !== null) fail('restore-in-progress');
  const recovery = readRecovery(storage, hydrate);
  if (!recovery) fail('recovery-missing');
  if (!persistLocalState(recovery.raw, { storage, hydrate, reason: 'recovery-used', replacement: true, preserveRecovery: true })) fail('recovery-write-failed');
  remember('recovery-used');
}

export function forgetStorageSession(storage) { sessions.delete(storage); }

// Cross-store restore/recovery/delete must not run against each other in two
// same-origin windows. Unsupported contexts retain journal-based recovery.
export function withStorageTransaction(operation, locks = globalThis.navigator?.locks) {
  return typeof locks?.request === 'function'
    ? locks.request('rook-state-photo-transaction-v1', { mode: 'exclusive' }, operation)
    : operation();
}

export function deleteLocalState(options = {}) {
  return withStorageTransaction(() => deleteLocalStateLocked(options));
}
async function deleteLocalStateLocked({ storage = globalThis.localStorage, clearPhotos, reason = 'delete-local-data:user-confirmed' } = {}) {
  // Explicit action only: retain a tiny deletion receipt even after all user
  // content is gone. Partial deletion stays recoverable, never claims success.
  let meta;
  try { meta = parseMeta(storage.getItem(INSTALL_META_KEY)); } catch { meta = null; }
  const intent = { version: 1, generation: (meta?.generation || 0) + 1, everInitialized: true, deletePending: true, explicitDeleteAt: stamp(), lastWriteReason: reason, build, appVersion: version };
  writeMeta(storage, intent);
  await clearPhotos?.();
  for (const key of [PRIMARY_KEY, RECOVERY_KEY, JOURNAL_KEY, ...LEGACY_EVIDENCE_KEYS]) storage.removeItem(key);
  writeMeta(storage, { ...intent, everInitialized: false, deletePending: false });
  sessions.delete(storage);
  remember('explicitly-deleted', { explicitDeleteAt: intent.explicitDeleteAt, lastWriteReason: reason });
}

export function storageDiagnostics(storage) {
  let meta = {}, primaryChars = null, recoveryChars = null;
  try {
    storage ??= globalThis.localStorage;
    const stored = parseMeta(storage.getItem(INSTALL_META_KEY)) || {};
    // Whitelist even metadata read from disk: never echo arbitrary injected keys.
    for (const key of ['generation','committedGeneration','schemaVersion']) if (Number.isSafeInteger(stored[key])) meta[key] = stored[key];
    for (const key of ['everInitialized','writePending','deletePending']) if (typeof stored[key] === 'boolean') meta[key] = stored[key];
    for (const key of ['lastSuccessfulWriteAt','lastSuccessfulReadAt','explicitDeleteAt']) if (typeof stored[key] === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(stored[key])) meta[key] = stored[key];
    if (['ready','empty','parse-error','schema-error','migration-error','primary-missing','recovery-used','explicitly-deleted'].includes(stored.startupOutcome)) meta.startupOutcome = stored.startupOutcome;
    if (['granted','not-granted','unsupported','unavailable','requested'].includes(stored.persistentStorage?.result)) meta.persistentStorage = { result: stored.persistentStorage.result, requested: !!stored.persistentStorage.requestedAt };
    if (stored.storageEstimate) meta.storageEstimate = Object.fromEntries(['usage','quota'].map(key => [key,Number.isFinite(stored.storageEstimate[key])?stored.storageEstimate[key]:null]));
    primaryChars = storage.getItem(PRIMARY_KEY)?.length ?? 0;
    recoveryChars = storage.getItem(RECOVERY_KEY)?.length ?? 0;
  } catch { /* A diagnostic view must work even when storage is unavailable. */ }
  return { ...meta, ...lastDiagnostic, appVersion: version, build, primaryChars, recoveryChars, approximateWebStorageBytes: primaryChars === null ? null : (primaryChars + recoveryChars) * 2 };
}

export async function inspectStorageProtection({ request = false, storage, api = globalThis.navigator?.storage, secure = globalThis.isSecureContext } = {}) {
  const result = { available: !!api, result: 'unsupported', requested: false, estimate: null };
  let meta;
  try { storage ??= globalThis.localStorage; meta = parseMeta(storage.getItem(INSTALL_META_KEY)); } catch { /* Diagnostic only. */ }
  try {
    if (typeof api?.estimate === 'function') {
      const estimate = await api.estimate();
      result.estimate = { usage: Number.isFinite(estimate.usage) ? estimate.usage : null, quota: Number.isFinite(estimate.quota) ? estimate.quota : null };
    }
  } catch { result.estimate = null; }
  try {
    if (secure && typeof api?.persisted === 'function') {
      result.result = (await api.persisted()) ? 'granted' : 'not-granted';
      if (request && result.result !== 'granted' && typeof api.persist === 'function') {
        // Record intent first, so reopen/retry cannot repeatedly request it.
        // Re-read after every await: diagnostics must not overwrite a newer
        // state generation, restore, or explicit-deletion receipt.
        meta = parseMeta(storage.getItem(INSTALL_META_KEY));
        if (meta?.everInitialized && !meta.deletePending && !meta.persistentStorage?.requestedAt) {
          meta = { ...meta, persistentStorage: { result: 'requested', requestedAt: stamp() } };
          writeMeta(storage, meta);
          result.requested = true;
          result.result = (await api.persist()) ? 'granted' : 'not-granted';
        }
      }
    }
  } catch { result.result = 'unavailable'; }
  remember(lastDiagnostic.outcome || 'storage-inspected', { persistentStorage: { result: result.result, requested: result.requested }, storageEstimate: result.estimate });
  try {
    const current = parseMeta(storage.getItem(INSTALL_META_KEY));
    if (current?.everInitialized && !current.deletePending) writeMeta(storage, { ...current, persistentStorage: { ...current.persistentStorage, result: result.result, checkedAt: stamp() }, storageEstimate: result.estimate });
  } catch { /* Never block use for diagnostic metadata. */ }
  return result;
}
