import { sha256 } from '@noble/hashes/sha2.js';
import { blankState, hydrateStoredState, saveState } from './domain.js';
import { ACCOUNT_SYNC_LEDGER_KEY, ensureAccountSyncLedger, readAccountSyncLedger } from './accountSyncOutbox.js';
import { INSTALL_META_KEY, JOURNAL_KEY, PRIMARY_KEY, RECOVERY_KEY, forgetStorageSession,
  readLocalState, withStorageTransaction } from './localStateStorage.js';
import { materializeCloudProfile } from './accountSyncModel.js';
import { ACCOUNT_SLOT_PREFIX, ACTIVE_PROFILE_SLOT_KEY, PROFILE_SLOT_PREFIX,
  PROFILE_SWITCH_JOURNAL_KEY, PROFILE_SWITCHING_KEY, SEPARATE_SLOT_PREFIX,
  activeProfileSlot } from './profileSlotKeys.js';
import { FIRST_RUN_ACCOUNT_CLAIM_KEY } from './firstRunAccountClaim.js';

const SIGNED_OUT_KEY = 'rook-account-signed-out-v1';
const dataKeys = [PRIMARY_KEY, INSTALL_META_KEY, RECOVERY_KEY, JOURNAL_KEY, ACCOUNT_SYNC_LEDGER_KEY, SIGNED_OUT_KEY, FIRST_RUN_ACCOUNT_CLAIM_KEY];
const fail = message => { throw new Error(message); };
const slotKey = profileId => `${PROFILE_SLOT_PREFIX}${profileId}`;
const digest = value => Array.from(sha256(new TextEncoder().encode(value)), byte => byte.toString(16).padStart(2, '0')).join('');
const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
};
const bundleFrom = storage => Object.fromEntries(dataKeys.map(key => [key, storage.getItem(key)]));
function applyBundle(storage, bundle) {
  for (const key of dataKeys) {
    if (bundle[key] == null) storage.removeItem(key);
    else storage.setItem(key, bundle[key]);
    if (storage.getItem(key) !== bundle[key]) fail('Profile switch could not verify local data.');
  }
  forgetStorageSession(storage);
}
function createSlot(profileId, ownerUid, marker, bundle) {
  const payload = { version: 1, profileId, ownerUid, marker, bundle };
  return { ...payload, digest: digest(JSON.stringify(payload)) };
}
function validateSlot(slot) {
  if (!slot || slot.version !== 1 || !slot.profileId || !slot.bundle?.[PRIMARY_KEY]
    || slot.digest !== digest(JSON.stringify({ version: slot.version, profileId: slot.profileId,
      ownerUid: slot.ownerUid, marker: slot.marker, bundle: slot.bundle }))) fail('Saved profile archive needs review.');
  const state = hydrateStoredState(JSON.parse(slot.bundle[PRIMARY_KEY]));
  if (state.profile.id !== slot.profileId || slot.marker?.profileId !== slot.profileId)
    fail('Saved profile identity does not match its archive.');
  if (slot.ownerUid) {
    const ledger = JSON.parse(slot.bundle[ACCOUNT_SYNC_LEDGER_KEY] || 'null');
    if (ledger?.accountUid !== slot.ownerUid || ledger.profileId !== slot.profileId)
      fail('Saved account ownership does not match its archive.');
  }
  return slot;
}
function storeSlot(storage, slot) {
  const value = JSON.stringify(validateSlot(slot));
  storage.setItem(slotKey(slot.profileId), value);
  if (storage.getItem(slotKey(slot.profileId)) !== value) fail('Saved profile could not be protected on this device.');
}
export function readProfileSlot(storage, profileId) {
  const raw = storage.getItem(slotKey(profileId));
  return raw ? validateSlot(JSON.parse(raw)) : null;
}
function storePointer(storage, key, profileId) {
  storage.setItem(key, profileId);
  if (storage.getItem(key) !== profileId) fail('Profile switch could not save its recovery route.');
}
export function accountProfileSlot(storage, uid) {
  const profileId = storage.getItem(`${ACCOUNT_SLOT_PREFIX}${uid}`);
  const slot = profileId && readProfileSlot(storage, profileId);
  return slot?.ownerUid === uid ? slot : null;
}
export function separateProfileSlot(storage, protectedProfileId) {
  const profileId = storage.getItem(`${SEPARATE_SLOT_PREFIX}${protectedProfileId}`);
  const slot = profileId && readProfileSlot(storage, profileId);
  return slot?.marker?.kind === 'separate' && slot.marker.parentProfileId === protectedProfileId ? slot : null;
}
// Delete Local Data explicitly means every local ROOK profile on this device.
// Do not leave protected archives behind when the current primary is removed.
export function clearAllProfileSlotArchives(storage) {
  const prefixes = [PROFILE_SLOT_PREFIX, ACCOUNT_SLOT_PREFIX, SEPARATE_SLOT_PREFIX];
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (prefixes.some(prefix => key?.startsWith(prefix))) storage.removeItem(key);
  }
  for (const key of [ACTIVE_PROFILE_SLOT_KEY, PROFILE_SWITCH_JOURNAL_KEY, PROFILE_SWITCHING_KEY]) storage.removeItem(key);
  if (storage.getItem(ACTIVE_PROFILE_SLOT_KEY) !== null
    || Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .some(key => prefixes.some(prefix => key?.startsWith(prefix))))
    fail('Some local profile archives could not be deleted.');
}
export function captureCurrentProfileSlot(storage, expectedProfileId) {
  const current = readLocalState(storage, hydrateStoredState);
  if (current.status !== 'ready' || current.state.profile.id !== expectedProfileId
    || storage.getItem(JOURNAL_KEY) !== null) fail('Current profile could not be verified for switching.');
  const ledger = readAccountSyncLedger(storage, expectedProfileId);
  const marker = activeProfileSlot(storage) || { version: 1, kind: 'account', profileId: expectedProfileId,
    authAppName: 'rook-sync' };
  if (marker.profileId !== expectedProfileId) fail('Active profile identity changed.');
  return createSlot(expectedProfileId, ledger?.accountUid || null, marker, bundleFrom(storage));
}
export function newSeparateProfileSlot(parentProfileId) {
  const state = blankState(), storage = memoryStorage();
  if (!saveState(state, { storage, reason: 'profile-switch:user-confirmed', replacement: true,
    preserveRecovery: true })) fail('Separate profile could not be prepared.');
  const marker = { version: 1, kind: 'separate', profileId: state.profile.id,
    authAppName: `rook-sync-profile-${state.profile.id}`, parentProfileId };
  return createSlot(state.profile.id, null, marker, bundleFrom(storage));
}
export function cloudAccountProfileSlot(uid, remote) {
  const state = materializeCloudProfile(blankState(), remote), storage = memoryStorage();
  if (state.profile.id !== remote.profileId || !state.profile.onboardingComplete)
    fail('Account profile could not be verified.');
  if (!saveState(state, { storage, reason: 'cloud-recovery:user-confirmed', replacement: true,
    preserveRecovery: true })) fail('Account profile could not be prepared.');
  ensureAccountSyncLedger(storage, state.profile.id, { accountUid: uid });
  return createSlot(state.profile.id, uid, { version: 1, kind: 'account', profileId: state.profile.id,
    authAppName: 'rook-sync' }, bundleFrom(storage));
}
// Only a successful server response proving an absent anchor AND no entities
// authorizes a new account namespace. Unknown, malformed or future data blocks.
export function newAccountProfileSlot(uid, remote, parentProfileId) {
  if (!uid || remote?.profileId !== null || remote?.accountSchemaVersion !== null
    || !(remote.entities instanceof Map) || remote.entities.size !== 0)
    fail('This account could not be verified as new. Your saved profile is unchanged.');
  const state = blankState(), storage = memoryStorage();
  if (!saveState(state, { storage, reason: 'profile-switch:user-confirmed', replacement: true,
    preserveRecovery: true })) fail('New account profile could not be prepared.');
  ensureAccountSyncLedger(storage, state.profile.id, { accountUid: uid });
  return createSlot(state.profile.id, uid, { version: 1, kind: 'account', profileId: state.profile.id,
    authAppName: 'rook-sync', creation: 'verified-empty-account', parentProfileId }, bundleFrom(storage));
}
// The selected Google identity was verified in this Firebase app namespace.
// Reuse that authenticated namespace on reload, including an account originally
// linked from a separate local profile. Training data and ownership do not move
// between accounts; only the authentication-session location changes.
export function accountSlotWithAuthNamespace(slot, authAppName) {
  validateSlot(slot);
  if (!slot.ownerUid || !authAppName) fail('Verified account session is required.');
  return createSlot(slot.profileId, slot.ownerUid, { ...slot.marker, authAppName }, slot.bundle);
}
export function recoverInterruptedProfileSwitch(storage = globalThis.localStorage) {
  const raw = storage.getItem(PROFILE_SWITCH_JOURNAL_KEY);
  if (!raw) { storage.removeItem(PROFILE_SWITCHING_KEY); return false; }
  const journal = JSON.parse(raw);
  if (journal?.version !== 1 || !journal.sourceProfileId) fail('Profile switch recovery needs review.');
  const source = readProfileSlot(storage, journal.sourceProfileId);
  if (!source) fail('Original profile archive is unavailable. No profile was opened.');
  applyBundle(storage, source.bundle);
  if (journal.sourceActiveRaw == null) storage.removeItem(ACTIVE_PROFILE_SLOT_KEY);
  else storage.setItem(ACTIVE_PROFILE_SLOT_KEY, journal.sourceActiveRaw);
  if (readLocalState(storage, hydrateStoredState).state?.profile?.id !== source.profileId)
    fail('Original profile could not be restored safely.');
  storage.removeItem(PROFILE_SWITCH_JOURNAL_KEY);
  storage.removeItem(PROFILE_SWITCHING_KEY);
  return true;
}
export function switchProfileSlot({ storage = globalThis.localStorage, sourceProfileId, target,
  targetSignedOut = false, rememberSeparateFor = null, isCurrent = () => true } = {}) {
  return withStorageTransaction(() => {
    // Check inside the lock, not just before awaiting it.
    if (!isCurrent()) fail('Profile changed during verification. No profile was switched.');
    if (storage.getItem(PROFILE_SWITCH_JOURNAL_KEY)) fail('Finish the previous profile switch first.');
    validateSlot(target);
    const source = captureCurrentProfileSlot(storage, sourceProfileId);
    if (source.profileId === target.profileId) fail('Already using this profile.');
    const sourceActiveRaw = storage.getItem(ACTIVE_PROFILE_SLOT_KEY);
    storage.setItem(PROFILE_SWITCHING_KEY, 'true');
    if (storage.getItem(PROFILE_SWITCHING_KEY) !== 'true') fail('Profile switch could not be protected.');
    try {
      storeSlot(storage, source);
      storeSlot(storage, target);
      if (source.ownerUid) storePointer(storage, `${ACCOUNT_SLOT_PREFIX}${source.ownerUid}`, source.profileId);
      if (target.ownerUid) storePointer(storage, `${ACCOUNT_SLOT_PREFIX}${target.ownerUid}`, target.profileId);
      if (rememberSeparateFor) storePointer(storage, `${SEPARATE_SLOT_PREFIX}${rememberSeparateFor}`, target.profileId);
      const journal = JSON.stringify({ version: 1, sourceProfileId: source.profileId, sourceActiveRaw });
      storage.setItem(PROFILE_SWITCH_JOURNAL_KEY, journal);
      if (storage.getItem(PROFILE_SWITCH_JOURNAL_KEY) !== journal) fail('Profile switch could not record recovery.');
    } catch (error) {
      if (storage.getItem(PROFILE_SWITCH_JOURNAL_KEY)) {
        try { recoverInterruptedProfileSwitch(storage); }
        catch { /* Keep the switch marker and journal for startup recovery. */ }
      } else storage.removeItem(PROFILE_SWITCHING_KEY);
      throw error;
    }
    try {
      applyBundle(storage, { ...target.bundle, [SIGNED_OUT_KEY]: targetSignedOut ? 'true' : null });
      const marker = JSON.stringify(target.marker);
      storage.setItem(ACTIVE_PROFILE_SLOT_KEY, marker);
      if (storage.getItem(ACTIVE_PROFILE_SLOT_KEY) !== marker
        || readLocalState(storage, hydrateStoredState).state?.profile?.id !== target.profileId)
        fail('Target profile could not be verified.');
      storage.removeItem(PROFILE_SWITCH_JOURNAL_KEY);
      storage.removeItem(PROFILE_SWITCHING_KEY);
      return { profileId: target.profileId };
    } catch (error) {
      try { recoverInterruptedProfileSwitch(storage); } catch { /* Journal retains the rollback path. */ }
      throw error;
    }
  });
}
