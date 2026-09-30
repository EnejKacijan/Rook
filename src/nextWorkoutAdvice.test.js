import { describe, expect, it } from 'vitest';
import { progressionFor, serializeState, deserializeState } from './domain.js';
import { nextWorkoutAdvice } from './nextWorkoutAdvice.js';
import { createReturningUserFixture } from './demoFixture.js';

const exercise = { exerciseId: 'barbell-bench-press', repMin: 6, repMax: 8, targetRir: 1, defaultIncrement: 1 };
const exposure = (id, reps, feedback, options = {}) => ({
  id,
  completedAt: `2026-09-${id === 'first' ? '01' : '08'}T12:00:00Z`,
  sessionFeedback: feedback,
  ...options,
  exercises: [{ ...exercise, sets: reps.map(value => ({ planned: true, completed: true, reps: value, weight: 40, rir: 1 })) }],
});
const history = (feedback, reps = [8, 8]) => [exposure('first', reps, 'about_right'), exposure('second', reps, feedback)];

describe('next-workout advice from session feedback and logged sets', () => {
  it('keeps a result-supported increase when the whole session felt easier', () => {
    const workouts = history('easier');
    const before = structuredClone(workouts);
    expect(nextWorkoutAdvice(exercise, workouts)).toMatchObject({ type: 'progress', weight: 41 });
    expect(nextWorkoutAdvice(exercise, workouts).detail).toContain('whole last session also felt easier');
    expect(workouts).toEqual(before);
  });

  it('holds an otherwise earned increase after a harder session without changing target or history', () => {
    const workouts = history('harder');
    expect(progressionFor(exercise, workouts).weight).toBe(41);
    expect(nextWorkoutAdvice(exercise, workouts)).toMatchObject({ type: 'hold', title: 'Repeat before increasing' });
    expect(nextWorkoutAdvice(exercise, workouts)).not.toHaveProperty('weight');
    expect(exercise.repMax).toBe(8);
    expect(workouts[1].exercises[0].sets[0].weight).toBe(40);
  });

  it('does not turn an easy whole-session rating into a load increase when this exercise missed reps', () => {
    const advice = nextWorkoutAdvice(exercise, history('easier', [7, 7]));
    expect(advice.type).toBe('hold');
    expect(advice.weight).toBeUndefined();
    expect(advice.detail).toContain('this exercise’s logged results still favor this step');
  });

  it('retains lighter-load review only after repeated exercise-specific broad misses', () => {
    expect(nextWorkoutAdvice(exercise, [exposure('second', [3, 3], 'harder')]).title).toBe('Repeat this load');
    const advice = nextWorkoutAdvice(exercise, history('harder', [3, 3]));
    expect(advice.title).toBe('Review the load');
    expect(advice.detail).toContain('Consider a lighter load');
    expect(advice).not.toHaveProperty('weight');
  });

  it('uses only the most recent matching exposure, not an unrelated session rating', () => {
    const workouts = [...history('easier'), { ...exposure('other', [8, 8], 'harder'), exercises: [{ exerciseId: 'back-squat', sets: [{ completed: true, reps: 8 }] }] }];
    expect(nextWorkoutAdvice(exercise, workouts).weight).toBe(41);
    expect(nextWorkoutAdvice(exercise, workouts).detail).toContain('easier');
  });

  it('leaves legacy, skipped, deload and early-ended ratings non-decisive', () => {
    for (const rating of [undefined, 'skipped']) {
      const workouts = history(rating);
      expect(nextWorkoutAdvice(exercise, workouts)).toEqual(progressionFor(exercise, workouts));
    }
    const steady = nextWorkoutAdvice(exercise, history('about_right'));
    expect(steady.weight).toBe(41);
    expect(steady.detail).toContain('about right');
    for (const extra of [{ endedEarly: true }, { adjustment: {} }, { optionalSessionId: 'optional' }, { trainingBlock: { plannedDeload: true } }]) {
      const workouts = history('harder');
      Object.assign(workouts[1], extra);
      expect(nextWorkoutAdvice(exercise, workouts)).toEqual(progressionFor(exercise, workouts));
    }
  });

  it('withholds advice on incomplete or advanced-mode results despite a rating', () => {
    const incomplete = history('easier');
    incomplete[1].exercises[0].sets[1].completed = false;
    expect(nextWorkoutAdvice(exercise, incomplete)).toBeNull();
    const advanced = history('easier');
    for (const workout of advanced) for (const set of workout.exercises[0].sets) set.setType = 'drop';
    expect(nextWorkoutAdvice(exercise, advanced)).toBeNull();
  });

  it('updates from a corrected persisted rating without touching the program', () => {
    const state = createReturningUserFixture(2);
    state.workouts = history('harder');
    const restored = deserializeState(serializeState(state));
    const originalProgram = structuredClone(restored.program);
    expect(nextWorkoutAdvice(exercise, restored.workouts).title).toBe('Repeat before increasing');
    restored.workouts[1].sessionFeedback = 'easier';
    expect(nextWorkoutAdvice(exercise, restored.workouts).weight).toBe(41);
    expect(restored.program).toEqual(originalProgram);
  });
});
