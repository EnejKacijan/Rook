import { describe, expect, it } from 'vitest';
import { blankState, hydrateStoredState } from '../domain.js';
import { createTrainingReviewState } from './trainingReviewState.js';

describe('explicit local sample profile', () => {
  it('creates reloadable canonical data without changing profile identity or input', () => {
    const initial = blankState(), before = structuredClone(initial);
    const sample = createTrainingReviewState(initial);
    expect(initial).toEqual(before);
    expect(sample.profile.id).toBe(initial.profile.id);
    expect(sample.profile.name).toBe('Sample athlete');
    expect(sample.savedWorkoutTemplates).toHaveLength(4);
    const restored = hydrateStoredState(JSON.parse(JSON.stringify(sample)));
    expect(restored.program.id).toBe(sample.program.id);
    expect(restored.savedWorkoutTemplates.map(item => item.id)).toEqual(sample.savedWorkoutTemplates.map(item => item.id));
    expect(JSON.stringify(sample)).not.toMatch(/rook_pro|entitlement|billing/);
  });
  it.each(['program', 'activeWorkout', 'activeOptionalSession', 'workouts', 'savedWorkoutTemplates', 'customExercises'])('refuses to replace a profile containing %s', field => {
    const state = blankState(); state[field] = Array.isArray(state[field]) ? [{}] : {};
    const before = structuredClone(state);
    expect(() => createTrainingReviewState(state)).toThrow(/existing data was kept/);
    expect(state).toEqual(before);
  });
  it('refuses an initialized no-plan profile', () => {
    const state = blankState(); state.profile.onboardingComplete = true;
    expect(() => createTrainingReviewState(state)).toThrow(/existing data was kept/);
  });
});
