import {hasEstablishedData, INSTALL_META_KEY} from './localStateStorage.js';

export const FIRST_RUN_WELCOME_KEY = 'rook.first-run-welcome.v1';

export function hasSeenFirstRunWelcome(storage = globalThis.localStorage) {
  try { return storage.getItem(FIRST_RUN_WELCOME_KEY) === 'seen'; }
  catch { return true; } // An optional introduction must never impede recovery.
}

export function shouldShowFirstRunWelcome(startup, state, storage = globalThis.localStorage) {
  if (startup?.status !== 'empty' || startup.firstRunVerified !== true || startup.restoredFromCloud
    || state?.profile?.onboardingComplete || hasEstablishedData(state) || hasSeenFirstRunWelcome(storage)) return false;
  try {
    const meta = JSON.parse(storage.getItem(INSTALL_META_KEY));
    return !meta?.explicitDeleteAt && !meta?.everInitialized;
  } catch { return false; }
}

export function acknowledgeFirstRunWelcome(storage = globalThis.localStorage) {
  try { storage.setItem(FIRST_RUN_WELCOME_KEY, 'seen'); }
  catch { /* Keep moving to the requested route if the optional preference fails. */ }
}

export function initialFirstRunEntry(startup, state, storage = globalThis.localStorage) {
  if (shouldShowFirstRunWelcome(startup, state, storage)) return 'welcome';
  // Preserve the existing unfinished questionnaire path. New users who have
  // left the welcome instead return to the landing with every starting option.
  return startup.firstRunVerified && startup.status === 'ready' && !state.profile.onboardingComplete
    && !hasSeenFirstRunWelcome(storage) ? 'personalize' : null;
}
