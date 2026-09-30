import { afterEach, describe, expect, it, vi } from 'vitest';
import { firebaseConfigurationStatus, linkGoogleAnonymousAccount, resolveFirebaseIdentity } from './firebaseSyncClient.js';

afterEach(() => vi.unstubAllEnvs());

const client = (user = null) => ({
  auth: { currentUser: user, authStateReady: vi.fn(async () => {}) },
  authApi: {
    GoogleAuthProvider: class GoogleAuthProvider { setCustomParameters = vi.fn(); },
    signInAnonymously: vi.fn(async () => ({ user: { uid: 'new-anonymous', isAnonymous: true } })),
    linkWithPopup: vi.fn(async original => ({ user: { ...original, isAnonymous: false, email: 'person@example.com' } })),
  },
});

describe('Firebase identity boundary', () => {
  it('distinguishes a deliberate rollout hold from missing or invalid build config', () => {
    vi.stubEnv('VITE_ROOK_ACCOUNT_SYNC_ROLLOUT', 'false');
    expect(firebaseConfigurationStatus()).toBe('rollout-off');
    vi.stubEnv('VITE_ROOK_ACCOUNT_SYNC_ROLLOUT', 'true');
    expect(firebaseConfigurationStatus()).toBe('missing-config');
    for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'])
      vi.stubEnv(`VITE_ROOK_FIREBASE_${key}`, 'test-value');
    expect(firebaseConfigurationStatus()).toBe('project-mismatch');
    vi.stubEnv('VITE_ROOK_FIREBASE_PROJECT_ID', 'rook-1d2c8');
    expect(firebaseConfigurationStatus()).toBe('ready');
  });
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
    expect(sdk.authApi.linkWithPopup.mock.calls[0][1].setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    sdk.authApi.linkWithPopup.mockRejectedValueOnce(Object.assign(new Error('already used'), { code: 'auth/credential-already-in-use' }));
    expect(await linkGoogleAnonymousAccount(sdk)).toMatchObject({ status: 'existing-account-conflict', uid: 'original' });
    sdk.authApi.linkWithPopup.mockResolvedValueOnce({ user: { uid: 'other' } });
    await expect(linkGoogleAnonymousAccount(sdk)).rejects.toThrow(/identity changed/);
  });
});
