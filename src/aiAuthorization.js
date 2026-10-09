import { getFirebaseSyncClient } from './firebaseSyncClient.js';
const signInRequired = () => Object.assign(new Error('Sign in to use AI. Your local data is unchanged.'), { code: 'sign-in-required' });

export async function aiAuthorizationHeaders() {
  const client = await getFirebaseSyncClient();
  if (!client) throw signInRequired();
  await client.auth.authStateReady();
  const user = client.auth.currentUser;
  if (!user || user.isAnonymous) throw signInRequired();
  const token = await user.getIdToken();
  // Identity may change while refreshing the token. Do not send old-profile
  // context with an identity belonging to a different active profile/account.
  const current = await getFirebaseSyncClient();
  if (current !== client || client.auth.currentUser?.uid !== user.uid) throw Object.assign(new Error('Your account changed. Please try again.'), { code: 'auth-failed' });
  return { authorization: `Bearer ${token}` };
}

// Observes the current namespace; never creates an identity or requests a token.
export async function watchCoachAuth(onChange) {
  onChange('pending');
  const client = await getFirebaseSyncClient();
  if (!client) { onChange('not_configured'); return () => {}; }
  return client.authApi.onIdTokenChanged(client.auth, user => {
    onChange(user && !user.isAnonymous ? 'ready' : 'attention');
  }, () => onChange('attention'));
}
