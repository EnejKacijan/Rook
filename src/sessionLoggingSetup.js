import {exerciseCatalog,exerciseMeasure} from './domain.js';
import {loggingModeOf,normalizeSetLogging} from './advancedLogging.js';
import {hasMeaningfulExerciseProgress} from './upNextRemoval.js';

const isLoggingMode = mode => mode === 'normal' || mode === 'per_side';

export function normalizeExerciseLoggingPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, mode]) => id && isLoggingMode(mode)));
}

export function savedExerciseLoggingMode(profile, exerciseId) {
  const preferences = profile?.exerciseLoggingPreferences;
  return preferences && Object.hasOwn(preferences, exerciseId) && isLoggingMode(preferences[exerciseId])
    ? preferences[exerciseId] : null;
}

export function clearSavedExerciseLoggingMode(state, exerciseId) {
  if (!savedExerciseLoggingMode(state.profile, exerciseId)) return state;
  const preferences = {...state.profile.exerciseLoggingPreferences};
  delete preferences[exerciseId];
  return {...state, profile:{...state.profile, exerciseLoggingPreferences:preferences}};
}

export function supportsPerSideLogging(exercise) {
  return Boolean(exercise && exerciseMeasure(exercise)!=='seconds' &&
    (exercise.perSideLoggingAvailable === true || loggingModeOf(exercise)==='per_side' || exercise.unilateral ||
      exerciseCatalog[exercise.exerciseId]?.unilateral ||
      exercise.importedExercise?.loggingMode==='per_side'));
}

function exerciseWithLoggingMode(exercise, mode) {
  const updated = {...exercise, perSideLoggingAvailable:supportsPerSideLogging(exercise), loggingMode:mode};
  updated.sets = exercise.sets.map(set => normalizeSetLogging({...set}, updated));
  return updated;
}

// Apply a personal default to newly prepared reps sets. A prescription with
// explicit left/right targets owns its logging format.
export function applySavedExerciseLoggingMode(profile, exercise) {
  const mode = savedExerciseLoggingMode(profile, exercise.exerciseId);
  if (!mode || mode === loggingModeOf(exercise) || !supportsPerSideLogging(exercise)) return exercise;
  const hasSideTargets = exercise.sets.some(set =>
    Object.values(set.sides || {}).some(side =>
      side?.reps != null || side?.weight != null || side?.rir != null));
  return hasSideTargets ? exercise : exerciseWithLoggingMode(exercise, mode);
}

function requestedExercise(workout, {sessionId, exerciseId, expectedExerciseId}) {
  return workout?.id === sessionId && workout.exercises.find(entry =>
    entry.id === exerciseId && (!expectedExerciseId || entry.exerciseId === expectedExerciseId));
}

export function sessionLoggingChoice(workout, exercise) {
  const choice = workout?.loggingSetupChoices?.[exercise?.id];
  if (!choice || choice.exerciseId !== exercise?.exerciseId || !isLoggingMode(choice.mode)) return null;
  return choice.futureOnly || choice.mode === loggingModeOf(exercise) ? choice : null;
}

export function changeSessionLoggingMode(state, request, mode) {
  const active = state.activeWorkout;
  const exercise = requestedExercise(active, request);
  if (!exercise)
    return {state,error:'This exercise is no longer in the active workout.'};
  if (!isLoggingMode(mode) || mode === 'per_side' && !supportsPerSideLogging(exercise))
    return {state,error:'This logging mode is not available for this exercise.'};
  const futureOnly = hasMeaningfulExerciseProgress(active, exercise.id);
  const changing = !futureOnly && loggingModeOf(exercise) !== mode;
  const choice = {exerciseId:exercise.exerciseId, mode, futureOnly};
  const previous = sessionLoggingChoice(active, exercise);
  if (!changing && previous?.mode === mode && previous.futureOnly === futureOnly) return {state, error:null};
  const activeWorkout = {
    ...active,
    loggingSetupChoices:{...active.loggingSetupChoices, [exercise.id]:choice},
    ...(changing ? {
      exercises:active.exercises.map(entry => entry === exercise ? exerciseWithLoggingMode(entry, mode) : entry),
      updatedAt:Date.now(),
    } : {}),
  };
  return {state:{...state, activeWorkout}, error:null};
}

export function resolveSessionLoggingChoice(state, request, mode, action) {
  const active = state.activeWorkout;
  const exercise = requestedExercise(active, request);
  const choice = sessionLoggingChoice(active, exercise);
  if (!choice || choice.mode !== mode)
    throw Error('This logging setup changed. Choose a mode again from Exercise options.');
  if (action === 'hide') {
    const choices = {...active.loggingSetupChoices};
    delete choices[exercise.id];
    return {...state, activeWorkout:{...active, loggingSetupChoices:choices}};
  }
  if (savedExerciseLoggingMode(state.profile, exercise.exerciseId) === mode) return state;
  const exerciseLoggingPreferences = {...state.profile.exerciseLoggingPreferences, [exercise.exerciseId]:mode};
  return {...state, profile:{...state.profile, exerciseLoggingPreferences}};
}
