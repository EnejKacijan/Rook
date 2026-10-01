import { getFirebaseSyncClient } from './firebaseSyncClient.js';

export async function aiAuthorizationHeaders() {
  const client = await getFirebaseSyncClient();
  if (!client) throw new Error('Sign in to use AI. Your local data is unchanged.');
  await client.auth.authStateReady();
  const user = client.auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to use AI. Your local data is unchanged.');
  const token = await user.getIdToken();
  // Identity may change while refreshing the token. Do not send old-profile
  // context with an identity belonging to a different active profile/account.
  const current = await getFirebaseSyncClient();
  if (current !== client || client.auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Please try again.');
  return { authorization: `Bearer ${token}` };
}
