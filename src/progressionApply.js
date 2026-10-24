import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {progressionComparableSet} from './advancedLogging.js';
import {userEditedWeight} from './workoutWeightChanges.js';

const fields=['weight','touched','weightEntryMode','weightProvenance','weightSourceSetId'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function progressionApplyTargets(exercise,advice){
  if(!(advice?.weight>0)||!(advice.fromWeight>0))return [];
  return (exercise?.sets||[]).filter(set=>!set.completed&&set.planned!==false&&!set.added&&progressionComparableSet(set)&&!set.segments?.length&&
    !Object.values(set.sides||{}).some(side=>side.completed)&&!userEditedWeight(set)&&!(set.touched&&!set.weightEntryMode&&!set.weightProvenance)&&
    (set.weight==null||set.weight===''||Number(set.weight)===advice.fromWeight));
}
export function prepareProgressionApply(state,{sessionId,exerciseId,advice,units}){
  const workout=state.activeWorkout,exercise=workout?.exercises[workout.exerciseIndex];
  if(workout?.id!==sessionId||exercise?.id!==exerciseId||state.profile.units!==units)throw Error('This workout changed. Review the suggestion again.');
  const current=nextWorkoutAdvice(exercise,state.workouts,state.profile);
  if(!same(current,advice))throw Error('The suggestion changed. Review it again before applying.');
  const targets=progressionApplyTargets(exercise,current),ids=new Set(targets.map(set=>set.id));
  if(!targets.length)return {state,record:null,count:0};
  const patches=[];let previous=null;
  const sets=exercise.sets.map(set=>{
    if(!ids.has(set.id)){previous=null;return set;}
    const after={...set,weight:current.weight,touched:true,weightEntryMode:previous?'auto':'manual',weightProvenance:'progression'};
    if(previous)after.weightSourceSetId=previous.id;else delete after.weightSourceSetId;
    patches.push({setId:set.id,after:structuredClone(after),patch:fields.map(key=>({key,existed:Object.hasOwn(set,key),value:structuredClone(set[key])}))});
    previous=after;return after;
  });
  return {state:{...state,activeWorkout:{...workout,updatedAt:Date.now(),exercises:workout.exercises.map(item=>item===exercise?{...exercise,sets}:item)}},
    count:patches.length,record:{sessionId,exerciseId,units,patches}};
}
