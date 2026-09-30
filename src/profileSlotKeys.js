export const ACTIVE_PROFILE_SLOT_KEY = 'rook-active-profile-slot-v1';
export const PROFILE_SWITCH_JOURNAL_KEY = 'rook-profile-switch-journal-v1';
export const PROFILE_SWITCHING_KEY = 'rook-profile-switching-v1';
export const PROFILE_SLOT_PREFIX = 'rook-profile-slot-v1:';
export const ACCOUNT_SLOT_PREFIX = 'rook-account-slot-v1:';
export const SEPARATE_SLOT_PREFIX = 'rook-separate-slot-v1:';

export function activeProfileSlot(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(ACTIVE_PROFILE_SLOT_KEY) || 'null');
    return value?.version === 1 && typeof value.profileId === 'string'
      && typeof value.authAppName === 'string' ? value : null;
  } catch { return null; }
}
