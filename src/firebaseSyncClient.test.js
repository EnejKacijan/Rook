import { describe, expect, it, vi } from 'vitest';
import { linkGoogleAnonymousAccount, resolveFirebaseIdentity } from './firebaseSyncClient.js';

const client = (user = null) => ({
  auth: { currentUser: user, authStateReady: vi.fn(async () => {}) },
  authApi: {
    GoogleAuthProvider: class GoogleAuthProvider {},
    signInAnonymously: vi.fn(async () => ({ user: { uid: 'new-anonymous', isAnonymous: true } })),
    linkWithPopup: vi.fn(async original => ({ user: { ...original, isAnonymous: false, email: 'person@example.com' } })),
  },
});

describe('Firebase identity boundary', () => {
  it('waits for persisted auth before creating an anonymous account', async () => {
    const existing = { uid: 'already-linked', isAnonymous: false };
    const sdk = client(existing);
    expect(await resolveFirebaseIdentity(sdk)).toEqual({ user: existing, created: false });
    expect(sdk.authApi.signInAnonymously).not.toHaveBeenCalled();
    const missing = client();
    expect(await resolveFirebaseIdentity(missing, { allowAnonymous: false })).toEqual({ user: null, created: false });
    expect(missing.authApi.signInAnonymously).not.toHaveBeenCalled();
    expect(await resolveFirebaseIdentity(missing)).toMatchObject({ user: { uid: 'new-anonymous' }, created: true });
  });
  it('links Google to the same anonymous UID and leaves collisions unresolved', async () => {
    const sdk = client({ uid: 'original', isAnonymous: true });
    expect(await linkGoogleAnonymousAccount(sdk)).toMatchObject({ status: 'linked', uid: 'original', user: { uid: 'original' } });
    expect(sdk.authApi.linkWithPopup).toHaveBeenCalledWith(sdk.auth.currentUser, expect.any(sdk.authApi.GoogleAuthProvider));
    sdk.authApi.linkWithPopup.mockRejectedValueOnce(Object.assign(new Error('already used'), { code: 'auth/credential-already-in-use' }));
    expect(await linkGoogleAnonymousAccount(sdk)).toMatchObject({ status: 'existing-account-conflict', uid: 'original' });
    sdk.authApi.linkWithPopup.mockResolvedValueOnce({ user: { uid: 'other' } });
    await expect(linkGoogleAnonymousAccount(sdk)).rejects.toThrow(/identity changed/);
  });
});
