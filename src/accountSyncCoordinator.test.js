import { describe, expect, it, vi } from 'vitest';
import { syncEntities } from './accountSyncModel.js';
import { readAccountSyncLedger, recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
import { syncAccountOnce } from './accountSyncCoordinator.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const workout = (id, reps = 8) => ({ id, exercises: [{ id: `exercise-${id}`, sets: [{ id: `set-${id}`, reps, completed: true }] }] });
const state = (profileId = 'profile-a', workouts = [workout('w1')]) => ({ schemaVersion: 3, profile: { id: profileId, onboardingComplete: true }, program: { days: [] }, workouts });
const wrap = (local, generation = 1) => ({ status: 'ready', state: local, generation });
function fakeCloud(profileId = null, entities = new Map()) {
  let anchor = profileId;
  const records = new Map(entities);
  const calls = { read: 0, establish: 0, write: 0 };
  return {
    calls, records,
    async read() { calls.read++; return { profileId: anchor, accountSchemaVersion: anchor ? 1 : null, entities: new Map(records) }; },
    async establish(uid, id) { calls.establish++; if (anchor && anchor !== id) throw Object.assign(new Error('conflict'), { code: 'lineage-conflict' }); anchor = id; },
    async write(uid, id, proposal, mutationId) {
      calls.write++;
      if (anchor !== id) throw Object.assign(new Error('conflict'), { code: 'lineage-conflict' });
      const old = records.get(proposal.key);
      if (old?.lastMutationId === mutationId) return old;
      if ((old?.revision || 0) !== proposal.baseRevision) throw Object.assign(new Error('conflict'), { code: 'revision-conflict' });
      const record = { syncSchemaVersion: 1, profileId: id, domain: proposal.entity?.domain || proposal.key.split(':')[0], entityId: proposal.entity?.entityId || JSON.parse(proposal.key.split(':').slice(1).join(':')), ordinal: proposal.entity?.ordinal ?? old?.ordinal ?? null, revision: (old?.revision || 0) + 1, lastMutationId: mutationId, deleted: proposal.operation === 'delete', digest: proposal.entity?.digest || null, value: proposal.entity?.value || null };
      records.set(proposal.key, record);
      return record;
    },
  };
}
const cloudRecords = local => new Map([...syncEntities(local)].map(([key, entity]) => [key, { ...entity, profileId: local.profile.id, revision: 1, syncSchemaVersion: 1, lastMutationId: 'existing', deleted: false }]));
const run = (storage, local, cloud, options = {}) => syncAccountOnce({ storage, local: wrap(local, options.generation || 1), accountUid: options.accountUid === undefined ? 'auth-a' : options.accountUid, newlyCreatedAnonymous: options.newlyCreatedAnonymous ?? true, cloud, checkpoint: options.checkpoint || vi.fn(), commitRemote: options.commitRemote || vi.fn(async () => true), isCurrent: options.isCurrent || (() => true), isAccountCurrent: options.isAccountCurrent || (() => true) });

describe('local-first account sync passes', () => {
  it('does not create an old sidecar when the selected local-first profile has no ledger yet', async () => {
    const storage = new MemoryStorage();
    expect(await run(storage, state(), fakeCloud(), { isCurrent: () => false })).toMatchObject({ state: 'retry', category: 'local-changed' });
    expect([...storage.values]).toEqual([]);
  });
  it('does not acknowledge a delayed upload into a newly selected profile', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    let current = true, switchedLedger;
    const write = cloud.write;
    cloud.write = async (...args) => {
      const result = await write(...args);
      current = false;
      // Model a completed namespace switch while the old server request returns.
      storage.setItem('rook-account-sync-ledger-v1', JSON.stringify({ version: 1, profileId: 'profile-b', accountUid: 'auth-b' }));
      switchedLedger = [...storage.values];
      return result;
    };
    expect(await run(storage, local, cloud, { isCurrent: () => current })).toMatchObject({ state: 'retry', category: 'local-changed' });
    expect([...storage.values]).toEqual(switchedLedger);
  });
  it('does not acknowledge a download after its account epoch has ended', async () => {
    const storage = new MemoryStorage(), local = state(), remote = state('profile-a', [workout('w1'), workout('remote')]);
    const cloud = fakeCloud('profile-a', cloudRecords(remote));
    let current = true, before;
    const commitRemote = vi.fn(async () => { current = false; before = [...storage.values]; return true; });
    const result = await run(storage, local, cloud, { commitRemote, isAccountCurrent: () => current });
    expect(commitRemote).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ state: 'retry', category: 'account-changed' });
    expect([...storage.values]).toEqual(before);
  });
  it('bootstraps populated local data only after a checkpoint and uploads each stable entity once', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud(), checkpoint = vi.fn();
    expect((await run(storage, local, cloud, { checkpoint })).state).toBe('synced');
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(cloud.calls.write).toBe(syncEntities(local).size);
    expect(cloud.records.get('workouts:"w1"').value.id).toBe('w1');
    expect((await run(storage, local, cloud)).state).toBe('synced');
    expect(cloud.calls.write).toBe(syncEntities(local).size);
  });
  it('keeps local data and a durable outbox when offline, then uploads once after reload', async () => {
    const storage = new MemoryStorage(), local = state();
    const offline = { async read() { throw Object.assign(new Error('offline'), { code: 'unavailable' }); } };
    expect((await run(storage, local, offline)).state).toBe('offline');
    expect(readAccountSyncLedger(storage, 'profile-a').pending.length).toBeGreaterThan(0);
    const cloud = fakeCloud();
    expect((await run(storage, local, cloud)).state).toBe('synced');
    expect(readAccountSyncLedger(storage, 'profile-a').pending).toHaveLength(0);
    const count = cloud.calls.write;
    expect((await run(storage, local, cloud)).state).toBe('synced');
    expect(cloud.calls.write).toBe(count);
  });
  it('keeps the outbox retryable if connection drops during initial account creation', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    const interrupted = { ...cloud, establish: async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); } };
    expect((await run(storage, local, interrupted)).state).toBe('offline');
    expect(readAccountSyncLedger(storage, 'profile-a').pending.length).toBeGreaterThan(0);
    expect((await run(storage, local, cloud)).state).toBe('synced');
  });
  it('auth absence and blank cloud never reset an established local profile', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    expect((await run(storage, local, cloud, { accountUid: null })).state).toBe('auth-unavailable');
    expect(cloud.calls.read).toBe(0);
    expect(local.workouts).toHaveLength(1);
    const wrong = fakeCloud('other-profile');
    expect((await run(storage, local, wrong)).category).toBe('different-lineage');
    expect(local.profile.id).toBe('profile-a');
  });
  it('rejects an old account response when Auth changes during the cloud read', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    let sameAccount = true;
    const read = cloud.read;
    cloud.read = async (...args) => { const result = await read(...args); sameAccount = false; return result; };
    const result = await run(storage, local, cloud, { isCurrent: () => sameAccount });
    expect(result).toMatchObject({ state: 'retry', category: 'local-changed' });
    expect(cloud.calls.establish).toBe(0);
    expect(cloud.calls.write).toBe(0);
  });
  it('does not bind populated local data to a pre-existing empty UID without proof of ownership', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    const result = await run(storage, local, cloud, { newlyCreatedAnonymous: false });
    expect(result).toMatchObject({ state: 'needs-attention', category: 'unverified-account-binding' });
    expect(cloud.calls.establish).toBe(0);
    expect(cloud.calls.write).toBe(0);
    expect(readAccountSyncLedger(storage, 'profile-a').accountUid).toBeNull();
  });
  it('blocks account B before any cloud read after this device was bound to account A', async () => {
    const storage = new MemoryStorage(), local = state(), cloud = fakeCloud();
    expect((await run(storage, local, cloud, { accountUid: 'auth-a' })).state).toBe('synced');
    const before = cloud.calls.read;
    expect((await run(storage, local, cloud, { accountUid: 'auth-b' })).category).toBe('account-identity-conflict');
    expect(cloud.calls.read).toBe(before);
    expect(local.workouts[0].id).toBe('w1');
  });
  it('blocks a same-workout conflict before any write', async () => {
    const storage = new MemoryStorage(), local = state('profile-a', [workout('w1', 9)]);
    const cloud = fakeCloud('profile-a', cloudRecords(state('profile-a', [workout('w1', 10)])));
    expect((await run(storage, local, cloud)).state).toBe('needs-attention');
    expect(cloud.calls.write).toBe(0);
  });
  it('downloads a different stable workout with checkpoint and no ID regeneration', async () => {
    const storage = new MemoryStorage(), local = state('profile-a', [workout('local')]);
    const cloud = fakeCloud('profile-a', cloudRecords(state('profile-a', [workout('local'), workout('remote')])));
    const checkpoint = vi.fn(), commitRemote = vi.fn(async merged => { expect(merged.workouts.map(item => item.id)).toEqual(['local', 'remote']); return true; });
    const result = await run(storage, local, cloud, { checkpoint, commitRemote });
    expect(result).toMatchObject({ state: 'retry', category: 'remote-applied' });
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(commitRemote).toHaveBeenCalledOnce();
  });
  it('requires an explicit tombstone intent for a deleted completed workout', async () => {
    const storage = new MemoryStorage(), original = state();
    const cloud = fakeCloud();
    await run(storage, original, cloud);
    const without = state('profile-a', []);
    expect((await run(storage, without, cloud, { generation: 2 })).category).toBe('delete-intent-missing');
    recordAccountSyncDeleteIntent(storage, 'profile-a', 'workouts', 'w1');
    expect((await run(storage, without, cloud, { generation: 2 })).state).toBe('synced');
    expect(cloud.records.get('workouts:"w1"')).toMatchObject({ deleted: true, revision: 2, value: null });
    const afterUnrelatedEdit = { ...without, weightCheckins: [{ localDate: '2026-09-28', weightKg: 77.7 }] };
    expect((await run(storage, afterUnrelatedEdit, cloud, { generation: 3 })).state).toBe('synced');
    expect(readAccountSyncLedger(storage, 'profile-a').missingIntent).toEqual([]);
    expect(cloud.records.get('workouts:"w1"').revision).toBe(2);
    expect(cloud.records.get('weightCheckins:"2026-09-28"')).toMatchObject({ revision: 1, deleted: false });
  });
  it('does not resurrect a deletion after an in-flight first upload lands late', async () => {
    const storage = new MemoryStorage(), original = state(), cloud = fakeCloud();
    const offlineWrite = { ...cloud, write: async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); } };
    expect((await run(storage, original, offlineWrite)).state).toBe('offline');
    const removed = state('profile-a', []);
    recordAccountSyncDeleteIntent(storage, 'profile-a', 'workouts', 'w1');
    const first = await run(storage, removed, cloud, { generation: 2 });
    expect(first.state).toBe('synced');
    expect(cloud.records.has('workouts:"w1"')).toBe(false);
    // The server may have accepted the first transaction before its response
    // was lost. A later read must tombstone that exact record, not download it.
    cloud.records.set('workouts:"w1"', cloudRecords(original).get('workouts:"w1"'));
    recordAccountSyncDeleteIntent(storage, 'profile-a', 'workouts', 'w1');
    expect((await run(storage, removed, cloud, { generation: 3 })).state).toBe('synced');
    expect(cloud.records.get('workouts:"w1"').deleted).toBe(true);
  });
  it('keeps same-session and separate-active conflicts instead of overwriting', async () => {
    const original = state();original.activeWorkout = workout('active-a');
    const storage = new MemoryStorage(), cloud = fakeCloud();
    await run(storage, original, cloud);
    const other = structuredClone(original);other.activeWorkout = workout('active-b');
    const remote = cloud.records.get('activeWorkout:"root"');
    cloud.records.set('activeWorkout:"root"', { ...remote, revision: 2, value: workout('active-c'), digest: syncEntities({ ...original, activeWorkout: workout('active-c') }).get('activeWorkout:"root"').digest, lastMutationId: 'other-device' });
    expect((await run(storage, other, cloud, { generation: 2 })).category).toBe('concurrent-entity-change');
  });
  it('converges independent workout IDs from two devices without deduplicating by date or name', async () => {
    const cloud = fakeCloud(), a = new MemoryStorage(), b = new MemoryStorage();
    const base = state('profile-a', [workout('original')]);
    expect((await run(a, base, cloud)).state).toBe('synced');
    expect((await run(b, base, cloud)).state).toBe('synced');
    const deviceA = state('profile-a', [workout('original'), workout('device-a')]);
    expect((await run(a, deviceA, cloud, { generation: 2 })).state).toBe('synced');
    const deviceB = state('profile-a', [workout('original'), workout('device-b')]);
    let merged;
    expect((await run(b, deviceB, cloud, { generation: 2, commitRemote: async value => { merged = value; return true; } })).category).toBe('remote-applied');
    expect(merged.workouts.map(item => item.id)).toEqual(['original', 'device-a', 'device-b']);
    expect((await run(b, merged, cloud, { generation: 3 })).state).toBe('synced');
    expect([...cloud.records.keys()].filter(key => key.startsWith('workouts:'))).toHaveLength(3);
  });
  it('downloads a tombstone to a stale device instead of reuploading its removed workout', async () => {
    const cloud = fakeCloud(), a = new MemoryStorage(), b = new MemoryStorage(), base = state();
    await run(a, base, cloud); await run(b, base, cloud);
    recordAccountSyncDeleteIntent(a, 'profile-a', 'workouts', 'w1');
    expect((await run(a, state('profile-a', []), cloud, { generation: 2 })).state).toBe('synced');
    let merged;
    expect((await run(b, base, cloud, { generation: 2, commitRemote: async value => { merged = value; return true; } })).category).toBe('remote-applied');
    expect(merged.workouts).toEqual([]);
    expect(cloud.records.get('workouts:"w1"').deleted).toBe(true);
  });
});
