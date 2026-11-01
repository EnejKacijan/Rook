import {activeProfileSlot} from './profileSlotKeys.js';
export const PRIVACY_KEY = 'rook-privacy-preferences-v1';
export const AI_CONSENT_VERSION = '2026-11-01';
export const PRIVACY_CHANGED = 'rook:privacy-changed';
const analyticsKeys = ['lift-funnel-events-v1', 'lift-funnel-once-v1', 'lift-funnel-session-once-v1'];
export const privacyStorageKey = (storage=globalThis.localStorage) => {
  const profileId=activeProfileSlot(storage)?.profileId;
  return profileId?`${PRIVACY_KEY}:${encodeURIComponent(profileId)}`:PRIVACY_KEY;
};

export function privacyPreferences() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(privacyStorageKey()) || 'null');
    return {analytics: value?.analytics === true, ai: value?.ai === true && value?.aiVersion === AI_CONSENT_VERSION};
  } catch { return {analytics: false, ai: false}; }
}
export function clearUsageHistory() {
  for (const name of ['localStorage', 'sessionStorage'])
    for (const key of analyticsKeys) try { globalThis[name]?.removeItem(key); } catch { /* Nonessential data must not block training. */ }
}
export function savePrivacyPreference(key, enabled) {
  if (!['analytics', 'ai'].includes(key)) throw new Error('Unknown privacy preference.');
  const preferences = privacyPreferences();
  const value = {...preferences, [key]: enabled === true, aiVersion: AI_CONSENT_VERSION, updatedAt: new Date().toISOString()};
  // An unavailable store must never be presented as a saved consent.
  globalThis.localStorage.setItem(privacyStorageKey(), JSON.stringify(value));
  if (!value.analytics) clearUsageHistory();
  globalThis.dispatchEvent?.(new Event(PRIVACY_CHANGED));
  return value;
}
export function initializePrivacyDefaults() {
  if (!privacyPreferences().analytics) clearUsageHistory();
}

let presenter = null;
export function bindAiConsentPresenter(next) {
  presenter = next;
  return () => { if (presenter === next) presenter = null; };
}
export async function requireAiConsent({signal} = {}) {
  const scope=privacyStorageKey();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (privacyPreferences().ai) return;
  const accepted = presenter ? await presenter({signal}) : false;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!accepted || scope!==privacyStorageKey() || !privacyPreferences().ai) throw Object.assign(new Error('AI data sharing is off. You can change it in Profile → Privacy & legal. Your local training is unchanged.'), {code:'ai-consent-required'});
}
