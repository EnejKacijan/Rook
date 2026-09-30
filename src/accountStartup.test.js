import { describe, expect, it, vi } from 'vitest';
import { blankState, hydrateStoredState, saveState } from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';
import { syncEntities } from './accountSyncModel.js';
import { resolveAccountStartup } from './accountStartup.js';
import { readLocalState } from './localStateStorage.js';
import { writeFirstRunAccountClaim } from './firstRunAccountClaim.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const cloudProfile = () => {
  const state = blankState();
  state.profile.onboardingComplete = true;
  state.program = { days: [] };
  const entities = new Map([...syncEntities(state)].map(([key, entity]) => [key, { ...entity, profileId: state.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }]));
  return { profileId: state.profile.id, accountSchemaVersion: 1, entities };
};
const emptyCloud = () => ({ profileId: null, accountSchemaVersion: null, entities: new Map() });
function harness({ startup = { status: 'empty' }, user = { uid: 'anon-1', isAnonymous: true }, created = false, remote = emptyCloud(), readError } = {}) {
  const store = storage();
  const client = { auth: { currentUser: user } };
  let local = startup;
  const save = vi.fn(next => { local = { status: 'ready', state: next, generation: 1 }; return true; });
  const options = {
    storage: store, configured: () => true, getClient: async () => client,
    resolveIdentity: async () => ({ user, created }),
    getAdapter: () => ({ read: async () => { if (readError) throw readError; return remote; } }),
    readLocal: () => local, checkpoint: vi.fn(), save,
  };
  return { store, client, options, save, setLocal: next => { local = next; } };
}

describe('account startup first-run boundary', () => {
  it('re-proves a signed-in empty account on reload without writing a fabricated profile', async () => {
    const user = { uid: 'google-1', isAnonymous: false }, h = harness({ user });
    writeFirstRunAccountClaim(h.store, { uid: user.uid, profileId: 'original-first-run-id' });
    const result = await resolveAccountStartup({ status: 'empty' }, h.options);
    expect(result).toMatchObject({ status: 'empty', firstRunVerified: true,
      accountCheck: 'verified-new-account', firstRunProfileId: 'original-first-run-id' });
    expect(h.save).not.toHaveBeenCalled();
  });
  it('fails closed when a different account or cloud profile appears after empty-account sign-in', async () => {
    const user = { uid: 'google-1', isAnonymous: false }, h = harness({ user });
    writeFirstRunAccountClaim(h.store, { uid: user.uid, profileId: 'original-first-run-id' });
    h.client.auth.currentUser = { uid: 'other-google', isAnonymous: false };
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'stale-account-check' });
    h.client.auth.currentUser = user;
    h.options.getAdapter = () => ({ read: async () => cloudProfile() });
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'account-identity-conflict' });
    expect(h.save).not.toHaveBeenCalled();
  });
  it('keeps completed first-run data protected if its signed-in account becomes unverifiable', async () => {
    const user = { uid: 'google-1', isAnonymous: false }, state = createReturningUserFixture(1), h = harness({ user });
    writeFirstRunAccountClaim(h.store, { uid: user.uid, profileId: state.profile.id });
    const startup = { status: 'ready', state, generation: 2 };
    h.client.auth.authStateReady = async () => {};
    h.options.getAdapter = () => ({ read: async () => { throw Error('offline'); } });
    expect(await resolveAccountStartup(startup, h.options)).toMatchObject({ status: 'account-recovery', code: 'account-check-failed' });
    expect(h.save).not.toHaveBeenCalled();
  });
  it('opens an established local profile without waiting for failed Auth or Firestore', async () => {
    const state = cloudProfile();
    const local = blankState(); local.profile.onboardingComplete = true; local.program = { days: [] };
    const startup = { status: 'ready', state: local, generation: 3 };
    const result = await resolveAccountStartup(startup, { configured: () => true, getClient: () => { throw new Error('Auth offline'); } });
    expect(result).toMatchObject({ status: 'ready', firstRunVerified: false });
    expect(state.profileId).toBeTruthy();
  });

  it('waits for auth and cloud proof before allowing a genuinely new first run', async () => {
    let resolveAuth;
    const h = harness({ created: true });
    h.options.resolveIdentity = () => new Promise(resolve => { resolveAuth = resolve; });
    let settled = false;
    const pending = resolveAccountStartup({ status: 'empty' }, h.options).then(result => { settled = true; return result; });
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    resolveAuth({ user: h.client.auth.currentUser, created: true });
    expect(await pending).toMatchObject({ status: 'empty', firstRunVerified: true, accountCheck: 'cloud-empty' });
  });

  it.each([
    ['anonymous', { uid: 'anon-1', isAnonymous: true }],
    ['linked Google', { uid: 'google-1', isAnonymous: false, email: 'person@example.com' }],
  ])('restores an empty device from the same %s account before onboarding', async (_, user) => {
    const remote = cloudProfile(), h = harness({ user, remote });
    const result = await resolveAccountStartup({ status: 'empty' }, h.options);
    expect(result).toMatchObject({ status: 'ready', restoredFromCloud: true, firstRunVerified: false });
    expect(result.state.profile.id).toBe(remote.profileId);
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('restores real saved ROOK data through the verified P0 local writer before opening the app', async () => {
    const state = createReturningUserFixture(2), store = storage();
    const remote = { profileId: state.profile.id, accountSchemaVersion: 1,
      entities: new Map([...syncEntities(state)].map(([key, entity]) => [key, { ...entity, profileId: state.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }])) };
    expect(readLocalState(store, hydrateStoredState).status).toBe('empty');
    const user = { uid: 'persisted-anonymous', isAnonymous: true }, client = { auth: { currentUser: user } };
    const result = await resolveAccountStartup({ status: 'empty' }, {
      storage: store, configured: () => true, getClient: async () => client,
      resolveIdentity: async () => ({ user, created: false }), getAdapter: () => ({ read: async () => remote }),
      save: (next, options) => saveState(next, { ...options, storage: store }),
    });
    expect(result).toMatchObject({ status: 'ready', restoredFromCloud: true, firstRunVerified: false });
    expect(readLocalState(store, hydrateStoredState).state.workouts.map(workout => workout.id)).toEqual(state.workouts.map(workout => workout.id));
  });

  it('checkpoints a pristine saved default before restoring its authenticated cloud profile', async () => {
    const store = storage(), empty = blankState(), populated = createReturningUserFixture(2);
    expect(saveState(empty, { storage: store, reason: 'first-run:user-confirmed' })).toBe(true);
    const startup = readLocalState(store, hydrateStoredState);
    const remote = { profileId: populated.profile.id, accountSchemaVersion: 1,
      entities: new Map([...syncEntities(populated)].map(([key, entity]) => [key, { ...entity, profileId: populated.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }])) };
    const user = { uid: 'same-anonymous-account', isAnonymous: true }, client = { auth: { currentUser: user } };
    const result = await resolveAccountStartup(startup, {
      storage: store, configured: () => true, getClient: async () => client,
      resolveIdentity: async () => ({ user, created: false }), getAdapter: () => ({ read: async () => remote }),
      save: (next, options) => saveState(next, { ...options, storage: store }),
    });
    expect(result).toMatchObject({ status: 'ready', restoredFromCloud: true });
    expect(store.getItem('rook-recovery-v1')).not.toBeNull();
    expect(readLocalState(store, hydrateStoredState).state.profile.id).toBe(populated.profile.id);
  });

  it('never treats cloud errors, unknown schemas or incomplete cloud data as empty', async () => {
    const failure = harness({ readError: Object.assign(new Error('offline'), { code: 'unavailable' }) });
    expect(await resolveAccountStartup({ status: 'empty' }, failure.options)).toMatchObject({ status: 'account-recovery', code: 'unavailable' });
    const authFailure = harness();
    authFailure.options.resolveIdentity = async () => { throw Object.assign(new Error('auth offline'), { code: 'auth/network-request-failed' }); };
    expect(await resolveAccountStartup({ status: 'empty' }, authFailure.options)).toMatchObject({ status: 'account-recovery', code: 'auth/network-request-failed' });
    const future = harness({ remote: { profileId: 'p', accountSchemaVersion: 99, entities: new Map() } });
    expect(await resolveAccountStartup({ status: 'empty' }, future.options)).toMatchObject({ status: 'account-recovery', code: 'cloud-schema-unsupported' });
    const recordFuture = cloudProfile();
    recordFuture.entities.values().next().value.syncSchemaVersion = 99;
    const recordFutureHarness = harness({ remote: recordFuture });
    expect(await resolveAccountStartup({ status: 'empty' }, recordFutureHarness.options)).toMatchObject({ status: 'account-recovery', code: 'cloud-schema-unsupported' });
    const incomplete = harness({ remote: { profileId: 'p', accountSchemaVersion: 1, entities: new Map() } });
    expect(await resolveAccountStartup({ status: 'empty' }, incomplete.options)).toMatchObject({ status: 'account-recovery', code: 'cloud-response-invalid' });
    const unknownExistence = harness({ remote: { accountSchemaVersion: null, entities: new Map() } });
    expect(await resolveAccountStartup({ status: 'empty' }, unknownExistence.options)).toMatchObject({ status: 'account-recovery', code: 'cloud-response-invalid' });
    const timedOut = harness();
    timedOut.options.getAdapter = () => ({ read: () => new Promise(() => {}) });
    expect(await resolveAccountStartup({ status: 'empty' }, { ...timedOut.options, timeoutMs: 5 })).toMatchObject({ status: 'account-recovery', code: 'account-timeout' });
  });

  it('blocks account lineage conflicts and signed-out local profiles', async () => {
    const remote = cloudProfile(), h = harness({ remote });
    h.store.setItem('rook-account-sync-ledger-v1', JSON.stringify({ version: 1, profileId: 'other', accountUid: 'anon-1' }));
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'account-identity-conflict' });
    h.store.removeItem('rook-account-sync-ledger-v1');
    h.store.setItem('rook-account-signed-out-v1', 'true');
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'signed-out-account' });
    expect(h.save).not.toHaveBeenCalled();
  });

  it('rejects stale cloud results after either auth identity or local generation changes', async () => {
    const remote = cloudProfile(), h = harness({ remote });
    h.options.getAdapter = () => ({ read: async () => { h.client.auth.currentUser = { uid: 'google-other', isAnonymous: false }; return remote; } });
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'stale-account-check' });
    expect(h.save).not.toHaveBeenCalled();
    h.client.auth.currentUser = { uid: 'anon-1', isAnonymous: true };
    h.options.getAdapter = () => ({ read: async () => { h.setLocal({ status: 'ready', state: blankState(), generation: 1 }); return remote; } });
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'stale-local-check' });
    h.setLocal({ status: 'empty' });
    h.options.getAdapter = () => ({ read: async () => { h.store.setItem('lift-v2-state', '{"changed":true}'); return remote; } });
    expect(await resolveAccountStartup({ status: 'empty' }, h.options)).toMatchObject({ status: 'account-recovery', code: 'stale-local-check' });
  });

  it('requires explicit fresh-start choice for an old anonymous identity with empty cloud', async () => {
    const h = harness();
    h.client.authApi = { GoogleAuthProvider: class GoogleAuthProvider {}, signInWithPopup: vi.fn(async () => ({ user: { uid: 'linked-google' } })) };
    const pending = await resolveAccountStartup({ status: 'empty' }, h.options);
    expect(pending).toMatchObject({ status: 'account-recovery', code: 'unverified-anonymous-first-run', allowStartFresh: true });
    await pending.restoreWithGoogle();
    expect(h.client.authApi.signInWithPopup).toHaveBeenCalledWith(h.client.auth, expect.any(h.client.authApi.GoogleAuthProvider));
    expect(await resolveAccountStartup({ status: 'empty' }, { ...h.options, allowStartFresh: true })).toMatchObject({ status: 'empty', firstRunVerified: true });
    const newIdentity = harness({ created: true });
    expect(await resolveAccountStartup({ status: 'empty' }, newIdentity.options)).toMatchObject({ status: 'empty', firstRunVerified: true });
  });

  it('keeps corrupt local hydration in recovery without consulting cloud', async () => {
    const startup = { status: 'error', code: 'parse-error', recovery: { generation: 2 } };
    expect(await resolveAccountStartup(startup, { getClient: () => { throw new Error('must not run'); } })).toBe(startup);
  });

  it('offers an explicit cloud restore for a missing primary with no checkpoint and a proven persisted UID', async () => {
    const store = storage(), state = createReturningUserFixture(2);
    expect(saveState(state, { storage: store, reason: 'fixture' })).toBe(true);
    store.removeItem('lift-v2-state');
    store.removeItem('rook-recovery-v1');
    const startup = readLocalState(store, hydrateStoredState);
    expect(startup).toMatchObject({ status: 'error', code: 'primary-missing' });
    const remote = { profileId: state.profile.id, accountSchemaVersion: 1,
      entities: new Map([...syncEntities(state)].map(([key, entity]) => [key, { ...entity, profileId: state.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }])) };
    const user = { uid: 'persisted-anonymous', isAnonymous: true }, client = { auth: { currentUser: user } };
    const options = { storage: store, configured: () => true, getClient: async () => client,
      resolveIdentity: async (_, params) => { expect(params).toEqual({ allowAnonymous: false }); return { user, created: false }; },
      getAdapter: () => ({ read: async () => remote }),
      save: (next, params) => saveState(next, { ...params, storage: store }),
    };
    const offer = await resolveAccountStartup(startup, options);
    expect(offer).toMatchObject({ status: 'account-recovery', code: 'cloud-recovery-available', cloudFound: true });
    expect(store.getItem('lift-v2-state')).toBeNull();
    await offer.restoreCloud();
    expect(readLocalState(store, hydrateStoredState).state.workouts.map(workout => workout.id)).toEqual(state.workouts.map(workout => workout.id));
  });

  it('keeps corrupt primary bytes untouched even if cloud restoration exists', async () => {
    const store = storage(), raw = '{broken';
    store.setItem('lift-v2-state', raw);
    const startup = readLocalState(store, hydrateStoredState);
    expect(startup.status).toBe('error');
    expect(await resolveAccountStartup(startup, { storage: store, configured: () => true, getClient: () => { throw new Error('must not run'); } })).toBe(startup);
    expect(store.getItem('lift-v2-state')).toBe(raw);
  });
  it('offers Google sign-in without starting setup when a missing local profile has no persisted credential', async () => {
    const store = storage(), state = createReturningUserFixture(2);
    expect(saveState(state, { storage: store, reason: 'fixture' })).toBe(true);
    store.removeItem('lift-v2-state');
    store.removeItem('rook-recovery-v1');
    const startup = readLocalState(store, hydrateStoredState);
    const auth = { currentUser: null }, authApi = { GoogleAuthProvider: class GoogleAuthProvider {}, signInWithPopup: vi.fn(async () => ({ user: { uid: 'linked' } })) };
    const result = await resolveAccountStartup(startup, { storage: store, configured: () => true,
      getClient: async () => ({ auth, authApi }), resolveIdentity: async () => ({ user: null, created: false }),
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('primary-missing');
    await result.restoreWithGoogle();
    expect(authApi.signInWithPopup).toHaveBeenCalledOnce();
    expect(store.getItem('lift-v2-state')).toBeNull();
  });
});
