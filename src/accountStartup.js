import { blankState, hydrateStoredState, saveState } from './domain.js';
import { ACCOUNT_SYNC_SCHEMA, materializeCloudProfile } from './accountSyncModel.js';
import { ACCOUNT_SYNC_LEDGER_KEY, ensureAccountSyncLedger } from './accountSyncOutbox.js';
import { createFirebaseSyncAdapter, firebaseConfigured, getFirebaseSyncClient, resolveFirebaseIdentity } from './firebaseSyncClient.js';
import { PRIMARY_KEY, RECOVERY_KEY, checkpointCurrentLocalState, hasEstablishedData, readLocalState, withStorageTransaction } from './localStateStorage.js';
import { readProfileSlot } from './accountProfileSlots.js';
import { activeProfileSlot } from './profileSlotKeys.js';
import { clearFirstRunAccountClaim, readFirstRunAccountClaim } from './firstRunAccountClaim.js';
import { ACCOUNT_CLOUD_READ_TIMEOUT_MS } from './accountSyncTiming.js';

// Established local profiles still open without waiting for cloud.
const STARTUP_TIMEOUT_MS = ACCOUNT_CLOUD_READ_TIMEOUT_MS;
const recovery = (code, extra = {}) => ({ status: 'account-recovery', code, ...extra });
const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('Account check timed out.'), { code: 'account-timeout' })), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

// A persisted but incomplete setup can contain real answers. Only a literal
// default profile (apart from its generated ID) may be replaced automatically.
export function isPristineFirstRunState(state) {
  if (!state || state.profile?.onboardingComplete || hasEstablishedData(state)) return false;
  const baseline = hydrateStoredState(blankState());
  if (JSON.stringify({ ...state.profile, id: null }) !== JSON.stringify({ ...baseline.profile, id: null })) return false;
  const ignored = new Set(['profile', 'selectedDay', 'selectedDate', 'ai', 'dataSafety']);
  for (const [field, value] of Object.entries(state)) {
    if (!ignored.has(field) && JSON.stringify(value) !== JSON.stringify(baseline[field])) return false;
  }
  return true;
}

async function findMissingPrimaryRecovery(startup, { storage, configured, getClient, getAdapter, resolveIdentity, readLocal, save, timeoutMs }) {
  if (startup.code !== 'primary-missing' || startup.recovery) return startup;
  try { if (!configured() || storage.getItem(PRIMARY_KEY) !== null || storage.getItem(RECOVERY_KEY) !== null) return startup; }
  catch { return startup; }
  let client, identity, remote;
  try {
    client = await withTimeout(getClient(), timeoutMs);
  } catch { return startup; }
  if (!client) return startup;
  const restoreWithGoogle = () => client.authApi.signInWithPopup(client.auth, new client.authApi.GoogleAuthProvider());
  try {
    identity = await withTimeout(resolveIdentity(client, { allowAnonymous: false }), timeoutMs);
    if (!identity?.user?.uid) return { ...startup, restoreWithGoogle };
    remote = await withTimeout(getAdapter(client).read(identity.user.uid), timeoutMs);
  } catch { return { ...startup, restoreWithGoogle }; }
  const uid = identity.user.uid;
  if (client.auth.currentUser?.uid !== uid) return startup;
  if (!remote?.profileId) return { ...startup, restoreWithGoogle };
  if (remote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA || !(remote.entities instanceof Map)) return startup;
  if ([...remote.entities.values()].some(record => record?.syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA)) return startup;
  try {
    const rawLedger = storage.getItem(ACCOUNT_SYNC_LEDGER_KEY);
    if (rawLedger) {
      const ledger = JSON.parse(rawLedger);
      if (ledger.accountUid !== uid || ledger.profileId !== remote.profileId) return recovery('account-identity-conflict');
    }
    materializeCloudProfile(blankState(), remote);
  } catch { return startup; }
  return recovery('cloud-recovery-available', { cloudFound: true, restoreCloud: async () => {
    if (client.auth.currentUser?.uid !== uid) throw new Error('Account changed during recovery. No local data was replaced.');
    const fresh = await withTimeout(getAdapter(client).read(uid), timeoutMs);
    if (fresh.profileId !== remote.profileId) throw new Error('Account data changed during recovery. No local data was replaced.');
    if (fresh.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA || !(fresh.entities instanceof Map) || [...fresh.entities.values()].some(record => record?.syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA)) throw new Error('Cloud data needs review before recovery. No local data was replaced.');
    const restored = materializeCloudProfile(blankState(), fresh);
    return withStorageTransaction(() => {
      const current = readLocal(storage, hydrateStoredState);
      if (client.auth.currentUser?.uid !== uid || current.status !== 'error' || current.code !== 'primary-missing' || storage.getItem(PRIMARY_KEY) !== null || storage.getItem(RECOVERY_KEY) !== null) throw new Error('Local data changed during recovery. No data was replaced.');
      if (!save(restored, { storage, reason: 'cloud-recovery:user-confirmed', replacement: true })) throw new Error('Could not safely save restored account data.');
      ensureAccountSyncLedger(storage, restored.profile.id, { accountUid: uid });
      const verified = readLocal(storage, hydrateStoredState);
      if (verified.status !== 'ready' || verified.state.profile.id !== fresh.profileId) throw new Error('Restored data could not be verified.');
      return verified;
    });
  } });
}

// This is the only gate that authorizes mounting ROOK's first-run UI. An
// established local profile opens independently of Auth or Firestore. Empty
// local state waits for a positively verified current account/cloud result.
export async function resolveAccountStartup(startup, {
  storage = globalThis.localStorage,
  configured = firebaseConfigured,
  getClient = getFirebaseSyncClient,
  getAdapter = createFirebaseSyncAdapter,
  resolveIdentity = resolveFirebaseIdentity,
  readLocal = readLocalState,
  checkpoint = checkpointCurrentLocalState,
  save = saveState,
  timeoutMs = STARTUP_TIMEOUT_MS,
  allowStartFresh = false,
} = {}) {
  if (startup?.status === 'error') return findMissingPrimaryRecovery(startup, { storage, configured, getClient, getAdapter, resolveIdentity, readLocal, save, timeoutMs });
  if (!['empty', 'ready'].includes(startup?.status)) return startup;
  let firstRunClaim;
  try { firstRunClaim = readFirstRunAccountClaim(storage); }
  catch { return recovery('account-identity-conflict'); }
  if (startup.status === 'ready' && startup.state?.profile?.onboardingComplete) {
    if (!firstRunClaim) return { ...startup, firstRunVerified: false };
    if (firstRunClaim.profileId !== startup.state.profile.id) return recovery('account-identity-conflict');
    try {
      if (!configured()) return recovery('account-check-unavailable');
      const client = await withTimeout(getClient(), timeoutMs);
      await withTimeout(client.auth.authStateReady(), timeoutMs);
      if (client.auth.currentUser?.uid !== firstRunClaim.uid) return recovery('account-identity-conflict');
      const remote = await withTimeout(getAdapter(client).read(firstRunClaim.uid), timeoutMs);
      if (!(remote?.entities instanceof Map) ||
        (remote.profileId !== null && (typeof remote.profileId !== 'string' || remote.profileId !== firstRunClaim.profileId))
        || (!remote.profileId && (remote.accountSchemaVersion !== null || remote.entities.size))
        || (remote.profileId && (remote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA ||
          [...remote.entities.values()].some(record => record?.syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA))))
        return recovery('account-identity-conflict');
      return { ...startup, firstRunVerified: false };
    } catch (error) { return recovery(error?.code || 'account-check-failed'); }
  }
  const activeSlot = activeProfileSlot(storage);
  if (startup.status === 'ready' && activeSlot?.kind === 'separate'
      && activeSlot.profileId === startup.state?.profile?.id) {
    try {
      if (storage.getItem('rook-account-signed-out-v1') === 'true') return recovery('signed-out-account');
      const parent = readProfileSlot(storage, activeSlot.parentProfileId);
      if (!parent?.ownerUid || parent.profileId === activeSlot.profileId)
        return recovery('account-identity-conflict');
      if (configured()) {
        const client = await withTimeout(getClient(), timeoutMs);
        await withTimeout(client.auth.authStateReady(), timeoutMs);
        if (client.auth.currentUser?.uid === parent.ownerUid)
          return recovery('account-identity-conflict');
      }
      return { ...startup, firstRunVerified: true, accountCheck: 'user-confirmed-separate-profile' };
    } catch { return recovery('account-check-failed'); }
  }
  if (startup.status === 'ready' && hasEstablishedData(startup.state)) return recovery('inconsistent-local-profile');
  let initialRaw;
  try {
    initialRaw = storage.getItem(PRIMARY_KEY);
    if (storage.getItem('rook-account-signed-out-v1') === 'true') return recovery('signed-out-account');
  }
  catch { return recovery('local-storage-unavailable'); }

  let enabled;
  try { enabled = configured(); }
  catch { return recovery('account-configuration-error'); }
  if (!enabled) {
    try { if (firstRunClaim || storage.getItem(ACCOUNT_SYNC_LEDGER_KEY) !== null) return recovery('account-check-unavailable'); }
    catch { return recovery('local-storage-unavailable'); }
    return { ...startup, firstRunVerified: true, accountCheck: 'not-configured' };
  }

  let client, identity, remote;
  try {
    client = await withTimeout(getClient(), timeoutMs);
    if (!client) return recovery('account-configuration-error');
    identity = await withTimeout(resolveIdentity(client), timeoutMs);
    if (!identity?.user?.uid) return recovery('auth-unavailable');
    remote = await withTimeout(getAdapter(client).read(identity.user.uid), timeoutMs);
  } catch (error) { return recovery(error?.code || 'account-check-failed'); }

  const uid = identity.user.uid;
  if (client.auth.currentUser?.uid !== uid) return recovery('stale-account-check');
  if (firstRunClaim && (firstRunClaim.uid !== uid ||
      (startup.status === 'ready' && firstRunClaim.profileId !== startup.state.profile.id)))
    return recovery('account-identity-conflict');
  const current = readLocal(storage, hydrateStoredState);
  if (storage.getItem(PRIMARY_KEY) !== initialRaw || current.status !== startup.status ||
      (current.status === 'ready' && (current.generation !== startup.generation || current.state.profile.id !== startup.state.profile.id))) return recovery('stale-local-check');

  let ledger;
  try {
    const raw = storage.getItem(ACCOUNT_SYNC_LEDGER_KEY);
    if (raw !== null) {
      ledger = JSON.parse(raw);
      if (!ledger || ledger.version !== 1 || !ledger.profileId || !ledger.accountUid) return recovery('account-identity-conflict');
      if (ledger.accountUid !== uid) return recovery('account-identity-conflict');
    }
  } catch { return recovery('account-identity-conflict'); }
  if (!(remote?.entities instanceof Map)) return recovery('cloud-response-invalid');
  if (remote.profileId !== null && (typeof remote.profileId !== 'string' || !remote.profileId))
    return recovery('cloud-response-invalid');
  if (remote.profileId === null && remote.accountSchemaVersion !== null)
    return recovery('cloud-response-invalid');
  if (remote.accountSchemaVersion != null && remote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA) return recovery('cloud-schema-unsupported');
  if (!remote.profileId && remote.entities.size) return recovery('cloud-response-invalid');
  if ([...remote.entities.values()].some(record => record?.syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA)) return recovery('cloud-schema-unsupported', { cloudFound: true });

  if (!remote.profileId) {
    if (ledger) {
      // A new account chosen from the locked-profile flow has its own durable
      // empty slot. Re-prove cloud emptiness and ownership on every startup.
      let createdSlot;
      try { createdSlot = activeSlot?.creation === 'verified-empty-account' && readProfileSlot(storage, activeSlot.profileId); }
      catch { return recovery('account-identity-conflict'); }
      if (remote.profileId !== null || remote.accountSchemaVersion !== null || remote.entities.size
        || startup.status !== 'ready' || activeSlot?.kind !== 'account'
        || activeSlot.profileId !== startup.state.profile.id || ledger.profileId !== activeSlot.profileId
        || createdSlot?.ownerUid !== uid || createdSlot?.marker?.creation !== 'verified-empty-account')
        return recovery('account-identity-conflict');
      return { ...startup, firstRunVerified: true, accountCheck: 'verified-new-account', accountUid: uid };
    }
    // An old persisted anonymous identity with no cloud data is ambiguous.
    // The user can explicitly start fresh after seeing the recovery surface.
    if (!identity.created && identity.user.isAnonymous && !allowStartFresh) return recovery('unverified-anonymous-first-run', {
      allowStartFresh: true, verifiedEmpty: true, setupAlreadyStarted: startup.status === 'ready',
      restoreWithGoogle: () => client.authApi.signInWithPopup(client.auth, new client.authApi.GoogleAuthProvider()),
    });
    return { ...startup, firstRunVerified: true, accountCheck: firstRunClaim ? 'verified-new-account' : 'cloud-empty',
      accountUid: uid, ...(firstRunClaim && { firstRunProfileId: firstRunClaim.profileId }) };
  }
  if (firstRunClaim && remote.profileId !== firstRunClaim.profileId)
    return recovery('account-identity-conflict', { cloudFound: true });
  if (remote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA || !remote.entities.size) return recovery('cloud-response-invalid', { cloudFound: true });
  if (ledger && ledger.profileId !== remote.profileId) return recovery('account-identity-conflict', { cloudFound: true });
  if (startup.status === 'ready' && !isPristineFirstRunState(current.state)) return recovery('account-identity-conflict', { cloudFound: true });

  try {
    const base = startup.status === 'ready' ? current.state : blankState();
    const restored = materializeCloudProfile(base, remote);
    if (startup.status === 'ready') checkpoint(storage, hydrateStoredState);
    if (client.auth.currentUser?.uid !== uid) return recovery('stale-account-check', { cloudFound: true });
    const beforeWrite = readLocal(storage, hydrateStoredState);
    if (storage.getItem(PRIMARY_KEY) !== initialRaw || beforeWrite.status !== startup.status || (beforeWrite.status === 'ready' && beforeWrite.generation !== startup.generation)) return recovery('stale-local-check', { cloudFound: true });
    if (!save(restored, { reason: 'cloud-recovery:verified-account', ...(startup.status === 'ready' && { expectedGeneration: startup.generation }) })) return recovery('cloud-restore-save-failed', { cloudFound: true });
    ensureAccountSyncLedger(storage, restored.profile.id, { accountUid: uid });
    if (firstRunClaim) clearFirstRunAccountClaim(storage, uid, firstRunClaim.profileId);
    const verified = readLocal(storage, hydrateStoredState);
    if (client.auth.currentUser?.uid !== uid) return recovery('stale-account-check', { cloudFound: true });
    if (verified.status !== 'ready' || verified.state.profile.id !== remote.profileId || !verified.state.profile.onboardingComplete) return recovery('cloud-restore-verification-failed', { cloudFound: true });
    return { ...verified, firstRunVerified: false, restoredFromCloud: true };
  } catch (error) { return recovery(error?.code || 'cloud-restore-failed', { cloudFound: true }); }
}
