// Product policy is separate from profile/sync data. Billing status must come
// from RevenueCat, never from a user-editable workout or appearance preference.
export const ROOK_PRO_ENTITLEMENT = 'rook_pro';
export const FREE_SAVED_WORKOUT_LIMIT = 4;
export const FREE_COACH_RESPONSES = 3;

// Rollout is deliberately disabled in the current build. Enabling the client
// alone cannot authorize server-side Coach generation or a purchase.
export const ROOK_PRO_ROLLOUT = import.meta.env?.VITE_ROOK_PRO_ROLLOUT === 'true'
  && Boolean(import.meta.env?.VITE_ROOK_REVENUECAT_PUBLIC_KEY)
  && Boolean(import.meta.env?.VITE_ROOK_PRIVACY_URL)
  && Boolean(import.meta.env?.VITE_ROOK_TERMS_URL);

export function hasProAccess(access) {
  return access?.status === 'active' && access?.entitlement === ROOK_PRO_ENTITLEMENT;
}

export function canActivateGeneratedPlan(access, rollout = ROOK_PRO_ROLLOUT, state) {
  // The first personal plan belongs to Free. Existing canonical plan history
  // retains its original version even when the current plan is stopped/changed.
  const usedFirstPlan = state && (state.program?.source === 'ai'
    || state.ai?.lastPlanSource === 'ai'
    || state.planVersions?.some(version => version.program?.source === 'ai'));
  return !rollout || hasProAccess(access) || Boolean(state && !usedFirstPlan);
}

export function savedWorkoutCount(state) {
  // Deleted templates are removed from this canonical live collection. Plan
  // days, completed workouts and restored over-limit collections do not count.
  return (state?.savedWorkoutTemplates || []).length;
}

export function canCreateSavedWorkout(state, access, rollout = ROOK_PRO_ROLLOUT) {
  return !rollout || hasProAccess(access) || savedWorkoutCount(state) < FREE_SAVED_WORKOUT_LIMIT;
}

export function shouldUsePremiumStyle(preferred, access, rollout = ROOK_PRO_ROLLOUT) {
  if (preferred !== 'premium') return false;
  if (!rollout) return true;
  // Loading or an offline check is not a confirmed expiry. Preserve an existing
  // Premium preference until this account has actually been verified Free.
  return hasProAccess(access) || (['loading', 'unknown'].includes(access?.status)
    && access?.lastVerifiedActive !== false);
}

export function coachResponsesLeft(used) {
  return Math.max(0, FREE_COACH_RESPONSES - Math.max(0, Number(used) || 0));
}
