import {exerciseCatalog,exerciseMeasure} from './domain.js';
import {loggingModeOf,normalizeSetLogging} from './advancedLogging.js';
import {hasMeaningfulExerciseProgress} from './upNextRemoval.js';

export function supportsPerSideLogging(exercise) {
  return Boolean(exercise && exerciseMeasure(exercise)!=='seconds' &&
    (loggingModeOf(exercise)==='per_side' || exercise.unilateral ||
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
    const updated={...entry,loggingMode:mode,sets:entry.sets.map(set=>normalizeSetLogging({...set}, {loggingMode:mode}))};
    return updated;
  }),updatedAt:Date.now()}};
  return {state:next,error:null};
}
