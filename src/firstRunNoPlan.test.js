import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { blankState, deserializeState, serializeState } from './domain.js';
import { addFreestyleExercise, startFreestyleWorkout } from './freestyleWorkout.js';
import { templateDraft } from './savedWorkouts.js';
import { saveFirstRunWorkout, startFirstRunFreestyle } from './firstRunNoPlan.js';
import { cancelActiveWorkout, hasMeaningfulSessionWork } from './workoutCancellation.js';
import { assertStateContinuity } from './localStateStorage.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T12:00:00')); });
afterEach(() => vi.useRealTimers());

it('opening either first-run route leaves the original profile untouched until Save or Start', () => {
  const state = blankState(), before = structuredClone(state);
  expect(state).toEqual(before);
  expect(state.profile.onboardingComplete).toBe(false);
  expect(state.activeWorkout).toBeNull();
  expect(state.savedWorkoutTemplates).toEqual([]);
});

it('saves one reusable workout and completes first-run in the same valid state', () => {
  const state = blankState();
  const source = addFreestyleExercise(startFreestyleWorkout(state), 'plank');
  const draft = { ...templateDraft(source.activeWorkout, state), name: 'Core day' };
  const next = saveFirstRunWorkout(state, draft, { id: 'first-run-workout' });
  expect(state.profile.onboardingComplete).toBe(false);
  expect(state.savedWorkoutTemplates).toEqual([]);
  expect(next.profile).toMatchObject({ onboardingComplete: true, preferredTrainingStyle: 'own-workouts', noPlanReceipt: { kind: 'first-run' } });
  expect(next.savedWorkoutTemplates).toHaveLength(1);
  expect(next.savedWorkoutTemplates[0].name).toBe('Core day');
  expect(next.activeWorkout).toBeNull();
  expect(deserializeState(serializeState(next), { strict: true }).savedWorkoutTemplates[0].id).toBe('first-run-workout');
  expect(saveFirstRunWorkout(next, draft, { id: 'first-run-workout' })).toBe(next);
});

it('starts one freestyle session only on explicit Start, reloads it, and cancels without history or onboarding reset', () => {
  const state = blankState();
  const next = startFirstRunFreestyle(state);
  expect(state.activeWorkout).toBeNull();
  expect(next.profile).toMatchObject({ onboardingComplete: true, preferredTrainingStyle: 'freestyle', noPlanReceipt: { kind: 'first-run' } });
  expect(next.activeWorkout.source).toBe('freestyle');
  expect(next.activeWorkout.exercises).toHaveLength(0);
  expect(startFirstRunFreestyle(next)).toBe(next);
  const resumed = deserializeState(serializeState(next), { strict: true });
  expect(resumed.activeWorkout.id).toBe(next.activeWorkout.id);
  expect(hasMeaningfulSessionWork(resumed.activeWorkout)).toBe(false);
  const cancelled = cancelActiveWorkout(resumed, resumed.activeWorkout.id);
  expect(() => assertStateContinuity(resumed, cancelled)).not.toThrow();
  expect(cancelled.activeWorkout).toBeNull();
  expect(cancelled.workouts).toEqual(state.workouts);
  expect(cancelled.profile.onboardingComplete).toBe(true);
  expect(cancelled.profile.preferredTrainingStyle).toBe('freestyle');
  expect(cancelActiveWorkout(cancelled, resumed.activeWorkout.id)).toBe(cancelled);
});

it('does not permit an unrelated plan or history to disappear under the freestyle exception', () => {
  const active = startFirstRunFreestyle(blankState());
  const lostProfile = { ...active, activeWorkout: null, profile: { ...active.profile, onboardingComplete: false } };
  expect(() => assertStateContinuity(active, lostProfile)).toThrow(/profile-reset-blocked/);
  const alteredReceipt = { ...active, activeWorkout: null, profile: { ...active.profile, noPlanReceipt: null } };
  expect(() => assertStateContinuity(active, alteredReceipt)).toThrow(/empty-write-blocked/);
  const withHistory = { ...active, workouts: [{ id: 'previous-session' }] };
  const lostHistory = { ...active, activeWorkout: null, workouts: [] };
  expect(() => assertStateContinuity(withHistory, lostHistory)).toThrow(/empty-write-blocked/);
});
