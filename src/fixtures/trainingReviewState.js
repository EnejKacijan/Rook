import { buildProgram, isoDay, weekday } from '../domain.js';
import { saveWorkoutTemplate, templateDraft } from '../savedWorkouts.js';

// Explicit sample-data action, permitted only after startup establishes an empty
// local profile. Never replaces initialized data or bypasses recovery authority.
export function createTrainingReviewState(state) {
  if (state.profile.onboardingComplete || state.program || state.activeWorkout || state.activeOptionalSession
    || state.workouts.length || state.savedWorkoutTemplates.length || state.customExercises.length)
    throw new Error('Sample data can only be opened in a new empty local review. Your existing data was kept.');
  const profile = { ...state.profile, name: 'Sample athlete', ageRange: '18–29', sex: 'Prefer not to say',
    goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4,
    availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 60,
    environment: 'Commercial gym', trainingEnvironmentChoice: 'Commercial gym',
    primaryTrainingEnvironment: 'Commercial gym', equipment: ['full gym'],
    priorities: ['Balanced'], trainingPreferences: 'Upper / Lower', trainingSplitChoice: 'upper-lower',
    exercisePreference: 'No preference', effortStyle: 'Balanced workload · usually 3 sets · 1–2 RIR',
    onboardingComplete: true, preferredTrainingStyle: 'plan' };
  let next = { ...state, profile, program: buildProgram(profile), selectedDate: isoDay(), selectedDay: weekday(),
    ai: { available: true, provider: 'local-review' } };
  for (const [index, day] of next.program.days.entries()) {
    next = saveWorkoutTemplate(next, { ...templateDraft(day, next), name: `${day.name} · Sample` },
      { id: `local-review-workout-${index + 1}` });
  }
  return next;
}
