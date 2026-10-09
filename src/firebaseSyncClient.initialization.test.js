import { afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ initialize: vi.fn(), slot: null }));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: (...args) => sdk.initialize(...args) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('./profileSlotKeys.js', () => ({ activeProfileSlot: () => sdk.slot }));
import { getFirebaseSyncClient } from './firebaseSyncClient.js';
afterEach(() => vi.unstubAllEnvs());
it('a failed initialization is not cached forever and distinct namespaces retain distinct clients', async () => {
  for (const [key, value] of Object.entries({ VITE_ROOK_ACCOUNT_SYNC_ROLLOUT: 'true', VITE_ROOK_FIREBASE_API_KEY: 'synthetic', VITE_ROOK_FIREBASE_AUTH_DOMAIN: 'synthetic', VITE_ROOK_FIREBASE_PROJECT_ID: 'rook-1d2c8', VITE_ROOK_FIREBASE_APP_ID: 'synthetic' })) vi.stubEnv(key, value);
  sdk.initialize.mockImplementationOnce(() => { throw new Error('transient initialization failure'); }).mockImplementation(options => ({ options }));
  await expect(getFirebaseSyncClient()).rejects.toThrow('transient initialization failure');
  const first = await getFirebaseSyncClient(); expect(await getFirebaseSyncClient()).toBe(first); expect(sdk.initialize).toHaveBeenCalledTimes(2);
  sdk.slot = { authAppName: 'another-profile' }; const other = await getFirebaseSyncClient(); expect(other).not.toBe(first);
  sdk.slot = null; expect(await getFirebaseSyncClient()).toBe(first);
});
