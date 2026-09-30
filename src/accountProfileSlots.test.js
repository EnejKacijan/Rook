import { describe, expect, it } from 'vitest';
import { completeWorkout, hydrateStoredState, saveState } from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';
import { addFreestyleExercise, startFreestyleWorkout } from './freestyleWorkout.js';
import { ensureAccountSyncLedger } from './accountSyncOutbox.js';
import { deleteLocalState, INSTALL_META_KEY, readLocalState, PRIMARY_KEY } from './localStateStorage.js';
import { accountProfileSlot, clearAllProfileSlotArchives, cloudAccountProfileSlot, newSeparateProfileSlot, readProfileSlot,
  recoverInterruptedProfileSwitch, separateProfileSlot, switchProfileSlot } from './accountProfileSlots.js';
import { ACTIVE_PROFILE_SLOT_KEY, PROFILE_SWITCH_JOURNAL_KEY } from './profileSlotKeys.js';
import { resolveAccountStartup } from './accountStartup.js';
import { syncEntities } from './accountSyncModel.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null };
}
function owner() {
  const store = storage(), state = createReturningUserFixture(0);
  expect(saveState(state, { storage: store, reason: 'test-owner' })).toBe(true);
  ensureAccountSyncLedger(store, state.profile.id, { accountUid: 'owner-uid' });
  store.setItem('rook-account-signed-out-v1', 'true');
  return { store, state, raw: store.getItem(PRIMARY_KEY) };
}

describe('isolated ROOK profile slots', () => {
  it('preserves the signed-out owner and restores the exact data after using a separate profile', async () => {
    const { store, state, raw } = owner();
    const separate = newSeparateProfileSlot(state.profile.id);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target: separate,
      rememberSeparateFor: state.profile.id });
    expect(readLocalState(store, hydrateStoredState).state.profile.id).toBe(separate.profileId);
    expect(separate.marker.authAppName).toBe(`rook-sync-profile-${separate.profileId}`);
    expect(store.getItem('rook-account-signed-out-v1')).toBeNull();
    expect(accountProfileSlot(store, 'owner-uid').bundle[PRIMARY_KEY]).toBe(raw);
    expect(separateProfileSlot(store, state.profile.id).profileId).toBe(separate.profileId);
    let played = readLocalState(store, hydrateStoredState).state;
    played.profile.onboardingComplete = true;
    played.profile.preferredTrainingStyle = 'freestyle';
    played.profile.noPlanReceipt = { kind: 'first-run' };
    played = addFreestyleExercise(startFreestyleWorkout(played), 'plank');
    played.activeWorkout.exercises[0].sets[0].completed = true;
    played.activeWorkout.exercises[0].sets[0].reps = 30;
    played = completeWorkout(played);
    expect(saveState(played, { storage: store, reason: 'test-separate-workout' })).toBe(true);
    const separateRaw = store.getItem(PRIMARY_KEY);
    await switchProfileSlot({ storage: store, sourceProfileId: separate.profileId,
      target: readProfileSlot(store, state.profile.id), targetSignedOut: true });
    expect(store.getItem(PRIMARY_KEY)).toBe(raw);
    expect(store.getItem('rook-account-signed-out-v1')).toBe('true');
    expect(readProfileSlot(store, separate.profileId).bundle[PRIMARY_KEY]).toBe(separateRaw);
    expect(readProfileSlot(store, separate.profileId).bundle[PRIMARY_KEY]).toContain(played.workouts[0].id);
  });

  it('rolls back an interrupted switch to its protected source instead of opening onboarding', async () => {
    const { store, state, raw } = owner();
    const separate = newSeparateProfileSlot(state.profile.id);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target: separate });
    const before = store.getItem(ACTIVE_PROFILE_SLOT_KEY);
    store.setItem(PROFILE_SWITCH_JOURNAL_KEY, JSON.stringify({ version: 1,
      sourceProfileId: state.profile.id, sourceActiveRaw: null }));
    expect(recoverInterruptedProfileSwitch(store)).toBe(true);
    expect(store.getItem(PRIMARY_KEY)).toBe(raw);
    expect(store.getItem(ACTIVE_PROFILE_SLOT_KEY)).toBeNull();
    expect(before).not.toBeNull();
    expect(store.getItem(PROFILE_SWITCH_JOURNAL_KEY)).toBeNull();
  });
  it('rolls back a failed target write without replacing the owner profile', async () => {
    const { store, state, raw } = owner(), target = newSeparateProfileSlot(state.profile.id);
    const originalSet = store.setItem;
    let failOnce = true;
    store.setItem = (key, value) => {
      if (key === PRIMARY_KEY && failOnce) { failOnce = false; throw new Error('Storage write failed'); }
      return originalSet(key, value);
    };
    await expect(async () => switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target }))
      .rejects.toThrow('Storage write failed');
    expect(store.getItem(PRIMARY_KEY)).toBe(raw);
    expect(store.getItem(PROFILE_SWITCH_JOURNAL_KEY)).toBeNull();
    expect(store.getItem('rook-account-signed-out-v1')).toBe('true');
  });

  it('authorizes only the explicitly created separate first run, keeping the parent archived', async () => {
    const { store, state, raw } = owner();
    const separate = newSeparateProfileSlot(state.profile.id);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target: separate });
    const startup = readLocalState(store, hydrateStoredState);
    const result = await resolveAccountStartup(startup, { storage: store, configured: () => true,
      getClient: async () => ({ auth: { currentUser: null, authStateReady: async () => {} } }) });
    expect(result).toMatchObject({ status: 'ready', firstRunVerified: true,
      accountCheck: 'user-confirmed-separate-profile' });
    expect(readProfileSlot(store, state.profile.id).bundle[PRIMARY_KEY]).toBe(raw);
    const failure = await resolveAccountStartup(startup, { storage: store, configured: () => true,
      getClient: async () => ({ auth: { currentUser: { uid: 'owner-uid' }, authStateReady: async () => {} } }) });
    expect(failure).toMatchObject({ status: 'account-recovery', code: 'account-identity-conflict' });
  });
  it('opens a different verified Google account in its own lineage without merging owner workouts', async () => {
    const { store, state, raw } = owner();
    const other = createReturningUserFixture(1);
    other.profile.id = 'other-profile';
    const remote = { profileId: other.profile.id, accountSchemaVersion: 1,
      entities: new Map([...syncEntities(other)].map(([key, entity]) => [key,
        { ...entity, profileId: other.profile.id, syncSchemaVersion: 1, revision: 1, deleted: false }])) };
    const target = cloudAccountProfileSlot('other-uid', remote);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target });
    expect(readLocalState(store, hydrateStoredState).state.profile.id).toBe(other.profile.id);
    expect(readLocalState(store, hydrateStoredState).state.workouts.map(item => item.id))
      .toEqual(other.workouts.map(item => item.id));
    expect(accountProfileSlot(store, 'owner-uid').bundle[PRIMARY_KEY]).toBe(raw);
    await switchProfileSlot({ storage: store, sourceProfileId: other.profile.id,
      target: accountProfileSlot(store, 'owner-uid'), targetSignedOut: true });
    expect(store.getItem(PRIMARY_KEY)).toBe(raw);
    expect(accountProfileSlot(store, 'other-uid').profileId).toBe(other.profile.id);
  });
  it('includes every archived namespace in the separately confirmed Delete Local Data operation', async () => {
    const { store, state } = owner(), separate = newSeparateProfileSlot(state.profile.id);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target: separate,
      rememberSeparateFor: state.profile.id });
    const clearPhotos = async () => {};
    await deleteLocalState({ storage: store, clearPhotos, clearProfiles: clearAllProfileSlotArchives });
    expect(store.getItem(PRIMARY_KEY)).toBeNull();
    expect(store.getItem(ACTIVE_PROFILE_SLOT_KEY)).toBeNull();
    expect(store.getItem(`rook-profile-slot-v1:${state.profile.id}`)).toBeNull();
    expect(store.getItem(`rook-separate-slot-v1:${state.profile.id}`)).toBeNull();
    expect(JSON.parse(store.getItem(INSTALL_META_KEY)).deletePending).toBe(false);
  });
  it('keeps deletion visibly incomplete if an archived profile cannot be cleared', async () => {
    const { store, state } = owner(), separate = newSeparateProfileSlot(state.profile.id);
    await switchProfileSlot({ storage: store, sourceProfileId: state.profile.id, target: separate });
    const remove = store.removeItem;
    store.removeItem = key => {
      if (key === `rook-profile-slot-v1:${state.profile.id}`) throw new Error('Archive removal failed');
      return remove(key);
    };
    await expect(deleteLocalState({ storage: store, clearProfiles: clearAllProfileSlotArchives }))
      .rejects.toThrow('Archive removal failed');
    expect(JSON.parse(store.getItem(INSTALL_META_KEY)).deletePending).toBe(true);
    expect(store.getItem(`rook-profile-slot-v1:${state.profile.id}`)).not.toBeNull();
  });
});
