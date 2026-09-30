import { createReturningUserFixture } from '../demoFixture.js';
import { startWorkout } from '../domain.js';

// Synthetic session only; no owner profile is read or altered by this regression.
export function keepTrainingState(unfinished = [[1, 2]]) {
  const state = createReturningUserFixture(0);
  state.profile.showExerciseImages = false;
  state.profile.restTimerEnabled = true;
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  const workout = state.activeWorkout;
  workout.exercises = workout.exercises.slice(0, 5);
  workout.exercises.forEach((exercise, e) => {
    exercise.startedAt = workout.startedAt - 1000;
    exercise.sets.forEach((set, s) => Object.assign(set, {
      completed: !unfinished.some(([ei, si]) => ei === e && si === s),
      weight: 40, reps: 8, touched: true,
    }));
  });
  workout.exerciseIndex = 4;
  workout.rest = { seconds: 120, endsAt: Date.now() + 120000 };
  return state;
}
