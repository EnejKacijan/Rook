// Run under the local Firebase Firestore emulator. No production credentials.
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import * as firestoreApi from 'firebase/firestore';
import { createFirebaseSyncAdapter } from './firebaseSyncClient.js';
import { materializeCloudProfile, syncEntities } from './accountSyncModel.js';
import { syncAccountOnce } from './accountSyncCoordinator.js';
import { recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
import { blankState } from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const run = emulator ? describe : describe.skip;
let env;
const account = (db, uid) => doc(db, 'rookAccounts', uid);
const entity = (db, uid, id = 'entity-1') => doc(db, 'rookAccounts', uid, 'entities', id);
const anchor = profileId => ({ syncSchemaVersion: 1, profileId, createdAt: serverTimestamp() });
const payload = (profileId, revision = 1, lastMutationId = 'a'.repeat(64), overrides = {}) => ({
  syncSchemaVersion: 1, profileId, domain: 'workouts', entityId: 'workout-1', ordinal: 0,
  revision, lastMutationId, updatedAt: serverTimestamp(), deleted: false,
  digest: 'b'.repeat(64), value: { id: 'workout-1', exercises: [] }, ...overrides,
});

run('Firestore account ownership and revision rules', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'rook-sync-rules-test',
      firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => env.clearFirestore());
  afterAll(async () => env?.cleanup());

  it('rejects unauthenticated access and all cross-user reads/writes', async () => {
    const a = env.authenticatedContext('uid-a').firestore();
    const b = env.authenticatedContext('uid-b').firestore();
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(account(a, 'uid-a'), anchor('profile-a')));
    await assertSucceeds(setDoc(entity(a, 'uid-a'), payload('profile-a')));
    await assertFails(getDoc(account(guest, 'uid-a')));
    await assertFails(getDoc(entity(guest, 'uid-a')));
    await assertFails(getDoc(account(b, 'uid-a')));
    await assertFails(getDoc(entity(b, 'uid-a')));
    await assertFails(getDocs(collection(b, 'rookAccounts', 'uid-a', 'entities')));
    await assertFails(setDoc(entity(b, 'uid-a', 'intrusion'), payload('profile-a')));
    await assertFails(setDoc(account(b, 'uid-a'), anchor('profile-b')));
  });

  it('denies unknown paths even to an authenticated account owner', async () => {
    const a = env.authenticatedContext('uid-a').firestore();
    await assertSucceeds(setDoc(account(a, 'uid-a'), anchor('profile-a')));
    await assertFails(getDoc(doc(a, 'otherData', 'uid-a')));
    await assertFails(setDoc(doc(a, 'otherData', 'uid-a'), { profileId: 'profile-a' }));
    await assertFails(getDoc(doc(a, 'rookAccounts', 'uid-a', 'unexpected', 'item')));
    await assertFails(setDoc(doc(a, 'rookAccounts', 'uid-a', 'unexpected', 'item'), { profileId: 'profile-a' }));
  });

  it('allows an anonymous authenticated UID only within its own account path', async () => {
    const anonymous = env.authenticatedContext('anonymous-uid', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertSucceeds(setDoc(account(anonymous, 'anonymous-uid'), anchor('original-profile')));
    await assertSucceeds(setDoc(entity(anonymous, 'anonymous-uid'), payload('original-profile')));
    expect((await assertSucceeds(getDoc(entity(anonymous, 'anonymous-uid')))).data().profileId).toBe('original-profile');
    await assertFails(setDoc(entity(anonymous, 'anonymous-uid', 'other'), payload('someone-else')));
  });

  it('forbids ownership-field injection, blind root overwrite and physical delete', async () => {
    const a = env.authenticatedContext('uid-a').firestore();
    await assertSucceeds(setDoc(account(a, 'uid-a'), anchor('profile-a')));
    await assertFails(setDoc(account(a, 'uid-a'), { ...anchor('profile-a'), uid: 'uid-b' }));
    await assertFails(setDoc(account(a, 'uid-a'), anchor('profile-b')));
    await assertFails(deleteDoc(account(a, 'uid-a')));
    await assertFails(setDoc(entity(a, 'uid-a'), { ...payload('profile-a'), uid: 'uid-b' }));
  });

  it('enforces monotonically increasing revisions and tombstones', async () => {
    const a = env.authenticatedContext('uid-a').firestore();
    await assertSucceeds(setDoc(account(a, 'uid-a'), anchor('profile-a')));
    const target = entity(a, 'uid-a');
    await assertSucceeds(setDoc(target, payload('profile-a')));
    await assertFails(setDoc(target, payload('profile-a', 1, 'c'.repeat(64))));
    await assertFails(setDoc(target, payload('profile-a', 3, 'c'.repeat(64))));
    await assertFails(setDoc(target, payload('profile-a', 2, 'a'.repeat(64))));
    await assertSucceeds(setDoc(target, payload('profile-a', 2, 'c'.repeat(64), { deleted: true, digest: null, value: null })));
    await assertFails(deleteDoc(target));
  });
  it('runs the production adapter transaction through owner rules with idempotent retry', async () => {
    const db = env.authenticatedContext('uid-a', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const adapter = createFirebaseSyncAdapter({ db, firestoreApi });
    await adapter.establish('uid-a', 'profile-a');
    const local = { schemaVersion: 3, profile: { id: 'profile-a', onboardingComplete: true }, program: { days: [] }, workouts: [{ id: 'workout-1', exercises: [] }] };
    const record = syncEntities(local).get('workouts:"workout-1"');
    const proposal = { key: 'workouts:"workout-1"', operation: 'upsert', entity: record, baseRevision: 0 };
    const mutationId = 'c'.repeat(64);
    expect(await adapter.write('uid-a', 'profile-a', proposal, mutationId)).toMatchObject({ revision: 1, lastMutationId: mutationId });
    expect(await adapter.write('uid-a', 'profile-a', proposal, mutationId)).toMatchObject({ revision: 1, lastMutationId: mutationId });
    await expect(adapter.write('uid-a', 'profile-a', proposal, 'd'.repeat(64))).rejects.toMatchObject({ code: 'revision-conflict' });
    const read = await adapter.read('uid-a');
    expect(read.profileId).toBe('profile-a');
    expect(read.entities.get(proposal.key)).toMatchObject({ revision: 1, digest: record.digest, deleted: false });
  });
  it('bootstraps a local training profile through the actual rules and adapter', async () => {
    const db = env.authenticatedContext('uid-sync').firestore();
    const cloud = createFirebaseSyncAdapter({ db, firestoreApi });
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const state = { schemaVersion: 3, profile: { id: 'stable-profile', onboardingComplete: true }, program: { days: [] }, workouts: [{ id: 'stable-workout', exercises: [] }] };
    let checkpoints = 0;
    const pass = () => syncAccountOnce({ storage, local: { status: 'ready', state, generation: 1 }, accountUid: 'uid-sync', newlyCreatedAnonymous: true, cloud, checkpoint: async () => { checkpoints++; }, commitRemote: async () => { throw new Error('No remote download expected.'); } });
    expect((await pass()).state).toBe('synced');
    expect(checkpoints).toBe(1);
    expect((await pass()).state).toBe('synced');
    expect((await cloud.read('uid-sync')).entities.get('workouts:"stable-workout"').value.id).toBe('stable-workout');
  });

  it('restores stable IDs and keeps a deleted workout removed on a stale device', async () => {
    const db = env.authenticatedContext('uid-two-devices').firestore();
    const cloud = createFirebaseSyncAdapter({ db, firestoreApi });
    const makeStorage = () => {
      const values = new Map();
      return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    };
    const original = createReturningUserFixture(1);
    const a = makeStorage(), b = makeStorage();
    const pass = (storage, state, generation, commitRemote = async () => { throw new Error('Unexpected remote merge.'); }) => syncAccountOnce({
      storage, local: { status: 'ready', state, generation }, accountUid: 'uid-two-devices', newlyCreatedAnonymous: true,
      cloud, checkpoint: async () => {}, commitRemote,
    });
    const initial = await pass(a, original, 1);
    expect(initial.state, initial.category).toBe('synced');
    const remote = await cloud.read('uid-two-devices');
    const restored = materializeCloudProfile(blankState(), remote);
    expect(restored.profile.id).toBe(original.profile.id);
    expect(restored.program.id).toBe(original.program.id);
    expect(restored.workouts.map(workout => workout.id)).toEqual(original.workouts.map(workout => workout.id));
    expect((await pass(b, original, 1)).state).toBe('synced');

    const removedId = original.workouts[0].id;
    recordAccountSyncDeleteIntent(a, original.profile.id, 'workouts', removedId);
    const without = { ...original, workouts: original.workouts.filter(workout => workout.id !== removedId) };
    expect((await pass(a, without, 2)).state).toBe('synced');
    expect((await cloud.read('uid-two-devices')).entities.get(`workouts:${JSON.stringify(removedId)}`)).toMatchObject({ deleted: true, revision: 2, value: null });
    let merged;
    expect((await pass(b, original, 2, async state => { merged = state; return true; })).category).toBe('remote-applied');
    expect(merged.workouts.some(workout => workout.id === removedId)).toBe(false);
    expect(merged.workouts).toHaveLength(original.workouts.length - 1);
  });
});
