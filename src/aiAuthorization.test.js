import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ client: null }));
vi.mock('./firebaseSyncClient.js', () => ({ getFirebaseSyncClient: async () => mock.client }));
import { aiAuthorizationHeaders, watchCoachAuth } from './aiAuthorization.js';
beforeEach(() => { mock.client = null; });
it('requires real sign-in without creating an anonymous account or changing profile state', async () => {
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/Sign in/);
  mock.client = { auth: { authStateReady: async () => {}, currentUser: { isAnonymous: true } } };
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/Sign in/);
});
it('observes restoration and later sign-in without issuing tokens or creating identities', async () => {
  let changed; const release = vi.fn(), user = { uid: 'real', isAnonymous: false, getIdToken: vi.fn() };
  mock.client = { auth: { currentUser: null }, authApi: { onIdTokenChanged: vi.fn((auth, callback) => { changed = callback; return release; }) } };
  const states = []; expect(await watchCoachAuth(value => states.push(value))).toBe(release);
  expect(states).toEqual(['pending']); changed(null); changed({ isAnonymous: true }); changed(user);
  expect(states).toEqual(['pending', 'attention', 'attention', 'ready']); expect(user.getIdToken).not.toHaveBeenCalled();
});
it('distinguishes held/missing auth configuration without trying to sign in', async () => {
  const states = []; await watchCoachAuth(value => states.push(value)); expect(states).toEqual(['pending', 'not_configured']);
});
it('sends the Firebase ID token and rejects identity changes during refresh', async () => {
  const user = { uid: 'stable', isAnonymous: false, getIdToken: vi.fn(async () => 'verified-token') };
  mock.client = { auth: { authStateReady: async () => {}, currentUser: user } };
  expect(await aiAuthorizationHeaders()).toEqual({ authorization: 'Bearer verified-token' });
  user.getIdToken.mockImplementation(async () => { mock.client.auth.currentUser = { uid: 'other' }; return 'old-token'; });
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/account changed/);
});
