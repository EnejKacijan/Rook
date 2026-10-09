import {exerciseCatalog,exerciseMeasure} from './domain.js';
import {loggingModeOf,normalizeSetLogging} from './advancedLogging.js';
import {hasMeaningfulExerciseProgress} from './upNextRemoval.js';

export function supportsPerSideLogging(exercise) {
  return Boolean(exercise && exerciseMeasure(exercise)!=='seconds' &&
    (exercise.perSideLoggingAvailable === true || loggingModeOf(exercise)==='per_side' || exercise.unilateral ||
      exerciseCatalog[exercise.exerciseId]?.unilateral ||
      exercise.importedExercise?.loggingMode==='per_side'));
}

// Exercise-instance override only. A mode change never converts recorded reps.
export function changeSessionLoggingMode(state,sessionId,exerciseId,mode) {
  const active=state.activeWorkout;
  const exercise=active?.id===sessionId && active.exercises.find(entry=>entry.id===exerciseId);
  if (!exercise) return {state,error:'This exercise is no longer in the active workout.'};
  if (!['normal','per_side'].includes(mode) || mode==='per_side' && !supportsPerSideLogging(exercise))
    return {state,error:'This logging mode is not available for this exercise.'};
  if (loggingModeOf(exercise)===mode) return {state,error:null};
  if (hasMeaningfulExerciseProgress(active,exerciseId))
    return {state,error:'Logging setup cannot change after values or completed sets have been recorded.'};
  const next={...state,activeWorkout:{...active,exercises:active.exercises.map(entry=>{
    if(entry.id!==exerciseId)return entry;
    // Remember the existing capability before changing the selected mode. This
    // is session metadata, not a new unilateral classification or program edit.
    const updated={...entry,perSideLoggingAvailable:supportsPerSideLogging(entry),loggingMode:mode,sets:entry.sets.map(set=>normalizeSetLogging({...set}, {loggingMode:mode}))};
    return updated;
  }),updatedAt:Date.now()}};
  return {state:next,error:null};
}
