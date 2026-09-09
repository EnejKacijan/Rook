import { describe, it, expect } from 'vitest';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { blankState, completeWorkout, deserializeState, isoDay } from './domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from './freestyleWorkout.js';

describe('same-day completed workouts', () => {
  it('keeps independent same-name records, sorts latest first without mutating history', () => {
    const rows = [
      { id: 'a', name: 'Same', workoutDateKey: '2026-09-08', completedAt: '2026-09-08T08:00:00Z' },
      { id: 'b', name: 'Same', source: 'freestyle', workoutDateKey: '2026-09-08', completedAt: '2026-09-08T10:00:00Z' },
      { id: 'c', workoutDateKey: '2026-09-09', completedAt: '2026-09-09T10:00:00Z' },
      { id: 'active', workoutDateKey: '2026-09-08' },
    ];
    const before = structuredClone(rows);
    expect(completedWorkoutsForDate(rows, '2026-09-08').map(w => w.id)).toEqual(['b', 'a']);
    expect(rows).toEqual(before);
    expect(completedWorkoutsForDate(rows, '2026-09-07')).toEqual([]);
    expect(completedWorkoutsForDate([rows[1], {...rows[1], id:'a'}], '2026-09-08').map(w=>w.id)).toEqual(['a','b']);
  });
  it('finishing two sessions appends both, survives reload and preserves the plan', () => {
    let state = blankState();
    const plan = structuredClone(state.program);
    for (let i = 0; i < 2; i++) {
      state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
      Object.assign(state.activeWorkout.exercises[0].sets[0], {reps: 8, completed: true});
      state = completeWorkout(state);
    }
    expect(state.workouts).toHaveLength(2);
    expect(new Set(state.workouts.map(w=>w.id)).size).toBe(2);
    expect(state.program).toEqual(plan);
    const reloaded = deserializeState(JSON.stringify(state));
    expect(completedWorkoutsForDate(reloaded.workouts, isoDay())).toHaveLength(2);
    expect(reloaded.workouts).toMatchObject(state.workouts);
  });
});
