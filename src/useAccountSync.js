import { useCallback, useEffect, useRef, useState } from 'react';
import { hydrateStoredState, saveState, serializeState } from './domain.js';
import { checkpointCurrentLocalState, isLocalSyncSnapshotCurrent, readLocalState, readLocalSyncSnapshot, subscribeLocalStateSaved } from './localStateStorage.js';
import { createFirebaseSyncAdapter, firebaseConfigured, getFirebaseSyncClient, linkGoogleAnonymousAccount, resolveFirebaseIdentity } from './firebaseSyncClient.js';
import { syncAccountOnce } from './accountSyncCoordinator.js';
import { ensureAccountSyncLedger, readAccountSyncLedger, updateAccountSyncLedger } from './accountSyncOutbox.js';
import { materializeCloudProfile } from './accountSyncModel.js';
import { accountProfileSlot, cloudAccountProfileSlot, newSeparateProfileSlot, readProfileSlot,
  separateProfileSlot, switchProfileSlot } from './accountProfileSlots.js';
import { activeProfileSlot, PROFILE_SWITCHING_KEY } from './profileSlotKeys.js';

export const ACCOUNT_SIGNED_OUT_KEY = 'rook-account-signed-out-v1';
const INITIAL_DEBOUNCE_MS = 15000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const retryDelay = failures => Math.min(MAX_RETRY_MS, 2000 * 2 ** Math.min(failures, 7)) * (.8 + Math.random() * .4);
const safelyConfigured = () => { try { return firebaseConfigured(); } catch { return false; } };
const checkedCloudRead = promise => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Account check timed out. Your saved profile remains protected.')), 15000);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export function useAccountSync({ state, update, persistenceFailed }) {
  const [sync, setSync] = useState(() => ({ state: safelyConfigured() ? 'connecting' : 'not-configured', locked: globalThis.localStorage?.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true' }));
  const latest = useRef({ state, persistenceFailed });
  const scheduleRef = useRef(null);
  latest.current = { state, persistenceFailed };
  const clientRef = useRef(null);
  const secureWithGoogle = useCallback(async () => {
    const client = clientRef.current, user = client?.auth.currentUser;
    const ledger = readAccountSyncLedger(globalThis.localStorage, latest.current.state.profile.id);
    if (!client || !user?.isAnonymous || ledger?.accountUid !== user.uid || sync.state !== 'synced') throw new Error('Finish syncing this account before securing it.');
    const result = await linkGoogleAnonymousAccount(client);
    if (result.status === 'linked') setSync(current => ({ ...current, linked: true, email: result.user.email || null }));
    return result;
  }, [sync.state]);
  const signOutAccount = useCallback(async () => {
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
  }, []);
  const signInToThisDevice = useCallback(async () => {
    const client = clientRef.current;
    if (!client || globalThis.localStorage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true') throw new Error('No signed-out ROOK profile to unlock.');
    const expected = readAccountSyncLedger(globalThis.localStorage, latest.current.state.profile.id)?.accountUid;
    if (!expected) throw new Error('The previous account identity is unavailable.');
    const provider = new client.authApi.GoogleAuthProvider();
    const result = await client.authApi.signInWithPopup(client.auth, provider);
    if (result.user.uid !== expected) {
      try {
        const storage = globalThis.localStorage;
        const selectedUid = result.user.uid;
        let target = accountProfileSlot(storage, selectedUid);
        if (!target) {
          const remote = await checkedCloudRead(createFirebaseSyncAdapter(client).read(selectedUid));
          if (client.auth.currentUser?.uid !== selectedUid || !remote?.profileId)
            throw new Error('This Google account has no verified ROOK profile to open.');
          target = cloudAccountProfileSlot(selectedUid, remote);
        }
        if (client.auth.currentUser?.uid !== selectedUid || storage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true')
          throw new Error('Account changed during verification. Saved data was not opened.');
        await switchProfileSlot({ storage, sourceProfileId: latest.current.state.profile.id, target });
        globalThis.location.reload();
        return { status: 'switched-account' };
      } catch (error) {
        await client.authApi.signOut(client.auth);
        throw error;
      }
    }
    globalThis.localStorage.removeItem(ACCOUNT_SIGNED_OUT_KEY);
    setSync(current => ({ ...current, state: 'connecting', locked: false, linked: true, email: result.user.email || null }));
    scheduleRef.current?.(0);
    return { status: 'unlocked' };
  }, []);
  const useSeparateProfile = useCallback(async () => {
    const storage = globalThis.localStorage, protectedProfileId = latest.current.state.profile.id;
    if (storage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true'
      || !readAccountSyncLedger(storage, protectedProfileId)?.accountUid)
      throw new Error('The saved account profile must remain protected.');
    const savedSeparate = separateProfileSlot(storage, protectedProfileId);
    // A previously secured or signed-out second profile is also protected;
    // the unsigned route can only reopen an unsigned local profile.
    const target = savedSeparate && !savedSeparate.ownerUid
      && savedSeparate.bundle[ACCOUNT_SIGNED_OUT_KEY] !== 'true'
      ? savedSeparate : newSeparateProfileSlot(protectedProfileId);
    await switchProfileSlot({ storage, sourceProfileId: protectedProfileId, target,
      rememberSeparateFor: protectedProfileId });
    globalThis.location.reload();
    return { status: 'separate-profile' };
  }, []);
  const switchToSavedProfile = useCallback(async () => {
    const storage = globalThis.localStorage, active = activeProfileSlot(storage);
    if (active?.kind !== 'separate' || active.profileId !== latest.current.state.profile.id)
      throw new Error('No separate profile is currently open.');
    const target = readProfileSlot(storage, active.parentProfileId);
    if (!target?.ownerUid) throw new Error('The saved account profile needs review before opening.');
    await switchProfileSlot({ storage, sourceProfileId: active.profileId, target, targetSignedOut: true });
    globalThis.location.reload();
    return { status: 'saved-profile-locked' };
  }, []);
  const recoverWithGoogle = useCallback(async () => {
    const client = clientRef.current;
    if (!client || latest.current.state.profile.onboardingComplete) throw new Error('Cloud recovery requires a new device with no training profile.');
    if (readLocalState(globalThis.localStorage, hydrateStoredState).status !== 'empty') throw new Error('Local data already exists. Back it up before changing accounts.');
    const originalLocal = serializeState(latest.current.state);
    const provider = new client.authApi.GoogleAuthProvider();
    const result = await client.authApi.signInWithPopup(client.auth, provider);
    const signedInUid = result.user.uid;
    const remote = await createFirebaseSyncAdapter(client).read(signedInUid);
    if (client.auth.currentUser?.uid !== signedInUid) throw new Error('Account changed during recovery. Nothing was replaced.');
    const restored = materializeCloudProfile(latest.current.state, remote);
    if (client.auth.currentUser?.uid !== signedInUid || serializeState(latest.current.state) !== originalLocal || readLocalState(globalThis.localStorage, hydrateStoredState).status !== 'empty') throw new Error('Account or local data changed during recovery. Nothing was replaced.');
    if (!saveState(restored, { reason: 'cloud-recovery:user-confirmed' })) throw new Error('The recovered profile could not be saved locally. Try again.');
    try { ensureAccountSyncLedger(globalThis.localStorage, restored.profile.id, { accountUid: result.user.uid }); }
    catch { /* The profile is safe locally. The next sync scan will request account review. */ }
    update(() => restored, { persistedState: restored, planVersion: false });
    return { status: 'restored', profileId: restored.profile.id };
  }, [update]);
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
      if (!canSync || !adapter || uid || storage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true'
        || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return Promise.resolve();
      identityPromise ||= (async () => {
        const identity = await resolveFirebaseIdentity(clientRef.current);
        if (closed) return;
        uid = identity.user?.uid || null;
        newlyCreatedAnonymous = identity.created;
        if (identity.created && uid) ensureAccountSyncLedger(storage, latest.current.state.profile.id, { accountUid: uid });
      })().finally(() => { identityPromise = null; });
      return identityPromise;
    };
    const run = async () => {
      if (closed || !canSync || storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return;
      if (running) { rerun = true; return; }
      running = true;
      try {
        if (globalThis.localStorage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true') { show({ state: 'signed-out' }); return; }
        if (latest.current.persistenceFailed) { show({ state: 'needs-attention', category: 'local-save-failed' }); return; }
        let snapshot;
        try { snapshot = readLocalSyncSnapshot(storage, hydrateStoredState); }
        catch { show({ state: 'needs-attention', category: 'local-read-failed' }); return; }
        if (snapshot.state.profile.id !== latest.current.state.profile.id || serializeState(latest.current.state) !== snapshot.raw) { schedule(1000); return; }
        try { await ensureIdentity(); }
        catch (error) {
          failures++;
          show({ state: error?.code === 'auth/network-request-failed' ? 'offline' : 'needs-attention', category: error?.code || 'auth-unavailable' });
          schedule(retryDelay(failures));
          return;
        }
        const expectedUid = uid;
        const sameAccount = () => expectedUid && clientRef.current?.auth.currentUser?.uid === expectedUid
          && storage.getItem(ACCOUNT_SIGNED_OUT_KEY) !== 'true'
          && storage.getItem(PROFILE_SWITCHING_KEY) !== 'true';
        const result = await syncAccountOnce({
          storage, local: snapshot, accountUid: expectedUid, newlyCreatedAnonymous, cloud: adapter || { async read() { throw Object.assign(new Error('Offline'), { code: 'auth-unavailable' }); } },
          checkpoint: () => checkpointCurrentLocalState(storage, hydrateStoredState),
          isCurrent: () => sameAccount() && isLocalSyncSnapshotCurrent(snapshot, storage),
          commitRemote: async merged => {
            if (!sameAccount() || !isLocalSyncSnapshotCurrent(snapshot, storage) || serializeState(latest.current.state) !== snapshot.raw) return false;
            if (!saveState(merged, { reason: 'cloud-reconcile', expectedGeneration: snapshot.generation })) return false;
            update(() => merged, { persistedState: merged, planVersion: false });
            return true;
          },
        });
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
          if (storage.getItem(PROFILE_SWITCHING_KEY) === 'true') return;
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
        } else show({ state: 'recovery-available' });
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
  const separate = activeProfileSlot()?.kind === 'separate';
  return { ...sync, separate, secureWithGoogle, signOutAccount, signInToThisDevice,
    useSeparateProfile, switchToSavedProfile, recoverWithGoogle };
}
