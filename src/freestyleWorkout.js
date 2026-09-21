import { exerciseCatalog, exerciseLoadRequirement, isoDay, uid, workoutSetSummary, previousExercise, isSessionAddedExercise } from './domain.js';
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
  if (!prior || (prior.loggingMode || 'normal') !== (exercise.loggingMode || 'normal')) return [];
  return prior.sets.filter(s => s.completed && !s.setType && !s.segments?.length);
}

export function copyFreestylePrevious(state, exerciseId, setId, ordinal) {
  const active = state.activeWorkout;
  if (!active) return state;
  const exercise = active.exercises.find(e => e.id === exerciseId);
  if(active.source!=='freestyle'&&!isSessionAddedExercise(exercise))return state;
  const set = exercise?.sets.find(s => s.id === setId);
  const prior = exercise && freestylePreviousSets(state, exercise)[ordinal];
  if (!set || set.completed || set.setType || set.segments?.length || !prior) return state;
  const next = structuredClone(state);
  const target = next.activeWorkout.exercises.find(e => e.id === exerciseId).sets.find(s => s.id === setId);
  Object.assign(target, { weight: prior.weight ?? null, reps: prior.reps, rir: null, touched: true, weightEntryMode: 'manual', repsEntryMode: 'manual', weightProvenance: 'history' });
  if (prior.sides) target.sides = Object.fromEntries(Object.entries(prior.sides).map(([side, values]) => {
    const copied = structuredClone(values);
    // Historical completion is evidence, never a completion action today.
    delete copied.completed; delete copied.completedAt;
    return [side, copied];
  }));
  delete target.weightSourceSetId;
  delete target.repsSourceSetId;
  return next;
}

export function cancelUnloggedFreestyle(state) {
  return state.activeWorkout?.source === 'freestyle' && !workoutSetSummary(state.activeWorkout).completed
    ? { ...state, activeWorkout: null } : state;
}
