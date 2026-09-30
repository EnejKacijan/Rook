import {hydrateStoredState} from './domain.js';
import {readAccountSyncLedger} from './accountSyncOutbox.js';
import {readLocalSyncSnapshot,isLocalSyncSnapshotCurrent,withStorageTransaction} from './localStateStorage.js';
import {accountProfileSlot,accountSlotWithAuthNamespace,cloudAccountProfileSlot,newAccountProfileSlot,switchProfileSlot} from './accountProfileSlots.js';
import {ACTIVE_PROFILE_SLOT_KEY,PROFILE_SWITCHING_KEY,PROFILE_SWITCH_JOURNAL_KEY,activeProfileSlot} from './profileSlotKeys.js';

const signedOutKey = 'rook-account-signed-out-v1';
export function protectedProfileAccess(storage, profileId, isCurrent = () => true) {
  const snapshot = readLocalSyncSnapshot(storage, hydrateStoredState);
  const ownerUid = readAccountSyncLedger(storage, profileId)?.accountUid;
  const slot = storage.getItem(ACTIVE_PROFILE_SLOT_KEY);
  const current = () => isCurrent() && snapshot.state.profile.id === profileId && Boolean(ownerUid)
    && storage.getItem(signedOutKey) === 'true'
    && storage.getItem(PROFILE_SWITCHING_KEY) !== 'true' && !storage.getItem(PROFILE_SWITCH_JOURNAL_KEY)
    && storage.getItem(ACTIVE_PROFILE_SLOT_KEY) === slot && isLocalSyncSnapshotCurrent(snapshot, storage)
    && readAccountSyncLedger(storage, profileId)?.accountUid === ownerUid;
  if (!current()) throw new Error('The saved profile could not be verified. It remains protected.');
  return {ownerUid,current};
}

// The UI selects owner recovery or another-account intent. Neither route merges
// training data; only the existing journaled namespace switch can change roots.
export async function openProtectedAccount({storage,client,profileId,readCloud,allowAnother = false,
  isCurrent = () => true,timeoutMs = 15000}) {
  if (!client) throw new Error('Account sign-in is not available. Your saved profile remains protected.');
  const access = protectedProfileAccess(storage,profileId,isCurrent);
  const provider = new client.authApi.GoogleAuthProvider();
  provider.setCustomParameters?.({prompt:'select_account'});
  let selectedUid;
  const current = () => access.current() && client.auth.currentUser?.uid === selectedUid;
  const assertCurrent = () => { if (!current()) throw new Error('Account or profile changed during verification. Your saved data was not opened.'); };
  try {
    const result = await client.authApi.signInWithPopup(client.auth,provider);
    selectedUid = result.user?.uid;
    if (!selectedUid || result.user.isAnonymous) throw new Error('Choose a supported account to continue.');
    assertCurrent();
    if (selectedUid === access.ownerUid) {
      return await withStorageTransaction(() => {
        assertCurrent();
        storage.removeItem(signedOutKey);
        if (storage.getItem(signedOutKey) !== null) throw new Error('Could not unlock the saved profile.');
        return {status:'unlocked',user:result.user};
      });
    }
    if (!allowAnother) throw new Error('This is not the account that owns this profile. Choose “Use another ROOK profile” to open a different account.');
    let target = accountProfileSlot(storage,selectedUid);
    if (!target) {
      let timer;
      const remote = await Promise.race([readCloud(selectedUid),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Account check timed out. Your saved profile remains protected.')),timeoutMs);
      })]).finally(()=>clearTimeout(timer));
      assertCurrent();
      target = remote?.profileId ? cloudAccountProfileSlot(selectedUid,remote) : newAccountProfileSlot(selectedUid,remote,profileId);
    }
    assertCurrent();
    target = accountSlotWithAuthNamespace(target, activeProfileSlot(storage)?.authAppName || 'rook-sync');
    await switchProfileSlot({storage,sourceProfileId:profileId,target,isCurrent:current});
    return {status:'switched-account',profileId:target.profileId};
  } catch (error) {
    // Never sign out a newer operation/account in response to an old failure.
    if (selectedUid && current()) {
      try { await client.authApi.signOut(client.auth); } catch { /* Local protection stays set. */ }
    }
    throw error;
  }
}
