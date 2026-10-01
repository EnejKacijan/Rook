import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ client: null }));
vi.mock('./firebaseSyncClient.js', () => ({ getFirebaseSyncClient: async () => mock.client }));
import { aiAuthorizationHeaders } from './aiAuthorization.js';
beforeEach(() => { mock.client = null; });
it('requires real sign-in without creating an anonymous account or changing profile state', async () => {
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/Sign in/);
  mock.client = { auth: { authStateReady: async () => {}, currentUser: { isAnonymous: true } } };
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/Sign in/);
});
it('sends the Firebase ID token and rejects identity changes during refresh', async () => {
  const user = { uid: 'stable', isAnonymous: false, getIdToken: vi.fn(async () => 'verified-token') };
  mock.client = { auth: { authStateReady: async () => {}, currentUser: user } };
  expect(await aiAuthorizationHeaders()).toEqual({ authorization: 'Bearer verified-token' });
  user.getIdToken.mockImplementation(async () => { mock.client.auth.currentUser = { uid: 'other' }; return 'old-token'; });
  await expect(aiAuthorizationHeaders()).rejects.toThrow(/account changed/);
});
