import { describe, expect, it } from 'vitest';
import { canActivateGeneratedPlan, canCreateSavedWorkout, coachResponsesLeft,
  FREE_SAVED_WORKOUT_LIMIT, hasProAccess, savedWorkoutCount, shouldUsePremiumStyle } from './proPolicy.js';

const free = { status: 'free', entitlement: null };
const pro = { status: 'active', entitlement: 'rook_pro' };
const state = count => ({ savedWorkoutTemplates: Array.from({ length: count }, (_, index) => ({ id: `saved-${index}` })),
  workouts: Array.from({ length: 100 }, () => ({})), program: { days: Array.from({ length: 5 }) } });

describe('ROOK Free / Pro capability policy', () => {
  it('rollout off leaves current app behavior untouched', () => {
    expect(canActivateGeneratedPlan(free, false)).toBe(true);
    expect(canCreateSavedWorkout(state(8), free, false)).toBe(true);
    expect(shouldUsePremiumStyle('premium', free, false)).toBe(true);
  });
  it('requires a verified entitlement for a new generated plan and Premium choice', () => {
    expect(canActivateGeneratedPlan(free, true)).toBe(false);
    expect(canActivateGeneratedPlan(pro, true)).toBe(true);
    expect(hasProAccess({ status: 'active', entitlement: 'other' })).toBe(false);
    expect(shouldUsePremiumStyle('premium', free, true)).toBe(false);
    expect(shouldUsePremiumStyle('premium', pro, true)).toBe(true);
    expect(shouldUsePremiumStyle('premium', { status: 'unknown', lastVerifiedActive: true }, true)).toBe(true);
    expect(shouldUsePremiumStyle('premium', { status: 'unknown' }, true)).toBe(true);
    expect(shouldUsePremiumStyle('premium', { status: 'loading' }, true)).toBe(true);
    expect(shouldUsePremiumStyle('premium', { status: 'unknown', lastVerifiedActive: false }, true)).toBe(false);
  });
  it('counts only reusable live templates and retains over-limit collections', () => {
    expect(FREE_SAVED_WORKOUT_LIMIT).toBe(4);
    for (const count of [0, 1, 3]) expect(canCreateSavedWorkout(state(count), free, true)).toBe(true);
    expect(savedWorkoutCount(state(4))).toBe(4);
    expect(canCreateSavedWorkout(state(4), free, true)).toBe(false);
    expect(canCreateSavedWorkout(state(5), free, true)).toBe(false);
    expect(canCreateSavedWorkout(state(5), pro, true)).toBe(true);
  });
  it('uses a lifetime three-response allowance with no date-based reset', () => {
    expect([0, 1, 2, 3, 4].map(coachResponsesLeft)).toEqual([3, 2, 1, 0, 0]);
  });
});
