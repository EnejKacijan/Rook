import { hydrateStoredState, saveState, serializeState } from './domain.js';
import { readLocalState } from './localStateStorage.js';
import { createFirebaseSyncAdapter } from './firebaseSyncClient.js';
import { ensureAccountSyncLedger } from './accountSyncOutbox.js';
import { materializeCloudProfile } from './accountSyncModel.js';
import { readFirstRunAccountClaim, writeFirstRunAccountClaim } from './firstRunAccountClaim.js';
import { ACCOUNT_CLOUD_READ_TIMEOUT_MS } from './accountSyncTiming.js';

// Provider-specific UI enters here; all profile existence/ownership decisions
// remain on a verified cloud read and an unchanged local first-run boundary.
export async function signInFirstRunAccount({ client, storage, getState, isCurrent = () => true,
  readLocal = readLocalState, readCloud = uid => createFirebaseSyncAdapter(client).read(uid),
  save = saveState, materialize = materializeCloudProfile, bind = ensureAccountSyncLedger,
  timeoutMs = ACCOUNT_CLOUD_READ_TIMEOUT_MS }) {
  if (!client || getState().profile.onboardingComplete) throw new Error('Sign-in is available only during first-run setup.');
  if (readLocal(storage, hydrateStoredState).status !== 'empty') throw new Error('Local data already exists. Back it up before changing accounts.');
  if (readFirstRunAccountClaim(storage)) throw new Error('This setup is already associated with an account.');
  const original = serializeState(getState());
  const result = await client.authApi.signInWithPopup(client.auth, new client.authApi.GoogleAuthProvider());
  const uid = result.user.uid;
  let timer;
  const remote = await Promise.race([readCloud(uid), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Account check timed out. No local data was replaced.')), timeoutMs);
  })]).finally(() => clearTimeout(timer));
  const unchanged = () => isCurrent() && client.auth.currentUser?.uid === uid &&
    serializeState(getState()) === original && readLocal(storage, hydrateStoredState).status === 'empty';
  if (!unchanged()) throw new Error('Account or local data changed during sign-in. Nothing was replaced.');
  if (!(remote?.entities instanceof Map) ||
      (remote.profileId === null && (remote.accountSchemaVersion !== null || remote.entities.size)))
    throw new Error('ROOK could not verify this account profile. Nothing was replaced.');
  if (remote.profileId === null) {
    writeFirstRunAccountClaim(storage, { uid, profileId: getState().profile.id });
    return { status: 'new-account', uid, email: result.user.email || null };
  }
  const restored = materialize(getState(), remote);
  if (!unchanged()) throw new Error('Account or local data changed during recovery. Nothing was replaced.');
  if (!save(restored, { reason: 'cloud-recovery:user-confirmed' }))
    throw new Error('The recovered profile could not be saved locally. Try again.');
  try { bind(storage, restored.profile.id, { accountUid: uid }); }
  catch { /* The validated profile is safe locally; sync will request account review. */ }
  return { status: 'restored', profileId: restored.profile.id, restored };
}
