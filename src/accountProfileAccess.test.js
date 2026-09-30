import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReturningUserFixture } from './demoFixture.js';
import { hydrateStoredState, saveState } from './domain.js';
import { ensureAccountSyncLedger, readAccountSyncLedger } from './accountSyncOutbox.js';
import { openProtectedAccount } from './accountProfileAccess.js';
import { accountProfileSlot, newSeparateProfileSlot, switchProfileSlot } from './accountProfileSlots.js';
import { ACTIVE_PROFILE_SLOT_KEY, ACCOUNT_SLOT_PREFIX, PROFILE_SLOT_PREFIX } from './profileSlotKeys.js';
import { PRIMARY_KEY, RECOVERY_KEY, checkpointCurrentLocalState, readLocalState } from './localStateStorage.js';
import { resolveAccountStartup } from './accountStartup.js';
import { syncEntities } from './accountSyncModel.js';

const signedOut = 'rook-account-signed-out-v1';
const emptyRemote = () => ({ profileId: null, accountSchemaVersion: null, entities: new Map() });
const remoteOf = state => ({ profileId: state.profile.id, accountSchemaVersion: 1,
  entities: new Map([...syncEntities(state)].map(([key, entity]) => [key,
    { ...entity, profileId: state.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }])) });
function setup() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key) };
  const state = createReturningUserFixture(2);
  expect(saveState(state, { storage, reason: 'test-profile-owner' })).toBe(true);
  checkpointCurrentLocalState(storage, hydrateStoredState);
  expect(storage.getItem(RECOVERY_KEY)).toBeTruthy();
  ensureAccountSyncLedger(storage, state.profile.id, { accountUid: 'owner-a' });
  storage.setItem(signedOut, 'true');
  const before = Object.fromEntries(data), primary = storage.getItem(PRIMARY_KEY), backup = storage.getItem(RECOVERY_KEY);
  const client = { auth: { currentUser: null }, authApi: {
    GoogleAuthProvider: class { setCustomParameters(value) { this.parameters = value; } },
    signInWithPopup: vi.fn(async (auth) => {
      auth.currentUser = { uid: 'owner-a', isAnonymous: false, email: 'synthetic@example.test' };
      return { user: auth.currentUser };
    }),
    signOut: vi.fn(async auth => { auth.currentUser = null; }),
  } };
  const choose = uid => client.authApi.signInWithPopup.mockImplementation(async auth => {
    auth.currentUser = { uid, isAnonymous: false }; return { user: auth.currentUser };
  });
  const readCloud = vi.fn(async () => emptyRemote());
  const open = (options = {}) => openProtectedAccount({ storage, client, profileId: state.profile.id, readCloud, ...options });
  const intact = () => {
    expect(storage.getItem(PRIMARY_KEY)).toBe(primary);
    expect(storage.getItem(RECOVERY_KEY)).toBe(backup);
    expect(storage.getItem(signedOut)).toBe('true');
    expect(readAccountSyncLedger(storage, state.profile.id).accountUid).toBe('owner-a');
  };
  return { data, storage, state, before, primary, backup, client, choose, readCloud, open, intact };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('protected profile account access (no implicit merge or first run)', () => {
  it('opens only the owner from the primary action, retaining exact persisted IDs/data/backup', async () => {
    const x = setup();
    expect(await x.open()).toMatchObject({ status: 'unlocked' });
    expect(x.storage.getItem(PRIMARY_KEY)).toBe(x.primary);
    expect(x.storage.getItem(RECOVERY_KEY)).toBe(x.backup);
    expect(x.storage.getItem(signedOut)).toBeNull();
    expect(x.readCloud).not.toHaveBeenCalled();
    expect(x.client.authApi.signInWithPopup.mock.calls[0][1].parameters).toEqual({ prompt: 'select_account' });
  });
  it('wrong owner on primary action fails closed and asks for the explicit another-profile route', async () => {
    const x = setup(); x.choose('owner-b');
    await expect(x.open()).rejects.toThrow('Use another ROOK profile');
    x.intact(); expect(x.client.authApi.signOut).toHaveBeenCalledOnce();
    expect(x.readCloud).not.toHaveBeenCalled();
  });
  it('opens an existing cloud B in isolation and later restores archived A without losing B', async () => {
    const x = setup(), b = createReturningUserFixture(1); b.profile.id = 'profile-b';
    x.choose('owner-b'); x.readCloud.mockResolvedValue(remoteOf(b));
    expect(await x.open({ allowAnother: true })).toMatchObject({ status: 'switched-account', profileId: b.profile.id });
    const opened = readLocalState(x.storage, hydrateStoredState).state;
    expect(opened.workouts.map(w => w.id)).toEqual(b.workouts.map(w => w.id));
    expect(accountProfileSlot(x.storage, 'owner-a').bundle[PRIMARY_KEY]).toBe(x.primary);
    expect(accountProfileSlot(x.storage, 'owner-a').bundle[RECOVERY_KEY]).toBe(x.backup);
    const bRaw = x.storage.getItem(PRIMARY_KEY);
    x.storage.setItem(signedOut, 'true'); x.choose('owner-a'); x.readCloud.mockClear();
    await x.open({ profileId: b.profile.id, allowAnother: true });
    expect(x.storage.getItem(PRIMARY_KEY)).toBe(x.primary);
    expect(accountProfileSlot(x.storage, 'owner-b').bundle[PRIMARY_KEY]).toBe(bRaw);
    expect(x.readCloud).not.toHaveBeenCalled();
  });
  it('establishes a new account only from explicit verified emptiness, and rechecks on reload', async () => {
    const x = setup(); x.choose('new-owner');
    await x.open({ allowAnother: true });
    const startup = readLocalState(x.storage, hydrateStoredState);
    expect(startup.state.profile.id).not.toBe(x.state.profile.id);
    expect(startup.state.workouts).toEqual([]);
    expect(JSON.parse(x.storage.getItem(ACTIVE_PROFILE_SLOT_KEY)).parentProfileId).toBe(x.state.profile.id);
    expect(readAccountSyncLedger(x.storage, startup.state.profile.id).accountUid).toBe('new-owner');
    expect(accountProfileSlot(x.storage, 'owner-a').bundle[PRIMARY_KEY]).toBe(x.primary);
    const options = { storage: x.storage, configured: () => true, getClient: async () => x.client,
      resolveIdentity: async () => ({ user: x.client.auth.currentUser, created: false }),
      getAdapter: () => ({ read: x.readCloud }) };
    expect(await resolveAccountStartup(startup, options)).toMatchObject({ status: 'ready', firstRunVerified: true, accountCheck: 'verified-new-account' });
    x.readCloud.mockRejectedValue(new Error('Offline'));
    expect(await resolveAccountStartup(startup, options)).toMatchObject({ status: 'account-recovery' });
    x.readCloud.mockResolvedValue(emptyRemote());
    x.client.auth.currentUser = { uid: 'wrong-owner' };
    expect(await resolveAccountStartup(startup, options)).toMatchObject({ status: 'account-recovery', code: 'account-identity-conflict' });
  });
  it('does not accept an arbitrary empty ledger as proof of a legitimate new account', async () => {
    const x = setup(); x.choose('new-owner'); await x.open({ allowAnother: true });
    const marker = JSON.parse(x.storage.getItem(ACTIVE_PROFILE_SLOT_KEY)); delete marker.creation;
    x.storage.setItem(ACTIVE_PROFILE_SLOT_KEY, JSON.stringify(marker));
    const result = await resolveAccountStartup(readLocalState(x.storage, hydrateStoredState), {
      storage: x.storage, configured: () => true, getClient: async () => x.client,
      resolveIdentity: async () => ({ user: x.client.auth.currentUser, created: false }),
      getAdapter: () => ({ read: x.readCloud }),
    });
    expect(result).toMatchObject({ status: 'account-recovery', code: 'account-identity-conflict' });
  });
  it.each([
    ['unknown', undefined], ['missing anchor metadata', { entities: new Map() }],
    ['future schema', { ...emptyRemote(), accountSchemaVersion: 999 }],
    ['orphan entity', { ...emptyRemote(), entities: new Map([['unknown', {}]]) }],
    ['broken existing profile', { profileId: 'broken', accountSchemaVersion: 1, entities: new Map() }],
    ['unsupported existing profile', { profileId: 'future', accountSchemaVersion: 999, entities: new Map() }],
  ])('never turns %s into onboarding', async (_, remote) => {
    const x = setup(); x.choose('owner-b'); x.readCloud.mockResolvedValue(remote);
    await expect(x.open({ allowAnother: true })).rejects.toThrow(); x.intact();
    expect(Object.fromEntries(x.data)).toEqual(x.before);
  });
  it('keeps the locked source after a network failure or cancelled provider popup', async () => {
    const x = setup(); x.choose('owner-b'); x.readCloud.mockRejectedValue(new Error('Network unavailable'));
    await expect(x.open({ allowAnother: true })).rejects.toThrow('Network unavailable'); x.intact();
    x.client.authApi.signInWithPopup.mockRejectedValue(Object.assign(new Error('Cancelled'), { code: 'auth/popup-closed-by-user' }));
    await expect(x.open({ allowAnother: true })).rejects.toThrow('Cancelled'); x.intact();
  });
  it('times out without creating a namespace or accepting a late response', async () => {
    vi.useFakeTimers();
    const x = setup(); x.choose('owner-b'); let finish;
    x.readCloud.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const result = x.open({ allowAnother: true, timeoutMs: 25 });
    const rejected = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(25); await rejected;
    finish(emptyRemote()); await Promise.resolve(); x.intact();
    expect(Object.fromEntries(x.data)).toEqual(x.before);
  });
  it.each(['uid', 'epoch', 'generation'])('rejects stale %s after a delayed account read', async kind => {
    const x = setup(); x.choose('owner-b'); let valid = true;
    x.readCloud.mockImplementation(async () => {
      if (kind === 'uid') x.client.auth.currentUser = { uid: 'newer-c' };
      if (kind === 'epoch') valid = false;
      if (kind === 'generation') expect(saveState(readLocalState(x.storage, hydrateStoredState).state,
        { storage: x.storage, reason: 'test-newer-generation' })).toBe(true);
      return emptyRemote();
    });
    await expect(x.open({ allowAnother: true, isCurrent: () => valid })).rejects.toThrow('changed during verification');
    expect(x.storage.getItem(signedOut)).toBe('true');
    expect(readLocalState(x.storage, hydrateStoredState).state.profile.id).toBe(x.state.profile.id);
    expect(x.client.authApi.signOut).not.toHaveBeenCalled();
    expect(x.storage.getItem(`${ACCOUNT_SLOT_PREFIX}owner-b`)).toBeNull();
  });
  it('rechecks after waiting for the transaction lock, before any namespace writes', async () => {
    const x = setup(); x.choose('owner-b'); let valid = true;
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (...args) => { valid = false; return args.at(-1)(); }) } });
    await expect(x.open({ allowAnother: true, isCurrent: () => valid })).rejects.toThrow('changed during verification');
    x.intact(); expect(Object.fromEntries(x.data)).toEqual(x.before);
  });
  it('uses the freshly authenticated namespace when a saved account was linked from another local profile', async () => {
    const x = setup(), separate = newSeparateProfileSlot(x.state.profile.id);
    await switchProfileSlot({ storage: x.storage, sourceProfileId: x.state.profile.id, target: separate });
    let b = readLocalState(x.storage, hydrateStoredState).state;
    b.profile.onboardingComplete = true; b.profile.noPlanReceipt = { kind: 'first-run' }; b.profile.preferredTrainingStyle = 'freestyle';
    expect(saveState(b, { storage: x.storage, reason: 'test-linked-separate' })).toBe(true);
    ensureAccountSyncLedger(x.storage, separate.profileId, { accountUid: 'linked-b' });
    const bRaw = x.storage.getItem(PRIMARY_KEY);
    await switchProfileSlot({ storage: x.storage, sourceProfileId: separate.profileId,
      target: accountProfileSlot(x.storage, 'owner-a'), targetSignedOut: true });
    x.choose('linked-b');
    await x.open({ allowAnother: true });
    expect(x.storage.getItem(PRIMARY_KEY)).toBe(bRaw);
    expect(JSON.parse(x.storage.getItem(ACTIVE_PROFILE_SLOT_KEY)).authAppName).toBe('rook-sync');
    expect(x.readCloud).not.toHaveBeenCalled();
    expect(x.storage.getItem(`${PROFILE_SLOT_PREFIX}${x.state.profile.id}`)).toBeTruthy();
  });
});
