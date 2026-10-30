import { exerciseCatalog, exerciseLoadRequirement, exerciseMeasure, isoDay, uid, workoutSetSummary, previousExercise } from './domain.js';
import {loggingModeOf,setTypeOf,unilateralSetReps} from './advancedLogging.js';
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
  if(state.todayAdaptation?.mode==='repeat')throw new Error('Finish or cancel the pending repeated workout first.');
  if(combinedAdjustment(state))throw new Error('Finish or cancel the combined workout before starting another session.');
  if (state.activeWorkout || state.activeOptionalSession) throw new Error('A workout is already in progress. Resume or finish it first.');
  const safety = compileProfileTrainingSafety(state.profile, Object.values(exerciseCatalog));
  if (trainingSafetyBlocks(safety.status)) throw new Error(safety.message || 'Review your training restrictions first.');
  const date = isoDay(new Date(now));
  return { ...state, selectedDate: date, activeWorkout: {
    id: uid('active'), source: 'freestyle', name: 'Freestyle workout', workoutName: 'Freestyle workout',
    canonicalPlanDate: date, workoutDateKey: date, templateId: null, programDayId: null,
    sourcePlanSlotId: null, startedAt: now, updatedAt: now,
    lastMeaningfulWorkoutActivityAt:null,excludedIdleMs:0,
    timeZoneAtStart: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    utcOffsetMinutesAtStart: new Date(now).getTimezoneOffset(),
    exerciseIndex: 0, rest: null, handledSupersetRestRounds: [], exercises: [],
    restartSnapshot: {exercises: [], warmup: null},
    warmupPlan: { mode: 'none' },
  }};
}

// Both session origins use the same instance factory. "freestyle" describes
// this exercise's unprescribed targets, not ownership of the whole workout.
export function addWorkoutExercise(state, exerciseId, {allowDuplicate=false,requestId=null,sessionId=null}={}) {
  const active = state.activeWorkout;
  if (!active || sessionId&&active.id!==sessionId) return state;
  if(requestId&&active.queueCommandIds?.includes(requestId))return state;
  if (!allowDuplicate&&active.exercises.some(e => e.exerciseId === exerciseId)) return state;
  const item = freestyleCatalog(state).find(e => e.id === exerciseId);
  if (!item) throw new Error('This exercise is no longer available with your equipment and restrictions. Nothing was added.');
  const record = state.customExercises?.find(e => e.id === exerciseId);
  const exercise = {
    id: uid('freestyle-exercise'), exerciseId, ...(requestId?{queueAdditionId:requestId}:{}), prescriptionSource: 'freestyle', loadRequirement: exerciseLoadRequirement(item),
    ...(record ? { exerciseSource: 'custom', importedName: item.name, originalImportedName: item.name, importedExercise: customExerciseSnapshot(record), matchStatus: 'confirmed-custom', measure: item.measure } : {}),
    loggingMode: item.loggingMode || 'normal', repMin: null, repMax: null, targetRir: null,
    restSeconds: item.restSeconds || 90, defaultIncrement: item.increment || 1,
    sets: [{ id: uid('set'), weight: null, reps: null, rir: null, completed: false, planned: true, added: false,
      ...(item.loggingMode === 'per_side' ? { sides: { left: { reps: null }, right: { reps: null } } } : {}) }],
  };
  return { ...state, activeWorkout: { ...active, updatedAt: Date.now(), ...(requestId?{queueCommandIds:[...(active.queueCommandIds||[]),requestId]}:{}), exercises: [...active.exercises, exercise] } };
}

export const freestyleEntryHasWork=entry=>Boolean(entry?.startedAt||entry?.completedAt||(entry?.sets||[]).some(function worked(set){return set.completed||set.completedAt||set.touched||Object.values(set.sides||{}).some(worked)||(set.segments||[]).some(worked);}));
export function canUndoWorkoutAddition(state,record) {
  const active=state.activeWorkout;
  return Boolean(record&&active?.id===record.sessionId&&record.ids.length&&record.ids.every(id=>{
    const entry=active.exercises.find(e=>e.id===id);
    return entry&&entry.queueAdditionId===record.requestId&&!freestyleEntryHasWork(entry);
  }));
}
export function undoWorkoutAddition(state,record) {
  if(!canUndoWorkoutAddition(state,record))return state;
  const active=state.activeWorkout,currentId=active.exercises[active.exerciseIndex]?.id;
  const exercises=active.exercises.filter(e=>!record.ids.includes(e.id));
  return {...state,activeWorkout:{...active,exercises,exerciseIndex:Math.max(0,exercises.findIndex(e=>e.id===currentId)),updatedAt:Date.now()}};
}

/** Select an instance while parking unfinished current work immediately after it.
 * Superset blocks move together; rest retains its original owner and deadline. */
export function doWorkoutExerciseNow(state,{sessionId,requestId,exerciseId,instanceId}) {
  let active=state.activeWorkout;
  if(!active||active.id!==sessionId)return state;
  if(requestId&&active.queueCommandIds?.includes(requestId))return state;
  let next=state;
  if(!instanceId){
    const matches=active.exercises.filter(e=>e.exerciseId===exerciseId);
    if(matches.length>1)throw Error('Choose the workout instance you want to do now.');
    if(matches.length)instanceId=matches[0].id;
    else {next=addWorkoutExercise(state,exerciseId,{sessionId});active=next.activeWorkout;instanceId=active.exercises.at(-1).id;}
  }
  const target=active.exercises.find(e=>e.id===instanceId),current=active.exercises[active.exerciseIndex];
  if(!target)throw Error('This exercise is no longer in the workout.');
  if(target.id===current?.id)return next;
  const block=entry=>active.exercises.filter(e=>e.id===entry.id||entry.supersetId&&e.supersetId===entry.supersetId);
  const selected=block(target),selectedIds=new Set(selected.map(e=>e.id));
  // Selecting another member of the current superset must not split its block.
  if(selectedIds.has(current?.id))return {...next,activeWorkout:{...active,exerciseIndex:active.exercises.indexOf(target)}};
  const previous=current?block(current):[],previousIds=new Set(previous.map(e=>e.id));
  const unfinished=previous.some(e=>(e.sets||[]).some(s=>!s.completed));
  const remaining=active.exercises.filter(e=>!selectedIds.has(e.id)&&!(unfinished&&previousIds.has(e.id)));
  const insertion=remaining.filter(e=>active.exercises.indexOf(e)<active.exerciseIndex).length;
  const now=Date.now(),mark=e=>({...e,startedAt:e.startedAt||now});
  remaining.splice(insertion,0,...selected.map(mark),...(unfinished?previous.map(mark):[]));
  return {...next,activeWorkout:{...active,exercises:remaining,exerciseIndex:remaining.findIndex(e=>e.id===target.id),updatedAt:now,
    queueCommandIds:[...(active.queueCommandIds||[]),...(requestId?[requestId]:[])]}};
}

// Retain the origin-specific public entry points for existing Freestyle callers.
export const addFreestyleExercise=(state,...args)=>state.activeWorkout?.source==='freestyle'?addWorkoutExercise(state,...args):state;
export const canUndoFreestyleAddition=(state,record)=>state.activeWorkout?.source==='freestyle'&&canUndoWorkoutAddition(state,record);
export const undoFreestyleAddition=(state,record)=>state.activeWorkout?.source==='freestyle'?undoWorkoutAddition(state,record):state;
export const doFreestyleExerciseNow=(state,args)=>state.activeWorkout?.source==='freestyle'?doWorkoutExerciseNow(state,args):state;

export function removeFreestyleExercise(state, id) {
  const active = state.activeWorkout;
  if (active?.source !== 'freestyle') return state;
  const index = active.exercises.findIndex(e => e.id === id);
  if (index < 0 || active.exercises[index].sets.some(s => s.completed)) return state;
  const exercises = active.exercises.filter(e => e.id !== id);
  return { ...state, activeWorkout: { ...active, exercises, exerciseIndex: Math.max(0, Math.min(exercises.length - 1, active.exerciseIndex - (index < active.exerciseIndex ? 1 : 0))) } };
}

// Copy one ordinary working set, including explicit per-side values when the
// logging modes match. Advanced sets remain inspectable, never flattened.
export function freestylePreviousSets(state, exercise) {
  const prior = previousExercise(state.workouts, exercise.exerciseId);
  if (!prior || loggingModeOf(prior) !== loggingModeOf(exercise) ||
      exerciseMeasure(prior) !== exerciseMeasure(exercise) ||
      exerciseLoadRequirement(prior) !== exerciseLoadRequirement(exercise)) return [];
  return prior.sets.filter(s => s.completed && setTypeOf(s) === 'standard' && !s.segments?.length &&
    (s.rawImport?.version !== 2 || ['normal','standard'].includes(String(s.importSetType || '').toLowerCase()) && !s.distance && !s.durationSeconds));
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const previousValuesSetEligible = set => Boolean(set && !set.completed &&
  !Object.values(set.sides || {}).some(side => side.completed) &&
  setTypeOf(set) === 'standard' && !set.segments?.length);

// Reuse only factual supported fields. Missing historical loads are not a
// command to clear today's load; partial data retains its working-set ordinal.
export function previousWorkingSetValues(exercise, prior) {
  if (!prior) return {};
  const requirement = exerciseLoadRequirement(exercise);
  const usableLoad = value => requirement !== 'none' && (positive(value) || value === 0);
  const values = {};
  const uncertainImportLoad = prior.rawImport?.version === 2 &&
    !['external','added','normal'].includes(prior.rawImport.loadKind);
  if (!uncertainImportLoad && usableLoad(prior.weight)) values.weight = prior.weight;
  // Native optional-load sets explicitly store null for bodyweight, distinct
  // from an absent/unknown imported load. Preserve that established contract.
  if (requirement === 'optional' && prior.weight === null && prior.rawImport?.version !== 2) values.weight = null;
  if (positive(prior.reps)) values.reps = prior.reps;
  if (loggingModeOf(exercise) === 'per_side' && prior.sides) {
    const sides = {};
    for (const side of ['left', 'right']) {
      const source = prior.sides[side], copy = {};
      if (!source) continue;
      if (positive(source.reps)) copy.reps = source.reps;
      if (!uncertainImportLoad && usableLoad(source.weight)) copy.weight = source.weight;
      // Preserve the existing explicit side-RIR rule, never side completion/IDs.
      if (typeof source.rir === 'number' && Number.isFinite(source.rir) && source.rir >= 0 && source.rir <= 5) copy.rir = source.rir;
      if (Object.keys(copy).some(key => key !== 'rir')) sides[side] = copy;
    }
    if (Object.keys(sides).length) {
      values.sides = sides;
      // The representative count is derived from today's merged sides. A
      // partial historical side cannot replace the untouched opposite side.
      delete values.reps;
    }
  }
  if (requirement === 'none' && (values.reps != null || values.sides)) values.weight = null;
  return values;
}

export function withPreviousWorkingSetValues(set, values) {
  const target = { ...set, ...values, rir: null, touched: true };
  if (values.sides) {
    target.sides = Object.fromEntries(['left','right'].map(side =>
      [side, { ...set.sides?.[side], ...values.sides[side] }]));
    target.reps = unilateralSetReps(target);
    for (const [side, fields] of Object.entries(values.sides))
      if (Object.hasOwn(fields, 'reps'))
        target.sideRepsEntryMode = { ...target.sideRepsEntryMode, [side]: 'manual' };
  }
  if (Object.hasOwn(values, 'weight')) {
    Object.assign(target, {weightEntryMode:'history', weightProvenance:'history'});
    delete target.weightSourceSetId;
  }
  if (Object.hasOwn(values, 'reps')) {
    target.repsEntryMode = 'manual';
    delete target.repsSourceSetId;
  }
  return target;
}

export function copyFreestylePrevious(state, exerciseId, setId, ordinal) {
  const active = state.activeWorkout;
  if (!active) return state;
  const exercise = active.exercises.find(e => e.id === exerciseId);
  const set = exercise?.sets.find(s => s.id === setId);
  const prior = exercise && freestylePreviousSets(state, exercise)[ordinal];
  const values = previousWorkingSetValues(exercise, prior);
  if (!previousValuesSetEligible(set) || !Object.keys(values).length) return state;
  const next = structuredClone(state);
  const target = next.activeWorkout.exercises.find(e => e.id === exerciseId);
  target.sets = target.sets.map(item => item.id === setId ? withPreviousWorkingSetValues(item, values) : item);
  return next;
}

export function cancelUnloggedFreestyle(state) {
  return state.activeWorkout?.source === 'freestyle' && !workoutSetSummary(state.activeWorkout).completed
    ? { ...state, activeWorkout: null } : state;
}
