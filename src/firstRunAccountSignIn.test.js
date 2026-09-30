import { expect, it, vi } from 'vitest';
import { blankState } from './domain.js';
import { readFirstRunAccountClaim, writeFirstRunAccountClaim } from './firstRunAccountClaim.js';
import { signInFirstRunAccount } from './firstRunAccountSignIn.js';

function setup() {
  const entries = new Map();
  const storage = { getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
  const state = blankState(), user = { uid: 'google-owner', email: 'owner@example.test' };
  const client = { auth: { currentUser: null }, authApi: {
    GoogleAuthProvider: class {},
    signInWithPopup: vi.fn(async auth => { auth.currentUser = user; return { user }; }),
  } };
  const save = vi.fn(() => true), bind = vi.fn();
  const options = { client, storage, getState: () => state, readLocal: () => ({ status: 'empty' }),
    readCloud: vi.fn(async () => ({ profileId: null, accountSchemaVersion: null, entities: new Map() })),
    save, bind };
  return { state, user, client, storage, save, bind, options };
}

it('treats positively empty Google account as authenticated first run without writing a profile', async () => {
  const { state, user, storage, save, bind, options } = setup();
  const result = await signInFirstRunAccount(options);
  expect(result).toMatchObject({ status: 'new-account', uid: user.uid });
  expect(readFirstRunAccountClaim(storage)).toMatchObject({ uid: user.uid, profileId: state.profile.id });
  expect(save).not.toHaveBeenCalled(); expect(bind).not.toHaveBeenCalled();
});
it('restores the exact verified cloud lineage and history, not a second blank profile', async () => {
  const { state, save, bind, options } = setup();
  const remote = { profileId: 'existing-rook-id', accountSchemaVersion: 1, entities: new Map() };
  const restored = { ...state, profile: { ...state.profile, id: remote.profileId, onboardingComplete: true },
    workouts: [{ id: 'old-session-id', exercises: [{ id: 'old-exercise-id' }] }] };
  options.readCloud = vi.fn(async () => remote);
  options.materialize = vi.fn(() => restored);
  const result = await signInFirstRunAccount(options);
  expect(options.materialize).toHaveBeenCalledWith(state, remote);
  expect(result).toMatchObject({ status: 'restored', profileId: remote.profileId });
  expect(result.restored.workouts[0].id).toBe('old-session-id');
  expect(save).toHaveBeenCalledWith(restored, { reason: 'cloud-recovery:user-confirmed' });
  expect(bind).toHaveBeenCalledWith(options.storage, remote.profileId, { accountUid: 'google-owner' });
});
it('keeps cloud errors and invalid/ambiguous replies out of new-user onboarding', async () => {
  const { options, save } = setup();
  options.readCloud = vi.fn(async () => { throw new Error('offline'); });
  await expect(signInFirstRunAccount(options)).rejects.toThrow('offline');
  options.readCloud = vi.fn(async () => ({ profileId: null, accountSchemaVersion: 1, entities: new Map() }));
  await expect(signInFirstRunAccount(options)).rejects.toThrow('could not verify');
  expect(save).not.toHaveBeenCalled();
});
it('blocks populated/protected local data and a different first-run owner before provider sign-in', async () => {
  const { options, client, storage, save } = setup();
  options.readLocal = () => ({ status: 'ready' });
  await expect(signInFirstRunAccount(options)).rejects.toThrow('Local data already exists');
  expect(client.authApi.signInWithPopup).not.toHaveBeenCalled();
  options.readLocal = () => ({ status: 'empty' });
  writeFirstRunAccountClaim(storage, { uid: 'another-owner', profileId: 'other-profile' });
  await expect(signInFirstRunAccount(options)).rejects.toThrow('already associated');
  expect(save).not.toHaveBeenCalled();
});
it('provider cancellation does not mutate local state or claim ownership', async () => {
  const { options, client, storage, save } = setup();
  const cancelled = Object.assign(new Error('Closed'), { code: 'auth/popup-closed-by-user' });
  client.authApi.signInWithPopup.mockRejectedValueOnce(cancelled);
  await expect(signInFirstRunAccount(options)).rejects.toBe(cancelled);
  expect(readFirstRunAccountClaim(storage)).toBeNull(); expect(save).not.toHaveBeenCalled();
});
it('refuses a cloud reply after the local first-run state changed', async () => {
  const { options, state, save, storage } = setup();
  options.readCloud = vi.fn(async () => { state.profile.name = 'Changed setup'; return { profileId: null, accountSchemaVersion: null, entities: new Map() }; });
  await expect(signInFirstRunAccount(options)).rejects.toThrow('changed during sign-in');
  expect(readFirstRunAccountClaim(storage)).toBeNull(); expect(save).not.toHaveBeenCalled();
});
