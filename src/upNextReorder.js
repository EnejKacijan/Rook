import {refreshWorkoutWarmup} from './domain.js';
import {canRemoveUpNext} from './upNextRemoval.js';

// Started work and supersets are barriers, not merely disabled drag sources.
export function upNextReorderGroups(workout) {
  const groups=[];let group=null;
  for(const entry of workout?.exercises?.slice(workout.exerciseIndex+1)||[]) {
    if(!canRemoveUpNext(workout,entry.id)){group=null;continue;}
    if(!group){group={id:entry.id,ids:[]};groups.push(group);}
    group.ids.push(entry.id);
  }
  return groups.filter(group=>group.ids.length>1);
}
export function reorderUpNext(state,{sessionId,currentId,exerciseId,expectedIds,beforeId=null}) {
  const active=state.activeWorkout;
  if(!active||active.id!==sessionId||active.exercises[active.exerciseIndex]?.id!==currentId)return state;
  const group=upNextReorderGroups(active).find(item=>item.ids.includes(exerciseId));
  if(!group||!Array.isArray(expectedIds)||group.ids.length!==expectedIds.length||group.ids.some((id,i)=>id!==expectedIds[i]))return state;
  const ids=group.ids.filter(id=>id!==exerciseId);
  const target=beforeId===null?ids.length:ids.indexOf(beforeId);
  if(target<0)return state;
  ids.splice(target,0,exerciseId);
  if(ids.every((id,i)=>id===group.ids[i]))return state;
  const byId=new Map(active.exercises.map(entry=>[entry.id,entry]));
  let index=0;const eligible=new Set(group.ids);
  const workout={...active,exercises:active.exercises.map(entry=>eligible.has(entry.id)?byId.get(ids[index++]):entry),updatedAt:Date.now()};
  refreshWorkoutWarmup(workout,state.profile,state.program);
  return {...state,activeWorkout:workout};
}
export function upNextMoveRequest(workout,exerciseId,direction) {
  const group=upNextReorderGroups(workout).find(item=>item.ids.includes(exerciseId));
  if(!group)return null;
  const index=group.ids.indexOf(exerciseId),target=index+direction;
  if(target<0||target>=group.ids.length)return null;
  const remaining=group.ids.filter(id=>id!==exerciseId);
  return {sessionId:workout.id,currentId:workout.exercises[workout.exerciseIndex].id,exerciseId,expectedIds:group.ids,beforeId:remaining[target]??null};
}
