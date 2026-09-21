import {copyFreestylePrevious} from './freestyleWorkout.js';
import {isSessionAddedExercise} from './domain.js';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const locate=(state,record)=>{
  const active=state.activeWorkout;
  if(!active||active.id!==record.sessionId)return null;
  const exercise=active.exercises[active.exerciseIndex];
  if(active.source!=='freestyle'&&!isSessionAddedExercise(exercise))return null;
  if(exercise?.id!==record.exerciseId)return null;
  return exercise.sets.find(s=>s.id===record.setId);
};
const sideValues=sides=>sides&&Object.fromEntries(Object.entries(sides).map(([side,values])=>{
  const {completed,completedAt,...rest}=values;return [side,rest];
}));

// Value equality intentionally ignores the copy's bookkeeping. Matching values
// must not fabricate an "applied" action merely to update provenance/touched.
export function previousValuesMatch(set,prior) {
  return Boolean(set&&prior&&(set.weight??null)===(prior.weight??null)&&
    (set.reps??null)===(prior.reps??null)&&(set.rir??null)===null&&
    (!prior.sides||equal(sideValues(set.sides),sideValues(prior.sides))));
}

export function preparePreviousValues(state,identity) {
  const before=locate(state,identity);
  if(!before)return {state,record:null};
  const next=copyFreestylePrevious(state,identity.exerciseId,identity.setId,identity.ordinal);
  if(next===state)return {state,record:null};
  const after=locate(next,identity);
  if(['weight','reps','rir','sides'].every(key=>equal(before[key]??null,after[key]??null)))return {state,record:null};
  const patch=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>
    Object.hasOwn(before,key)!==Object.hasOwn(after,key)||!equal(before[key],after[key])
  ).map(key=>({key,existed:Object.hasOwn(before,key),value:structuredClone(before[key])}));
  return {state:next,record:{...identity,units:state.profile.units,patch,after:structuredClone(after)}};
}

export function canUndoPreviousValues(state,record) {
  const set=record&&locate(state,record);
  return Boolean(set&&!set.completed&&state.profile.units===record.units&&equal(set,record.after));
}

export function undoPreviousValues(state,record) {
  if(!canUndoPreviousValues(state,record))return state;
  const active=state.activeWorkout;
  const exercises=active.exercises.map(exercise=>exercise.id!==record.exerciseId?exercise:{...exercise,sets:exercise.sets.map(set=>{
    if(set.id!==record.setId)return set;
    const restored={...set};
    for(const {key,existed,value} of record.patch){if(existed)restored[key]=structuredClone(value);else delete restored[key];}
    return restored;
  })});
  return {...state,activeWorkout:{...active,exercises}};
}
