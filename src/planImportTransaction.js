import { validateProgram, estimateSessionMinutes } from './domain.js';
import { normalizeTrainingBlocksState } from './trainingBlocks.js';
import { addPlanVersion } from './planHistory.js';
import { normalizeAdvancedLoggingState } from './advancedLogging.js';
import { normalizeGymProfilesState } from './gymProfiles.js';
import { normalizeCustomExercisesState } from './customExercises.js';
import { persistPlanImportMatches, planImportSafetyIssues } from './planImportMatching.js';

// Construct independently; callers persist this value before publishing it.
export function preparePlanImport(state, program, importedProfile, { date, weekday, initial = false } = {}) {
  if (state.activeWorkout || state.activeOptionalSession)
    throw new Error('Finish or discard your active workout before replacing your plan.');
  const next = structuredClone(state);
  const candidate = structuredClone(program);
  if(candidate.importMetadata?.pendingHybrid?.length)throw new Error('Resolve the source prescriptions and optional work before importing.');
  if(candidate.days.some(day=>day.exercises.some(ex=>ex.hybridSource&&['unresolved','needs-name-review'].includes(ex.matchStatus))))throw new Error('Resolve the source exercise choices before importing.');
  const safetyIssues=planImportSafetyIssues(candidate,state.profile);
  if(safetyIssues.length)throw new Error(safetyIssues[0]);
  const profile = { ...state.profile, environment: importedProfile.environment,
    equipment: importedProfile.equipment, onboardingComplete: true,
    rirEnabled: Boolean(state.profile.rirEnabled || candidate.days.some(day => day.exercises.some(exercise => Number.isFinite(exercise.targetRir)))),
    availableDays: candidate.days.map(day => day.weekday), daysPerWeek: candidate.days.length };
  candidate.days.forEach(day => { day.estimatedMinutes = estimateSessionMinutes(day.exercises); });
  const checked = validateProgram(candidate, { ...profile, sessionMinutes: null }, {
    allowImportedExercises: true, preserveSchedule: true, ignoreTrainingSafety: true,
  });
  // Apply safety above and existing start-time safety both remain fail-closed;
  // neither rewrites the user's prescription automatically.
  if (!checked.valid) throw new Error('Review the workout days and prescriptions before importing.');
  next.profile = profile;
  next.program = { ...candidate, goalAtCreation: null };
  next.selectedDay = weekday;
  next.selectedDate = date;
  next.ai = { ...next.ai, lastPlanSource: 'ai-import' };
  next.todayAdaptation = null;
  next.weekScheduleOverrides = {};
  next.workoutOccurrenceOverrides = {};
  normalizeAdvancedLoggingState(next);
  normalizeGymProfilesState(next);
  persistPlanImportMatches(next,candidate);
  normalizeCustomExercisesState(next);
  normalizeTrainingBlocksState(next);
  addPlanVersion(next, { previousProgram: state.program, source: 'Imported plan',
    reason: initial ? 'Initial plan imported' : 'Current plan replaced by import' });
  return next;
}

export function persistPlanImport(state, program, profile, options, persist) {
  const next = preparePlanImport(state, program, profile, options);
  if (!persist(next)) throw new Error('ROOK couldn’t save this plan. Your current plan is unchanged. Try again.');
  return next;
}
