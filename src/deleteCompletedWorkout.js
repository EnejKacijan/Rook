import {getAllWorkoutPhotos} from './workoutPhotos.js';
import {STORAGE_KEY} from './domain.js';
import {RESTORE_JOURNAL_KEY} from './restoreTransaction.js';

export function completedWorkoutDeletionGuard(state,workoutId) {
  if(state.activeWorkout || state.activeOptionalSession)return 'Finish your active workout before deleting history.';
  if(state.todayAdaptation?.mode==='repeat' && state.todayAdaptation.sourceWorkoutId===workoutId)return 'Finish or cancel the repeated workout before deleting its source.';
  return null;
}

export function prepareCompletedWorkoutDeletion(state,workoutId) {
  const workout=state.workouts.find(item=>item.id===workoutId && item.completedAt);
  if(!workout) throw new Error('This completed workout could not be found.');
  const blocked=completedWorkoutDeletionGuard(state,workoutId);
  if(blocked)throw new Error(blocked);
  const next=structuredClone(state);
  next.workouts=next.workouts.filter(item=>item.id!==workoutId);
  // Optional strength has a companion historical occurrence, not a plan day.
  if(workout.optionalSessionId) next.optionalSessions=next.optionalSessions.filter(item=>item.id!==workout.optionalSessionId);
  for(const block of next.completedTrainingBlocks||[]) if(block.id===workout.trainingBlock?.blockId){delete block.reviewSummary;block.historyCorrectedAt=new Date().toISOString();}
  return next;
}

export async function deleteCompletedWorkout(state,workoutId,{readPhotos=getAllWorkoutPhotos,commit=async (...args)=>(await import('./backup.js')).commitPreparedRestore(...args),storage=globalThis.localStorage,isCurrent=()=>true}={}) {
  let stage='recovery-check';
  try {
  if(storage.getItem(RESTORE_JOURNAL_KEY)) {
    const error=new Error('Complete recovery before deleting history.');error.code='rollback-failed';throw error;
  }
  const persisted=storage.getItem(STORAGE_KEY);
  stage='prepare';
  const next=prepareCompletedWorkoutDeletion(state,workoutId);
  const workout=state.workouts.find(item=>item.id===workoutId);
  stage='photo-read';
  const photos=await readPhotos();
  const retained=photos.filter(photo=>photo.workoutId!==workoutId && photo.id!==workout.photoId);
  stage='stale-check';
  if(!isCurrent() || storage.getItem(STORAGE_KEY)!==persisted) throw new Error('Your data changed. Reopen this workout before deleting it.');
  // Reuse the existing recoverable cross-store transaction. It snapshots both
  // stores before changes, including all other photos, and rolls back on failure.
  stage='persistence';
  await commit({state:next,photos:retained},{currentState:state,storage,reason:'history-delete:user-confirmed'});
  return next;
  } catch(error) {error.stage=stage;throw error;}
}
