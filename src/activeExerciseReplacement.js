import { estimateWorkoutMinutes, exerciseCatalog, exerciseName, exerciseLoadRequirement, exerciseMeasure, makeProgramExercise, refreshWorkoutWarmup, workoutDisplayParts } from './domain.js';
import { availableCustomExerciseItems, customExerciseSnapshot } from './customExercises.js';
import { effectiveGymContext } from './gymProfiles.js';
import { planEditorExerciseAllowed } from './exerciseEligibility.js';
import { hasMeaningfulExerciseProgress } from './upNextRemoval.js';
import { loggingModeOf, normalizeSetLogging } from './advancedLogging.js';
import { preparedExercise } from './workoutSessionStart.js';
import { saveWorkoutTemplate, templateUseIssues } from './savedWorkouts.js';
import { addPlanVersion } from './planHistory.js';
import { compileProfileTrainingSafety } from './trainingSafety.js';

export function activeExerciseReplacement(workout, exercise) {
  if (!exercise || !Array.isArray(workout?.exerciseReplacements)) return null;
  return workout.exerciseReplacements.find(record =>
    record?.entryId === exercise.id && record.replacementId === exercise.exerciseId &&
    record.original?.id === exercise.id && record.original.exerciseId &&
    record.original.exerciseId !== exercise.exerciseId && Array.isArray(record.original.sets)
  ) || null;
}

// Keep only the first exercise at this slot, even after another replacement.
// This snapshot belongs to the active session and is never workout history.
export function rememberActiveExerciseReplacement(state, previous, replacementId, revision) {
  const workout = state.activeWorkout;
  const existing = activeExerciseReplacement(workout, previous);
  const original = existing?.original || previous;
  const destination = workoutDestination(state, workout, original);
  const target = destination && destination.entry.exerciseId === (existing?.saved ? previous.exerciseId : existing?.target?.exerciseId || original.exerciseId)
    ? {...destination.owner, exerciseId:destination.entry.exerciseId}
    : null;
  workout.exerciseReplacements = [
    ...(Array.isArray(workout.exerciseReplacements) ? workout.exerciseReplacements : []).filter(record => record?.entryId !== previous.id),
    {entryId: previous.id, replacementId, revision, original: structuredClone(original), target},
  ];
}

function currentReplacement(state, request) {
  const workout = state.activeWorkout;
  const exercise = workout?.exercises[workout.exerciseIndex];
  const record = activeExerciseReplacement(workout, exercise);
  if (!record || state.profile.id !== request.profileId || workout.id !== request.workoutId ||
      exercise.id !== request.entryId || record.revision !== request.revision) return null;
  return {workout, exercise, record};
}

export function setActiveReplacementDetailsHidden(state, request, detailsHidden) {
  const context = currentReplacement(state, request);
  if (!context) throw new Error('This exercise has changed. Try again from the current exercise.');
  const {workout, record} = context;
  if (Boolean(record.detailsHidden) === detailsHidden) return state;
  return {...state, activeWorkout:{...workout, exerciseReplacements:workout.exerciseReplacements.map(value =>
    value === record ? {...value, detailsHidden} : value)}};
}

export function exerciseRevertIssue(state, exercise, record) {
  const workout = state.activeWorkout;
  if (hasMeaningfulExerciseProgress(workout, exercise.id) ||
      exercise.sets.some((set, index) => set.rir != null || set.id !== record.original.sets[index]?.id) ||
      exercise.sets.length !== record.original.sets.length ||
      loggingModeOf(exercise) !== loggingModeOf(record.original)) {
    return 'The original can’t be restored once you’ve entered values or logged work on this exercise.';
  }
  const original = record.original;
  if (workout.exercises.some(entry => entry.id !== exercise.id && entry.exerciseId === original.exerciseId))
    return 'The original is already in this workout.';
  const item = exerciseCatalog[original.exerciseId] ||
    (original.exerciseSource === 'custom' ? availableCustomExerciseItems(state).find(item => item.id === original.exerciseId) :
      original.importedExercise?.id === original.exerciseId ? original.importedExercise : null);
  if (!planEditorExerciseAllowed(item, effectiveGymContext(state, workout).profile))
    return 'The original isn’t available with your current equipment or restrictions.';
  return null;
}

export function revertActiveExerciseReplacement(state, request) {
  const context = currentReplacement(state, request);
  if (!context) throw new Error('This exercise has changed. Try again from the current exercise.');
  if (context.record.saved) throw new Error('Undo the saved workout change before restoring this session’s original.');
  const issue = exerciseRevertIssue(state, context.exercise, context.record);
  if (issue) throw new Error(issue);
  const workout = structuredClone(context.workout);
  const live = workout.exercises[workout.exerciseIndex];
  const restored = structuredClone(context.record.original);
  // A pairing, note or navigation timestamp can change independently of a swap.
  for (const key of ['supersetId', 'startedAt', 'personalNote', 'personalNotes']) {
    if (Object.hasOwn(live, key)) restored[key] = live[key];
    else delete restored[key];
  }
  workout.exercises[workout.exerciseIndex] = restored;
  workout.exerciseReplacements = workout.exerciseReplacements.filter(record => record?.entryId !== live.id);
  if (!workout.exerciseReplacements.length) delete workout.exerciseReplacements;
  workout.updatedAt = Date.now();
  refreshWorkoutWarmup(workout, workout.temporaryPlanAdjustment ? effectiveGymContext(state, workout).profile : state.profile, state.program);
  return {...state, activeWorkout: workout};
}

function workoutDestination(state, workout, original) {
  if (workout.savedWorkoutTemplateId) {
    // Only entries from the workout that started the session belong to its
    // template. Appending another saved workout must not edit either template.
    if (original.prescriptionSource !== 'saved-template' || !original.queueAdditionId ||
        original.queueAdditionId !== workout.queueCommandIds?.[0]) return null;
    const template = state.savedWorkoutTemplates?.find(item => item.id === workout.savedWorkoutTemplateId);
    const entry = template?.exercises.find(item => item.id === original.templatePrescription?.id);
    if (entry) return {entry, workout:template, revision:template.revision,
      owner:{kind:'template', id:template.id, entryId:entry.id}};
    return null;
  }
  if (workout.source === 'repeat' || workout.adjustment?.mode === 'repeat' ||
      workout.adjustment?.mode === 'combine' || workout.temporaryPlanAdjustment ||
      workout.optionalSessionId || workout.resumedFromCompletionId || original.prescriptionSource === 'freestyle' ||
      original.prescriptionSource === 'saved-template') return null;
  const day = state.program?.days.find(item => item.id === workout.programDayId);
  const entry = day?.exercises.find(item => item.id === original.id);
  if (!entry) return null;
  return {entry, workout:day, revision:Number(state.program.version || 1),
    owner:{kind:'plan', id:state.program.id, dayId:day.id, entryId:entry.id}};
}

function matchesDestination(destination, target) {
  return Boolean(destination && target && Object.keys(destination.owner).every(key => destination.owner[key] === target[key]));
}

function plannedWorkoutTitle(workout) {
  const {primary, detail, context} = workoutDisplayParts(workout);
  return [primary, detail, context].filter(Boolean).join(' · ');
}

// The name a person sees for a planned workout, with its weekday added when
// another planned workout shares the same title.
export function programWorkoutTitle(workout, program) {
  const title = plannedWorkoutTitle(workout);
  const titleKey = title.toLowerCase();
  const repeatedTitle = (program?.days || []).some(day =>
    day.id !== workout.id && plannedWorkoutTitle(day).toLowerCase() === titleKey);
  return repeatedTitle && workout.weekday ? `${title} (${workout.weekday})` : title;
}

function destinationWorkoutTitle(destination, program) {
  if (!destination) return undefined;
  const {workout, owner} = destination;
  if (owner.kind === 'template') return workout.name;
  return programWorkoutTitle(workout, program);
}

export function replacementSaveOptions(state, workout, record) {
  const destination = workoutDestination(state, workout, record.original);
  // Older local sessions did not store a destination. Only link them when the
  // original stable slot and exercise both still match.
  const target = record.target === undefined && destination?.entry.exerciseId === record.original.exerciseId
    ? {...destination.owner, exerciseId:record.original.exerciseId} : record.target;
  const name = destinationWorkoutTitle(destination, state.program);
  const savedTemplate = (destination?.owner.kind || record.saved?.target?.kind) === 'template';
  const labels = {saveLabel:savedTemplate?'Update saved workout':'Save to plan', savedLabel:savedTemplate?'Saved workout updated':'Saved to plan'};
  // Name the workout and the exercise its future sessions use, so the save
  // target is clear before and after the explicit save.
  const future = (verb, exercise) => {
    const workout = name || 'this workout';
    const exerciseLabel = exerciseName(exercise);
    return {future:{workout, verb, exercise:exerciseLabel}, message:`Future ${workout} sessions ${verb} ${exerciseLabel}.`};
  };
  if (record.saved) {
    const canUndo = matchesDestination(destination, record.saved.target) &&
      destination.entry.exerciseId === record.replacementId && destination.revision === record.saved.revision;
    return {saved:true, canUndo, name, ...labels, ...(canUndo ? future('will use', destination.entry)
      : {message:'The saved workout has changed since this replacement.'})};
  }
  if (!destination || !target) return {};
  if (!matchesDestination(destination, target) || destination.entry.exerciseId !== target.exerciseId)
    return {message:'The saved workout changed. Edit it directly to make this replacement permanent.'};
  if (destination.workout.exercises.some(entry => entry.id !== destination.entry.id && entry.exerciseId === record.replacementId))
    return {message:'This exercise is already in the saved workout.'};
  return {canSave:true, name, ...labels, ...future('still use', destination.entry)};
}

function replacementDefinition(entry, item, state) {
  const next = preparedExercise(entry);
  const measure = item.measure || 'reps';
  const loggingMode = item.loggingMode || (item.unilateral && loggingModeOf(entry) === 'per_side' ? 'per_side' : 'normal');
  const sameUnits = exerciseMeasure(entry) === measure && loggingModeOf(entry) === loggingMode;
  for (const key of ['importedName','originalImportedName','importedExercise','matchStatus','nextBlockStartingLoad',
    'templatePrescription','perSideLoggingAvailable','unilateral']) delete next[key];
  if (item.custom) {
    const record = state.customExercises.find(value => value.id === item.id);
    Object.assign(next, {importedName:item.name, originalImportedName:item.name,
      importedExercise:customExerciseSnapshot(record), matchStatus:'confirmed-custom'});
  }
  Object.assign(next, {exerciseId:item.id, exerciseSource:item.custom?'custom':'catalog',
    measure, loggingMode, loadRequirement:exerciseLoadRequirement(item), defaultIncrement:item.increment, restSeconds:entry.restSeconds ?? item.restSeconds});
  if (!sameUnits) {
    const defaults = makeProgramExercise(item, state.profile, {role:entry.programmingRole});
    for (const key of ['failureTarget','repTarget','partialPrescription','distanceTarget','distanceUnit']) delete next[key];
    Object.assign(next, {repMin:defaults.repMin, repMax:defaults.repMax, targetRir:defaults.targetRir});
  }
  const resetLoad = set => {
    const result = {...set, weight:null, weightProvenance:null, completed:false};
    if (set.segments) result.segments = set.segments.map(resetLoad);
    return result;
  };
  next.sets = next.sets.map(set => normalizeSetLogging(resetLoad(sameUnits ? set :
    {id:set.id, reps:next.repMin, rir:null}), next));
  return next;
}

export function saveActiveReplacementToWorkout(state, request, {undo = false} = {}) {
  const context = currentReplacement(state, request);
  if (!context) throw new Error('This exercise has changed. Try again from the current exercise.');
  const {workout, record} = context;
  if (Boolean(record.saved) !== undo) return state;
  const options = replacementSaveOptions(state, workout, record);
  if (!(undo ? options.canUndo : options.canSave)) throw new Error(options.message);
  const destination = workoutDestination(state, workout, record.original);
  const {entry, owner} = destination;
  const updatedAt = new Date().toISOString();
  const profile = effectiveGymContext(state, {}).profile;
  let definition = record.saved?.before;
  if (!undo) {
    const item = exerciseCatalog[record.replacementId] ||
      availableCustomExerciseItems(state).find(item => item.id === record.replacementId);
    const safety = compileProfileTrainingSafety(profile, Object.values(exerciseCatalog));
    if (!planEditorExerciseAllowed(item, profile, safety) || item.trackingSupport === 'history-only' || item.exerciseType === 'distance_duration')
      throw new Error('This replacement isn’t available with your usual equipment or restrictions.');
    definition = replacementDefinition(entry, item, state);
    const min = safety.constraints.minRirByExerciseId?.[item.id];
    if (Number.isFinite(min) && (Number(definition.targetRir) < min || definition.sets.some(set => set.rir != null && set.rir < min)))
      throw new Error(`This replacement requires at least ${min} RIR. Edit the saved workout to review its targets.`);
  } else if (destination.workout.exercises.some(item => item.id !== entry.id && item.exerciseId === definition.exerciseId)) {
    throw new Error('The previous exercise is already in the saved workout.');
  }
  const updatedWorkout = {...destination.workout,
    exercises:destination.workout.exercises.map(item => item.id === entry.id ? structuredClone(definition) : item)};
  let next;
  if (owner.kind === 'template') {
    if (!undo) {
      const issues = templateUseIssues({...state, activeWorkout:null}, {exercises:[definition]});
      if (issues.length) throw new Error(issues[0]);
    }
    next = saveWorkoutTemplate(state, updatedWorkout, {id:owner.id, revision:destination.revision});
  } else {
    if (undo) {
      if (record.saved.warmupPlan === undefined) delete updatedWorkout.warmupPlan;
      else updatedWorkout.warmupPlan = structuredClone(record.saved.warmupPlan);
    } else if (updatedWorkout.warmupPlan?.mode === 'custom') {
      updatedWorkout.warmupPlan = {...updatedWorkout.warmupPlan,
        rampUpSets:(updatedWorkout.warmupPlan.rampUpSets || []).filter(set => set.targetExerciseEntryId !== entry.id)};
    }
    const program = {...state.program, version:destination.revision+1, updatedAt,
      days:state.program.days.map(day => day.id === owner.dayId ? updatedWorkout : day)};
    updatedWorkout.estimatedMinutes = estimateWorkoutMinutes(updatedWorkout, profile, program);
    next = {...state, program, planVersions:[...(state.planVersions || [])]};
    addPlanVersion(next, {previousProgram:state.program, reason:undo ? 'Workout replacement undone' : 'Exercise replacement saved from workout'});
  }
  const saved = undo ? undefined : {target:owner, before:structuredClone(entry), revision:destination.revision+1,
    ...(destination.workout.warmupPlan === undefined ? {} : {warmupPlan:structuredClone(destination.workout.warmupPlan)})};
  next.activeWorkout = {...workout, exerciseReplacements:workout.exerciseReplacements.map(value =>
    value === record ? {...value, target:{...owner, exerciseId:undo ? definition.exerciseId : entry.exerciseId}, saved} : value)};
  return next;
}
