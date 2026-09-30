import { describe, expect, it } from 'vitest';
import { ACCOUNT_SYNC_SCHEMA, applySyncDownloads, classifySyncBootstrap, materializeCloudProfile, planSyncReconciliation, syncEntities, syncMutationId } from './accountSyncModel.js';
import { blankState } from './domain.js';

const state = (id = 'profile-a', workouts = []) => ({ schemaVersion: 3, profile: { id, onboardingComplete: true }, program: { days: [] }, workouts });
const records = value => syncEntities(value);
const cloudOf = (local, revision = 1) => new Map([...local].map(([key, entity]) => [key, { ...entity, revision, syncSchemaVersion: ACCOUNT_SYNC_SCHEMA, deleted: false }]));
const ackOf = cloud => new Map([...cloud].map(([key, entity]) => [key, { revision: entity.revision, digest: entity.digest }]));
const proposal = (local, cloud, acknowledged, explicitDeletes) => planSyncReconciliation({ localEntities: local, cloudEntities: cloud, acknowledged, explicitDeletes });
const workout = (id, reps = 8) => ({ id, exercises: [{ id: 'exercise-1', sets: [{ id: 'set-1', reps, completed: true }] }] });

describe('account sync reconciliation safety', () => {
  it('keeps stable workout IDs and rejects duplicate IDs', () => {
    const values = records(state('profile-a', [workout('workout-1')]));
    expect(values.get('workouts:"workout-1"').value.id).toBe('workout-1');
    expect(() => records(state('profile-a', [workout('workout-1'), workout('workout-1')]))).toThrow(/duplicate/);
  });
  it('projects nested undefined fields to the same JSON representation as local persistence', () => {
    const local = state('profile-a', [{ ...workout('w'), optional: undefined, exercises: [{ id: 'exercise-1', sets: [{ id: 'set-1', reps: 8, rir: undefined }] }] }]);
    local.program.days = [{ id: 'day-1', workoutName: undefined }];
    const cloud = records(local);
    expect(cloud.get('program:"root"').value.days[0]).toEqual({ id: 'day-1' });
    expect(cloud.get('workouts:"w"').value.exercises[0].sets[0]).toEqual({ id: 'set-1', reps: 8 });
    expect(local.workouts[0].exercises[0].sets[0]).toHaveProperty('rir');
    expect(JSON.stringify(cloud.get('workouts:"w"').value)).toBe(JSON.stringify(local.workouts[0]));
  });
  it('accepts Firestore values returned with reordered object keys', () => {
    const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])]))
        : value;
    const local = records(state('profile-a', [workout('w')]));
    const cloud = new Map([...cloudOf(local)].map(([entityKey, entity]) => [entityKey, { ...entity, value: reverseKeys(entity.value) }]));
    const plan = proposal(new Map(), cloud);
    expect(plan.blocked).toEqual([]);
    expect(plan.download).toHaveLength(local.size);
  });
  it('does not send local photo references or blobs in the workout entity', () => {
    const local = state('profile-a', [{ ...workout('w'), photoId: 'device-only-photo' }]);
    expect(records(local).get('workouts:"w"').value.photoId).toBeUndefined();
    const cloud = cloudOf(records(state('profile-a', [workout('w', 10)])));
    const remote = cloud.get('workouts:"w"');
    const applied = applySyncDownloads(local, [{ key: 'workouts:"w"', operation: 'upsert', entity: remote }]);
    expect(applied.workouts[0].photoId).toBe('device-only-photo');
  });
  it('never treats missing auth as an empty ROOK profile', () => {
    expect(classifySyncBootstrap({ localState: state(), accountVerified: false })).toBe('awaiting-verified-account');
  });
  it('classifies local populated / cloud empty as upload after checkpoint', () => {
    expect(classifySyncBootstrap({ localState: state('profile-a', [workout('w')]), cloudEntities: new Map(), accountVerified: true })).toBe('upload-local-after-checkpoint');
  });
  it('requires recovery for local empty / cloud populated', () => {
    const local = { schemaVersion: 3, profile: { id: 'profile-a', onboardingComplete: false }, workouts: [] };
    const cloud = cloudOf(records(state('profile-a', [workout('w')])));
    expect(classifySyncBootstrap({ localState: local, cloudEntities: cloud, cloudProfileId: 'profile-a', accountVerified: true })).toBe('cloud-recovery-required');
    expect(classifySyncBootstrap({ localState: local, cloudEntities: cloud, cloudProfileId: 'profile-b', accountVerified: true })).toBe('cloud-recovery-required');
  });
  it('restores a new device from a verified Google account without changing stable IDs', () => {
    const empty = blankState();
    const populated = { ...empty, profile: { ...empty.profile, id: 'profile-cloud', onboardingComplete: true }, program: { days: [] }, workouts: [workout('original-workout')] };
    const remote = { profileId: 'profile-cloud', accountSchemaVersion: 1, entities: new Map([...cloudOf(records(populated))].map(([key, record]) => [key, { ...record, profileId: 'profile-cloud' }])) };
    const restored = materializeCloudProfile(empty, remote);
    expect(restored.profile.id).toBe('profile-cloud');
    expect(restored.workouts.map(item => item.id)).toEqual(['original-workout']);
    expect(() => materializeCloudProfile(populated, remote)).toThrow(/empty local/);
    expect(() => materializeCloudProfile(empty, { ...remote, profileId: 'another-profile' })).toThrow();
  });
  it('round-trips an intentional no-plan profile and a stopped plan through cloud recovery', () => {
    const empty=blankState();
    const noPlan={...empty,profile:{...empty.profile,id:'no-plan-profile',onboardingComplete:true,preferredTrainingStyle:'own-workouts',noPlanReceipt:{kind:'first-run'}},workouts:[{...workout('freestyle-1'),source:'freestyle'}]};
    const projected=records(noPlan);
    expect(projected.get('program:"root"').value).toEqual({__rookSyncNull:1});
    const remote={profileId:'no-plan-profile',accountSchemaVersion:1,entities:new Map([...cloudOf(projected)].map(([entityKey,record])=>[entityKey,{...record,profileId:'no-plan-profile'}]))};
    const restored=materializeCloudProfile(empty,remote);
    expect(restored.program).toBeNull();
    expect(restored.profile.onboardingComplete).toBe(true);
    expect(restored.workouts.map(item=>item.id)).toEqual(['freestyle-1']);
  });
  it('restores workout and template order independently of Firestore document order', () => {
    const empty = blankState();
    const template = id => ({ schemaVersion: 1, id, name: id, revision: 1, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', exercises: [{ id: `exercise-${id}`, exerciseId: 'bench-press', sets: [{ id: `set-${id}` }] }] });
    const populated = {
      ...empty,
      profile: { ...empty.profile, id: 'profile-ordered', onboardingComplete: true },
      program: { days: [] },
      workouts: [workout('later-first'), workout('earlier-second')],
      savedWorkoutTemplates: [template('template-z'), template('template-a')],
    };
    const reversed = new Map([...cloudOf(records(populated))].reverse().map(([entityKey, record]) => [entityKey, { ...record, profileId: 'profile-ordered' }]));
    const restored = materializeCloudProfile(empty, { profileId: 'profile-ordered', accountSchemaVersion: 1, entities: reversed });
    expect(restored.workouts.map(item => item.id)).toEqual(['later-first', 'earlier-second']);
    expect(restored.savedWorkoutTemplates.map(item => item.id)).toEqual(['template-z', 'template-a']);
  });
  it('blocks a different lineage even if both sides have training history', () => {
    expect(classifySyncBootstrap({ localState: state('profile-a', [workout('w')]), cloudProfileId: 'profile-b', cloudEntities: cloudOf(records(state('profile-b'))), accountVerified: true })).toBe('different-lineage');
  });
  it('blocks cloud recovery without a verified cloud lineage anchor', () => {
    expect(classifySyncBootstrap({ localState: state(), cloudEntities: cloudOf(records(state())), accountVerified: true })).toBe('cloud-identity-missing');
  });
  it('settles identical first-sync data without creating duplicate workouts', () => {
    const local = records(state('profile-a', [workout('w')]));
    const result = proposal(local, cloudOf(local));
    expect(result.upload).toHaveLength(0);
    expect(result.download).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.settled).toHaveLength(local.size);
  });
  it('reconciles nonconflicting changes from two devices independently', () => {
    const base = records(state('profile-a', [workout('old')]));
    const cloud = cloudOf(base), acknowledged = ackOf(cloud);
    const local = records(state('profile-a', [workout('old'), workout('device-a')]));
    const remote = records(state('profile-a', [workout('device-b')]));
    const [remoteKey, remoteValue] = [...remote].find(([key]) => key.includes('device-b'));
    cloud.set(remoteKey, { ...remoteValue, revision: 1, syncSchemaVersion: 1, deleted: false });
    const result = proposal(local, cloud, acknowledged);
    expect(result.upload.map(item => item.entity?.entityId)).toContain('device-a');
    expect(result.download.map(item => item.entity?.entityId)).toContain('device-b');
    expect(result.conflicts).toHaveLength(0);
  });
  it('detects two edits to the same workout rather than using timestamps', () => {
    const base = records(state('profile-a', [workout('w')]));
    const cloud = cloudOf(base), acknowledged = ackOf(cloud);
    const key = 'workouts:"w"';
    const remote = records(state('profile-a', [workout('w', 10)])).get(key);
    cloud.set(key, { ...remote, revision: 2, syncSchemaVersion: 1, deleted: false });
    const local = records(state('profile-a', [workout('w', 9)]));
    expect(proposal(local, cloud, acknowledged).conflicts).toContainEqual({ key, reason: 'concurrent-entity-change' });
  });
  it('detects two independently started active workouts', () => {
    const baseState = state();
    const base = records(baseState), cloud = cloudOf(base), acknowledged = ackOf(cloud);
    const a = records({ ...baseState, activeWorkout: workout('active-a') });
    const b = records({ ...baseState, activeWorkout: workout('active-b') });
    cloud.set('activeWorkout:"root"', { ...b.get('activeWorkout:"root"'), revision: 1, syncSchemaVersion: 1, deleted: false });
    expect(proposal(a, cloud, acknowledged).conflicts).toContainEqual({ key: 'activeWorkout:"root"', reason: 'unrelated-entity-changes' });
  });
  it('versions a finished active session as a null value so a stale device cannot revive it', () => {
    const baseState = state('profile-a', [workout('finished')]);
    baseState.activeWorkout = workout('active');
    const base = records(baseState), cloud = cloudOf(base), acknowledged = ackOf(cloud);
    const finished = { ...baseState, activeWorkout: null };
    const change = proposal(records(finished), cloud, acknowledged).upload.find(item => item.key === 'activeWorkout:"root"');
    expect(change).toMatchObject({ operation: 'upsert', baseRevision: 1, entity: { value: { __rookSyncNull: 1 } } });
    const remote = { ...change.entity, revision: 2, syncSchemaVersion: 1, deleted: false };
    cloud.set(change.key, remote);
    const stale = proposal(base, cloud, acknowledged);
    expect(stale.download).toContainEqual({ key: change.key, operation: 'upsert', entity: remote });
    expect(applySyncDownloads(baseState, stale.download).activeWorkout).toBeNull();
  });
  it('requires explicit delete intent, then proposes a tombstone', () => {
    const base = records(state('profile-a', [workout('w')])), cloud = cloudOf(base), acknowledged = ackOf(cloud);
    const local = records(state('profile-a'));
    expect(proposal(local, cloud, acknowledged).conflicts).toContainEqual({ key: 'workouts:"w"', reason: 'delete-intent-missing' });
    expect(proposal(local, cloud, acknowledged, new Set(['workouts:"w"'])).upload).toContainEqual({ key: 'workouts:"w"', operation: 'delete', baseRevision: 1 });
  });
  it('downloads a remote tombstone but never infers delete from a missing cloud record', () => {
    const base = records(state('profile-a', [workout('w')])), cloud = cloudOf(base), acknowledged = ackOf(cloud);
    cloud.set('workouts:"w"', { ...cloud.get('workouts:"w"'), revision: 2, digest: null, deleted: true, value: null });
    expect(proposal(base, cloud, acknowledged).download).toContainEqual({ key: 'workouts:"w"', operation: 'delete', entity: cloud.get('workouts:"w"') });
    cloud.delete('workouts:"w"');
    expect(proposal(base, cloud, acknowledged).conflicts).toContainEqual({ key: 'workouts:"w"', reason: 'cloud-record-missing' });
  });
  it('blocks newer cloud schema and gives retries the same mutation ID', () => {
    const local = records(state('profile-a', [workout('w')])), cloud = cloudOf(local);
    cloud.get('workouts:"w"').syncSchemaVersion = 2;
    expect(proposal(local, cloud).blocked).toContainEqual({ key: 'workouts:"w"', reason: 'newer-cloud-schema' });
    const mutation = { key: 'workouts:"w"', operation: 'upsert', entity: local.get('workouts:"w"') };
    const input = { profileId: 'profile-a', deviceId: 'device-a', generation: 12, proposal: mutation };
    expect(syncMutationId(input)).toBe(syncMutationId(input));
    expect(syncMutationId({ ...input, generation: 13 })).not.toBe(syncMutationId(input));
  });
  it('blocks a cloud payload whose advertised digest is false', () => {
    const local = records(state('profile-a', [workout('w')])), cloud = cloudOf(local);
    cloud.get('workouts:"w"').digest = 'tampered';
    expect(proposal(local, cloud).blocked).toContainEqual({ key: 'workouts:"w"', reason: 'invalid-cloud-record' });
  });
  it('applies a nonconflicting remote workout without changing local identity', () => {
    const local = state('profile-a', [workout('local')]);
    const remote = records(state('profile-a', [workout('remote')])).get('workouts:"remote"');
    const applied = applySyncDownloads(local, [{ key: 'workouts:"remote"', operation: 'upsert', entity: remote }]);
    expect(applied.profile.id).toBe('profile-a');
    expect(applied.workouts.map(item => item.id)).toEqual(['local', 'remote']);
  });
  it('refuses a cloud profile reset or a different profile identity', () => {
    const local = state('profile-a', [workout('w')]);
    const profile = records(state('profile-b')).get('profile:"root"');
    expect(() => applySyncDownloads(local, [{ key: 'profile:"root"', operation: 'upsert', entity: profile }])).toThrow(/lineage/);
    expect(() => applySyncDownloads(local, [{ key: 'profile:"root"', operation: 'upsert', entity: { ...profile, value: { id: 'profile-a', onboardingComplete: false } } }])).toThrow(/profile-reset-blocked/);
  });
});
