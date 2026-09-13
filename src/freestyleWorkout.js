import { exerciseCatalog, exerciseLoadRequirement, isoDay, uid, workoutSetSummary, previousExercise } from './domain.js';
import { planEditorExerciseAllowed } from './exerciseEligibility.js';
import { availableCustomExerciseItems, customExerciseSnapshot } from './customExercises.js';
import { effectiveGymContext } from './gymProfiles.js';
import { compileProfileTrainingSafety, trainingSafetyBlocks } from './trainingSafety.js';
import { combinedAdjustment } from './combinedWorkoutLifecycle.js';

export function freestyleCatalog(state) {
  const profile = effectiveGymContext(state, state.activeWorkout || {}).profile;
  const safety = compileProfileTrainingSafety(profile, Object.values(exerciseCatalog));
  if (trainingSafetyBlocks(safety.status)) return [];
  return [...Object.values(exerciseCatalog), ...availableCustomExerciseItems(state)].filter(item => planEditorExerciseAllowed(item, profile, safety));
}

export function freestyleEffortLimit(state, exerciseId) {
  return compileProfileTrainingSafety(state.profile, Object.values(exerciseCatalog)).constraints.minRirByExerciseId?.[exerciseId] ?? null;
}

export function startFreestyleWorkout(state, now = Date.now()) {
  if(combinedAdjustment(state))throw new Error('Finish or cancel the combined workout before starting another session.');
  if (state.activeWorkout || state.activeOptionalSession) throw new Error('A workout is already in progress. Resume or finish it first.');
  const safety = compileProfileTrainingSafety(state.profile, Object.values(exerciseCatalog));
  if (trainingSafetyBlocks(safety.status)) throw new Error(safety.message || 'Review your training restrictions first.');
  const date = isoDay(new Date(now));
  return { ...state, selectedDate: date, activeWorkout: {
    id: uid('active'), source: 'freestyle', name: 'Freestyle workout', workoutName: 'Freestyle workout',
    canonicalPlanDate: date, workoutDateKey: date, templateId: null, programDayId: null,
    sourcePlanSlotId: null, startedAt: now, updatedAt: now,
    timeZoneAtStart: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    utcOffsetMinutesAtStart: new Date(now).getTimezoneOffset(),
    exerciseIndex: 0, rest: null, handledSupersetRestRounds: [], exercises: [],
    warmupPlan: { mode: 'none' },
  }};
}

export function addFreestyleExercise(state, exerciseId) {
  const active = state.activeWorkout;
  if (active?.source !== 'freestyle') return state;
  if (active.exercises.some(e => e.exerciseId === exerciseId)) return state;
  const item = freestyleCatalog(state).find(e => e.id === exerciseId);
  if (!item) throw new Error('This exercise is no longer available with your equipment and restrictions. Nothing was added.');
  const record = state.customExercises?.find(e => e.id === exerciseId);
  const exercise = {
    id: uid('freestyle-exercise'), exerciseId, prescriptionSource: 'freestyle', loadRequirement: exerciseLoadRequirement(item),
    ...(record ? { exerciseSource: 'custom', importedName: item.name, originalImportedName: item.name, importedExercise: customExerciseSnapshot(record), matchStatus: 'confirmed-custom', measure: item.measure } : {}),
    loggingMode: item.loggingMode || 'normal', repMin: null, repMax: null, targetRir: null,
    restSeconds: item.restSeconds || 90, defaultIncrement: item.increment || 1,
    sets: [{ id: uid('set'), weight: null, reps: null, rir: null, completed: false, planned: true, added: false,
      ...(item.loggingMode === 'per_side' ? { sides: { left: { reps: null }, right: { reps: null } } } : {}) }],
  };
  return { ...state, activeWorkout: { ...active, updatedAt: Date.now(), exercises: [...active.exercises, exercise] } };
}

export function removeFreestyleExercise(state, id) {
  const active = state.activeWorkout;
  if (active?.source !== 'freestyle') return state;
  const index = active.exercises.findIndex(e => e.id === id);
  if (index < 0 || active.exercises[index].sets.some(s => s.completed)) return state;
  const exercises = active.exercises.filter(e => e.id !== id);
  return { ...state, activeWorkout: { ...active, exercises, exerciseIndex: Math.max(0, Math.min(exercises.length - 1, active.exerciseIndex - (index < active.exerciseIndex ? 1 : 0))) } };
}

// Only ordinary working sets can be copied into an ordinary blank set. Advanced
// or per-side history remains inspectable, never flattened into false values.
export function freestylePreviousSets(state, exercise) {
  const prior = previousExercise(state.workouts, exercise.exerciseId);
  if (!prior || (prior.loggingMode || 'normal') !== (exercise.loggingMode || 'normal')) return [];
  return prior.sets.filter(s => s.completed && !s.setType && !s.segments?.length);
}

export function copyFreestylePrevious(state, exerciseId, setId, ordinal) {
  const active = state.activeWorkout;
  if (active?.source !== 'freestyle') return state;
  const exercise = active.exercises.find(e => e.id === exerciseId);
  const set = exercise?.sets.find(s => s.id === setId);
  const prior = exercise && freestylePreviousSets(state, exercise)[ordinal];
  if (!set || set.completed || set.setType || set.segments?.length || !prior) return state;
  const next = structuredClone(state);
  const target = next.activeWorkout.exercises.find(e => e.id === exerciseId).sets.find(s => s.id === setId);
  Object.assign(target, { weight: prior.weight ?? null, reps: prior.reps, rir: null, touched: true, weightEntryMode: 'manual', repsEntryMode: 'manual', weightProvenance: 'history' });
  if (prior.sides) target.sides = structuredClone(prior.sides);
  delete target.weightSourceSetId;
  delete target.repsSourceSetId;
  return next;
}

export function cancelUnloggedFreestyle(state) {
  return state.activeWorkout?.source === 'freestyle' && !workoutSetSummary(state.activeWorkout).completed
    ? { ...state, activeWorkout: null } : state;
}
