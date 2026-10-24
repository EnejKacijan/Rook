import {exerciseLoadRequirement} from './domain.js';
import {setTypeOf} from './advancedLogging.js';

const fields=['weight','weightEntryMode','weightSourceSetId','weightProvenance','touched'];
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const empty=value=>value===null||value===undefined||value==='';
const same=(left,right)=>empty(left)||empty(right)?left===right:Number(left)===Number(right);
const ordinary=set=>set&&!set.completed&&setTypeOf(set)==='standard'&&!set.segments?.length&&!Object.values(set.sides||{}).some(side=>side.completed);

// Older Use-values actions marked history as "manual". Actual load edits have
// always changed provenance to explicit (or null for an empty/BW load).
export const userEditedWeight=set=>set.weightEntryMode==='manual'&&set.weightProvenance!=='history';

function locate(state,identity){
  const active=state.activeWorkout,exercise=active?.exercises[active.exerciseIndex];
  return active?.id===identity.sessionId&&exercise?.id===identity.exerciseId?exercise:null;
}

export function prepareWorkoutWeightChange(state,{sessionId,exerciseId,setId,value,protectedSetIds=[]}){
  const identity={sessionId,exerciseId},exercise=locate(state,identity);
  const index=exercise?.sets.findIndex(set=>set.id===setId),source=exercise?.sets[index];
  if(!source||exerciseLoadRequirement(exercise)==='none')return {state,record:null,propagated:0};
  if(value!==null&&(!Number.isFinite(value)||value<0))return {state,record:null,propagated:0};
  const normalized=exerciseLoadRequirement(exercise)==='optional'&&value===0?null:value;
  const target={...source,weight:normalized,touched:true,weightEntryMode:'manual',weightProvenance:Number(normalized)>0?'explicit':null};
  delete target.weightSourceSetId;
  const sets=[...exercise.sets];sets[index]=target;
  const changed=[index];
  let propagated=0;
  // One contiguous group only. A different load or manual/completed/special
  // set is a boundary, never a bridge into another group farther down.
  if(ordinary(source)&&!same(source.weight,normalized)){
    for(let position=index+1;position<sets.length;position++){
      const set=sets[position];
      if(!ordinary(set)||userEditedWeight(set)||protectedSetIds.includes(set.id))break;
      const knownBodyweight=exerciseLoadRequirement(exercise)==='optional'&&set.weight===null&&set.weightProvenance==='history';
      if((!empty(set.weight)||knownBodyweight)&&!same(set.weight,source.weight))break;
      const previous=sets[position-1];
      sets[position]={...set,weight:normalized,weightEntryMode:'auto',weightSourceSetId:previous.id,weightProvenance:previous.weightProvenance||null};
      changed.push(position);
      if(!same(set.weight,normalized))propagated++;
    }
  }
  const patches=changed.flatMap(position=>{
    const before=exercise.sets[position],after=sets[position];
    const patch=fields.filter(key=>Object.hasOwn(before,key)!==Object.hasOwn(after,key)||!equal(before[key],after[key]))
      .map(key=>({key,existed:Object.hasOwn(before,key),value:structuredClone(before[key])}));
    return patch.length?[{setId:before.id,patch,after:structuredClone(after)}]:[];
  });
  if(!patches.length)return {state,record:null,propagated:0};
  const next={...state,activeWorkout:{...state.activeWorkout,updatedAt:Date.now(),exercises:state.activeWorkout.exercises.map(item=>item===exercise?{...exercise,sets}:item)}};
  return {state:next,record:{...identity,units:state.profile.units,patches},propagated};
}

export function canUndoWorkoutWeightChange(state,record){
  const exercise=record&&locate(state,record);
  return Boolean(exercise&&state.profile.units===record.units&&record.patches.every(change=>{
    const set=exercise.sets.find(item=>item.id===change.setId);
    return set&&!set.completed&&!Object.values(set.sides||{}).some(side=>side.completed)&&change.patch.every(({key})=>
      Object.hasOwn(set,key)===Object.hasOwn(change.after,key)&&equal(set[key],change.after[key]));
  }));
}

export function undoWorkoutWeightChange(state,record){
  if(!canUndoWorkoutWeightChange(state,record))return state;
  const exercise=locate(state,record),changes=new Map(record.patches.map(change=>[change.setId,change.patch]));
  const sets=exercise.sets.map(set=>{
    const patch=changes.get(set.id);if(!patch)return set;
    const restored={...set};
    for(const {key,existed,value} of patch){if(existed)restored[key]=structuredClone(value);else delete restored[key];}
    return restored;
  });
  return {...state,activeWorkout:{...state.activeWorkout,exercises:state.activeWorkout.exercises.map(item=>item===exercise?{...exercise,sets}:item)}};
}
