import { useCallback, useEffect, useRef, useState } from 'react';
import { hydrateStoredState, saveState, serializeState } from './domain.js';
import { checkpointCurrentLocalState, isLocalSyncSnapshotCurrent, readLocalSyncSnapshot, subscribeLocalStateSaved } from './localStateStorage.js';
import { createFirebaseSyncAdapter, firebaseConfigurationStatus, firebaseConfigured, getFirebaseSyncClient, linkGoogleAnonymousAccount, resolveFirebaseIdentity } from './firebaseSyncClient.js';
import { syncAccountOnce } from './accountSyncCoordinator.js';
import { ensureAccountSyncLedger, readAccountSyncLedger, updateAccountSyncLedger } from './accountSyncOutbox.js';
import { newSeparateProfileSlot, readProfileSlot,
  separateProfileSlot, switchProfileSlot } from './accountProfileSlots.js';
import { activeProfileSlot, PROFILE_SWITCHING_KEY } from './profileSlotKeys.js';
import { openProtectedAccount, protectedProfileAccess } from './accountProfileAccess.js';
import { clearFirstRunAccountClaim, readFirstRunAccountClaim } from './firstRunAccountClaim.js';
import { signInFirstRunAccount } from './firstRunAccountSignIn.js';
import { ACCOUNT_SYNC_SCHEMA } from './accountSyncModel.js';

export const ACCOUNT_SIGNED_OUT_KEY = 'rook-account-signed-out-v1';
const INITIAL_DEBOUNCE_MS = 15000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const retryDelay = failures => Math.min(MAX_RETRY_MS, 2000 * 2 ** Math.min(failures, 7)) * (.8 + Math.random() * .4);
const safelyConfigured = () => { try { return firebaseConfigured(); } catch { return false; } };
const hasSavedParent = slot => Boolean(slot?.parentProfileId && (slot.kind === 'separate'
  || (slot.kind === 'account' && slot.creation === 'verified-empty-account')));

export function useAccountSync({ state, update, persistenceFailed }) {
  const [sync, setSync] = useState(() => {
    const configuration = firebaseConfigurationStatus();
    return { state: configuration === 'ready' ? 'connecting' : configuration === 'project-mismatch' ? 'needs-attention' : 'not-configured',
      category: configuration, locked: globalThis.localStorage?.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true' };
  });
  const latest = useRef({ state, persistenceFailed });
  const scheduleRef = useRef(null);
  latest.current = { state, persistenceFailed };
  const clientRef = useRef(null);
  const accountActions = useRef({ epoch: 0, busy: false });
  useEffect(() => () => { accountActions.current.epoch++; accountActions.current.busy = false; }, []);
  const accountAction = useCallback(async operation => {
    if (accountActions.current.busy) throw new Error('Please wait for the current account action.');
    const epoch = ++accountActions.current.epoch, profileId = latest.current.state.profile.id, client = clientRef.current;
    accountActions.current.busy = true;
    const current = () => accountActions.current.epoch === epoch && latest.current.state.profile.id === profileId && clientRef.current === client;
    try { return await operation(current); }
    finally { if (accountActions.current.epoch === epoch) accountActions.current.busy = false; }
  }, []);
  const secureWithGoogle = useCallback(() => accountAction(async current => {
    const client = clientRef.current, user = client?.auth.currentUser;
    const ledger = readAccountSyncLedger(globalThis.localStorage, latest.current.state.profile.id);
    if (!client || !user?.isAnonymous || ledger?.accountUid !== user.uid || sync.state !== 'synced') throw new Error('Finish syncing this account before securing it.');
    const result = await linkGoogleAnonymousAccount(client);
    if (!current()) throw new Error('Account changed during linking. Reopen this profile to continue.');
    if (result.status === 'linked') setSync(current => ({ ...current, linked: true, email: result.user.email || null }));
    return result;
  }), [sync.state, accountAction]);
  const signOutAccount = useCallback(() => accountAction(async () => {
    const client = clientRef.current, user = client?.auth.currentUser;
    const ledger = readAccountSyncLedger(globalThis.localStorage, latest.current.state.profile.id);
    if (!client || !user || user.isAnonymous || ledger?.accountUid !== user.uid) throw new Error('This account cannot be signed out safely.');
    globalThis.localStorage.setItem(ACCOUNT_SIGNED_OUT_KEY, 'true');
    if (globalThis.localStorage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true') throw new Error('Could not save sign-out protection.');
    setSync(current => ({ ...current, state: 'signed-out', locked: true, email: null }));
    try { await client.authApi.signOut(client.auth); }
    catch (error) {
      // Still lock the local profile until the original UID is verified again.
      throw error;
    }
  }), [accountAction]);
  const signIn = useCallback(allowAnother => accountAction(async current => {
    const client = clientRef.current;
    const result = await openProtectedAccount({ storage: globalThis.localStorage, client,
      profileId: latest.current.state.profile.id, allowAnother, isCurrent: current,
      readCloud: uid => createFirebaseSyncAdapter(client).read(uid) });
    if (!current()) return result;
    if (result.status === 'switched-account') {
      globalThis.location.reload();
      return result;
    }
    setSync(current => ({ ...current, state: 'connecting', locked: false, linked: true, email: result.user.email || null }));
    scheduleRef.current?.(0);
    return result;
  }), [accountAction]);
  const signInToThisDevice = useCallback(() => signIn(false), [signIn]);
  const signInWithAnotherAccount = useCallback(() => signIn(true), [signIn]);
  const useSeparateProfile = useCallback(() => accountAction(async current => {
    const storage = globalThis.localStorage, protectedProfileId = latest.current.state.profile.id;
    const access = protectedProfileAccess(storage, protectedProfileId, current);
    const savedSeparate = separateProfileSlot(storage, protectedProfileId);
    // A previously secured or signed-out second profile is also protected;
    // the unsigned route can only reopen an unsigned local profile.
    const target = savedSeparate && !savedSeparate.ownerUid
      && savedSeparate.bundle[ACCOUNT_SIGNED_OUT_KEY] !== 'true'
      ? savedSeparate : newSeparateProfileSlot(protectedProfileId);
    await switchProfileSlot({ storage, sourceProfileId: protectedProfileId, target,
      rememberSeparateFor: protectedProfileId, isCurrent: access.current });
    globalThis.location.reload();
    return { status: 'separate-profile' };
  }), [accountAction]);
  const switchToSavedProfile = useCallback(() => accountAction(async current => {
    const storage = globalThis.localStorage, active = activeProfileSlot(storage);
    if (!hasSavedParent(active) || active.profileId !== latest.current.state.profile.id)
      throw new Error('No separate profile is currently open.');
    const target = readProfileSlot(storage, active.parentProfileId);
    if (!target?.ownerUid) throw new Error('The saved account profile needs review before opening.');
    const snapshot = readLocalSyncSnapshot(storage, hydrateStoredState);
    await switchProfileSlot({ storage, sourceProfileId: active.profileId, target, targetSignedOut: true,
      isCurrent: () => current() && isLocalSyncSnapshotCurrent(snapshot, storage) });
    globalThis.location.reload();
    return { status: 'saved-profile-locked' };
  }), [accountAction]);
  const signInFirstRunWithGoogle = useCallback(() => accountAction(async current => {
    const result = await signInFirstRunAccount({ client: clientRef.current, storage: globalThis.localStorage,
      getState: () => latest.current.state, isCurrent: current });
    if (result.status === 'new-account')
      setSync(previous => ({ ...previous, state: 'signed-in-new-account', linked: true, email: result.email }));
    else if (result.status === 'restored')
      update(() => result.restored, { persistedState: result.restored, planVersion: false });
    return result;
  }), [accountAction, update]);
  const detachFirstRunAccountAfterBackup = useCallback(() => {
    const claim = readFirstRunAccountClaim(globalThis.localStorage);
    if (claim?.profileId === latest.current.state.profile.id)
      clearFirstRunAccountClaim(globalThis.localStorage, claim.uid, claim.profileId);
    // A restored backup is not implicitly linked to the signed-in account.
  }, []);
  useEffect(() => {
    if (!safelyConfigured()) return;
    const canSync = state.profile.onboardingComplete;
    const storage = globalThis.localStorage;
    let closed = false, running = false, rerun = false, timer = null, failures = 0, authUnsubscribe = null;
    let adapter = null, uid = null, newlyCreatedAnonymous = false, identityPromise = null;
    const show = result => { if (!closed) setSync(current => ({ ...result, locked: current.locked, linked: clientRef.current?.auth.currentUser ? !clientRef.current.auth.currentUser.isAnonymous : false, email: clientRef.current?.auth.currentUser?.email || null })); };
    const schedule = (delay = INITIAL_DEBOUNCE_MS) => {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };
    scheduleRef.current = schedule;
    const ensureIdentity = () => {
      if (!canSync || !adapter || uid || accountActions.current.busy || storage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true'
        || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return Promise.resolve();
      identityPromise ||= (async () => {
        const epoch = accountActions.current.epoch, profileId = latest.current.state.profile.id;
        const claim = readFirstRunAccountClaim(storage);
        const identity = await resolveFirebaseIdentity(clientRef.current, { allowAnonymous: !claim });
        if (claim && identity.user?.uid !== claim.uid)
          throw Object.assign(new Error('First-run account identity changed.'), { code: 'account-identity-conflict' });
        if (closed || epoch !== accountActions.current.epoch || accountActions.current.busy
          || profileId !== latest.current.state.profile.id || storage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true'
          || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return;
        uid = identity.user?.uid || null;
        newlyCreatedAnonymous = identity.created;
        if (identity.created && uid) ensureAccountSyncLedger(storage, latest.current.state.profile.id, { accountUid: uid });
      })().finally(() => { identityPromise = null; });
      return identityPromise;
    };
    const run = async () => {
      if (closed || !canSync || accountActions.current.busy || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return;
      if (running) { rerun = true; return; }
      running = true;
      const epoch = accountActions.current.epoch;
      try {
        if (globalThis.localStorage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true') { show({ state: 'signed-out' }); return; }
        if (latest.current.persistenceFailed) { show({ state: 'needs-attention', category: 'local-save-failed' }); return; }
        let snapshot;
        try { snapshot = readLocalSyncSnapshot(storage, hydrateStoredState); }
        catch { show({ state: 'needs-attention', category: 'local-read-failed' }); return; }
        if (snapshot.state.profile.id !== latest.current.state.profile.id || serializeState(latest.current.state) !== snapshot.raw) { schedule(1000); return; }
        try { await ensureIdentity(); }
        catch (error) {
          if (closed || epoch !== accountActions.current.epoch) return;
          failures++;
          show({ state: error?.code === 'auth/network-request-failed' ? 'offline' : 'needs-attention', category: error?.code || 'auth-unavailable' });
          schedule(retryDelay(failures));
          return;
        }
        const expectedUid = uid;
        const sameAccount = () => !closed && epoch === accountActions.current.epoch && !accountActions.current.busy
          && expectedUid && clientRef.current?.auth.currentUser?.uid === expectedUid
          && storage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true'
          && storage.getItem(PROFILE_SWITCHING_KEY) !== 'true';
        const claim = readFirstRunAccountClaim(storage);
        if (claim) {
          if (!sameAccount() || claim.uid !== expectedUid || claim.profileId !== snapshot.state.profile.id) {
            show({ state: 'needs-attention', category: 'account-identity-conflict' }); return;
          }
          const claimRemote = await adapter.read(expectedUid);
          if (!sameAccount() || !isLocalSyncSnapshotCurrent(snapshot, storage)) return;
          if (!(claimRemote?.entities instanceof Map) ||
              (claimRemote.profileId !== null && claimRemote.profileId !== claim.profileId) ||
              (claimRemote.profileId === null && (claimRemote.accountSchemaVersion !== null || claimRemote.entities.size)) ||
              (claimRemote.profileId && (claimRemote.accountSchemaVersion !== ACCOUNT_SYNC_SCHEMA ||
                [...claimRemote.entities.values()].some(record => record?.syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA)))) {
            show({ state: 'needs-attention', category: 'account-identity-conflict' }); return;
          }
          ensureAccountSyncLedger(storage, claim.profileId, { accountUid: expectedUid });
          clearFirstRunAccountClaim(storage, expectedUid, claim.profileId);
        }
        const result = await syncAccountOnce({
          storage, local: snapshot, accountUid: expectedUid, newlyCreatedAnonymous, cloud: adapter || { async read() { throw Object.assign(new Error('Offline'), { code: 'auth-unavailable' }); } },
          checkpoint: () => checkpointCurrentLocalState(storage, hydrateStoredState),
          isCurrent: () => sameAccount() && isLocalSyncSnapshotCurrent(snapshot, storage),
          isAccountCurrent: sameAccount,
          commitRemote: async merged => {
            if (!sameAccount() || !isLocalSyncSnapshotCurrent(snapshot, storage) || serializeState(latest.current.state) !== snapshot.raw) return false;
            if (!saveState(merged, { reason: 'cloud-reconcile', expectedGeneration: snapshot.generation })) return false;
            update(() => merged, { persistedState: merged, planVersion: false });
            return true;
          },
        });
        if (!sameAccount()) return;
        show(result);
        if (['offline', 'auth-unavailable'].includes(result.state)) {
          failures++;
          try { updateAccountSyncLedger(storage, snapshot.state.profile.id, current => ({ ...current, failureCount: failures, retryAfter: new Date(Date.now() + retryDelay(failures)).toISOString() })); } catch { /* Status remains local-only. */ }
          schedule(retryDelay(failures));
        } else if (result.state === 'retry' || result.state === 'syncing') {
          failures = 0; schedule(result.category === 'remote-applied' ? 1000 : 2000);
        } else if (result.state === 'synced') failures = 0;
      } catch { show({ state: 'needs-attention', category: 'sync-unexpected' }); }
      finally { running = false; if (rerun) { rerun = false; schedule(1000); } }
    };
    const saved = subscribeLocalStateSaved(event => {
      if (event.profileId === latest.current.state.profile.id) {
        show({ state: 'syncing' });
        schedule();
      }
    });
    const foreground = () => { if (document.visibilityState === 'visible') schedule(0); };
    const online = () => schedule(0);
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', foreground);
    (async () => {
      try {
        const client = await getFirebaseSyncClient();
        if (!client || closed) return;
        clientRef.current = client;
        adapter = createFirebaseSyncAdapter(client);
        authUnsubscribe = client.authApi.onAuthStateChanged(client.auth, user => {
          if (closed || accountActions.current.busy || user?.uid !== client.auth.currentUser?.uid
            || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return;
          uid = user?.uid || null;
          const bound = (() => { try { return readAccountSyncLedger(storage, latest.current.state.profile.id)?.accountUid; } catch { return null; } })();
          if (bound && user?.uid && bound !== user.uid) {
            try { storage.setItem(ACCOUNT_SIGNED_OUT_KEY, 'true'); } catch { /* Keep this mount locked even if storage is unavailable. */ }
            setSync(current => ({ ...current, state: 'needs-attention', category: 'account-identity-conflict', locked: true }));
          }
          else if (canSync && user?.uid && storage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true') schedule(0);
          else if (canSync) show({ state: 'auth-unavailable' });
        });
        if (canSync) {
          try { await ensureIdentity(); }
          catch (error) { show({ state: error?.code === 'auth/network-request-failed' ? 'offline' : 'needs-attention', category: error?.code || 'auth-unavailable' }); }
          if (!closed) schedule(0);
        } else {
          const claim = readFirstRunAccountClaim(storage);
          show({ state: claim?.uid === client.auth.currentUser?.uid && claim?.profileId === latest.current.state.profile.id
            ? 'signed-in-new-account' : 'recovery-available' });
        }
      } catch { show({ state: 'needs-attention', category: 'auth-unavailable' }); }
    })();
    schedule(0);
    return () => {
      closed = true; clearTimeout(timer); saved(); authUnsubscribe?.();
      clientRef.current = null;
      scheduleRef.current = null;
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [state.profile.onboardingComplete, state.profile.id, update]);
  const separate = hasSavedParent(activeProfileSlot());
  return { ...sync, enabled: safelyConfigured(), separate, secureWithGoogle, signOutAccount, signInToThisDevice, signInWithAnotherAccount,
    useSeparateProfile, switchToSavedProfile, signInFirstRunWithGoogle, detachFirstRunAccountAfterBackup };
}
