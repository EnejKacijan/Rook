import { refreshWorkoutWarmup } from './domain.js';

const worked = set => Boolean(set?.completed || set?.completedAt || set?.touched ||
  Object.values(set?.sides || {}).some(side=>side?.reps != null || worked(side)) ||
  (set?.segments || []).some(segment=>worked(segment) || segment?.weight != null || segment?.reps != null || segment?.rir != null));
const structure = exercises => JSON.stringify(exercises.map(e=>[e.id,e.exerciseId,e.supersetId]));

// Opening an exercise sets startedAt for navigation/timing, but it is not
// persisted workout input. Removal and reorder share this safety decision.
export function hasMeaningfulExerciseProgress(workout, id) {
  const exercise = workout?.exercises?.find(entry=>entry.id===id);
  if (!exercise) return false;
  return Boolean(exercise.completedAt || (exercise.sets || []).some(worked) ||
    (workout.warmup?.stages || []).some(stage=>stage.exerciseInstanceId===id &&
      (stage.completed || stage.skipped || [...stage.general||[],...stage.movementPreparation||[],...(stage.rampUpSets||[]).flatMap(row=>row.sets||[])].some(worked))));
}

export function canRemoveUpNext(workout, id) {
  const index=workout?.exercises?.findIndex(e=>e.id===id) ?? -1;
  const exercise=workout?.exercises?.[index];
  return index>workout?.exerciseIndex && !exercise.supersetId &&
    !hasMeaningfulExerciseProgress(workout,id);
}

// The current exercise can leave the session only when another exercise can
// become current. A target's prefilled reps/load are not logged results.
export function canRemoveCurrentExercise(workout, id) {
  const index=workout?.exerciseIndex ?? -1;
  const exercise=workout?.exercises?.[index];
  return Boolean(exercise?.id===id && workout.exercises[index+1] && !exercise.supersetId &&
    !hasMeaningfulExerciseProgress(workout,id));
}

export function removeCurrentExercise(state,id) {
  const active=state.activeWorkout;
  if(!canRemoveCurrentExercise(active,id))return {state,undo:null};
  const index=active.exerciseIndex;
  const exercise=structuredClone(active.exercises[index]);
  const exercises=active.exercises.filter(entry=>entry.id!==id);
  const next={...state,activeWorkout:{...active,exercises,updatedAt:Date.now(),
    removedUpNextExercises:[...(active.removedUpNextExercises||[]),exercise]}};
  refreshWorkoutWarmup(next.activeWorkout,state.profile,state.program);
  return {state:next,undo:{kind:'current',sessionId:active.id,currentId:exercises[index].id,
    index,exercise,remainingStructure:structure(exercises)}};
}

export function canUndoCurrentExerciseRemoval(state,record) {
  return record?.kind==='current' && canUndoUpNextRemoval(state,record);
}

export function undoCurrentExerciseRemoval(state,record) {
  if(!canUndoCurrentExerciseRemoval(state,record))return state;
  // The original current exercise resumes; the temporarily selected next
  // exercise returns to Up Next with its identity and target intact.
  return undoUpNextRemoval(state,record);
}

export function removeUpNext(state,id) {
  const active=state.activeWorkout;
  if(!canRemoveUpNext(active,id))return {state,undo:null};
  const index=active.exercises.findIndex(e=>e.id===id);
  const exercise=structuredClone(active.exercises[index]);
  const exercises=active.exercises.filter(e=>e.id!==id);
  const next={...state,activeWorkout:{...active,exercises,updatedAt:Date.now(),
    removedUpNextExercises:[...(active.removedUpNextExercises||[]),exercise]}};
  // Rebuild only warm-up references, retaining completion by stable stage/set ID.
  refreshWorkoutWarmup(next.activeWorkout,state.profile,state.program);
  return {state:next,undo:{sessionId:active.id,currentId:active.exercises[active.exerciseIndex].id,
    index,exercise,remainingStructure:structure(exercises)}};
}

export function canUndoUpNextRemoval(state,record) {
  const active=state.activeWorkout;
  return Boolean(record && active?.id===record.sessionId && active.exercises[active.exerciseIndex]?.id===record.currentId &&
    structure(active.exercises)===record.remainingStructure &&
    (active.removedUpNextExercises||[]).some(e=>e.id===record.exercise.id));
}

export function undoUpNextRemoval(state,record) {
  if(!canUndoUpNextRemoval(state,record))return state;
  const active=state.activeWorkout;
  const exercises=[...active.exercises];exercises.splice(record.index,0,structuredClone(record.exercise));
  const next={...state,activeWorkout:{...active,exercises,updatedAt:Date.now(),
    removedUpNextExercises:active.removedUpNextExercises.filter(e=>e.id!==record.exercise.id)}};
  if(!next.activeWorkout.removedUpNextExercises.length)delete next.activeWorkout.removedUpNextExercises;
  refreshWorkoutWarmup(next.activeWorkout,state.profile,state.program);
  return next;
}
