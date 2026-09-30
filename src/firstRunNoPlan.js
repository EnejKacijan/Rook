import { isoDay, weekday } from './domain.js';
import { startFreestyleWorkout } from './freestyleWorkout.js';
import { saveWorkoutTemplate } from './savedWorkouts.js';

function completeNoPlanChoice(state, style) {
  const selectedDate = isoDay();
  return {
    ...state,
    profile: {
      ...state.profile,
      onboardingComplete: true,
      preferredTrainingStyle: style,
      noPlanReceipt: { kind: 'first-run' },
    },
    selectedDate,
    selectedDay: weekday(`${selectedDate}T12:00:00`),
  };
}

export function saveFirstRunWorkout(state, draft, options) {
  if (state.profile.onboardingComplete) return state;
  const saved = saveWorkoutTemplate(state, draft, options);
  return saved === state ? state : completeNoPlanChoice(saved, 'own-workouts');
}

export function startFirstRunFreestyle(state) {
  if (state.profile.onboardingComplete) return state;
  // Validate and create the session before completing onboarding. A failed start
  // leaves the first-run profile and its storage authority unchanged.
  return completeNoPlanChoice(startFreestyleWorkout(state), 'freestyle');
}
