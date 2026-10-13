import {copyFreestylePrevious,previousWorkingSetValues} from './freestyleWorkout.js';
import {loggingModeOf} from './advancedLogging.js';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const locate=(state,record)=>{
  const active=state.activeWorkout;
  if(!active||active.id!==record.sessionId)return null;
  const exercise=active.exercises[active.exerciseIndex];
  if(exercise?.id!==record.exerciseId)return null;
  if(record.profileId != null && state.profile.id !== record.profileId ||
     record.catalogExerciseId != null && exercise.exerciseId !== record.catalogExerciseId ||
     record.loggingMode != null && loggingModeOf(exercise) !== record.loggingMode)return null;
  return exercise.sets.find(s=>s.id===record.setId);
};
const sideValues=sides=>sides&&Object.fromEntries(Object.entries(sides).map(([side,values])=>{
  const {completed,completedAt,...rest}=values;return [side,rest];
}));

// Value equality intentionally ignores the copy's bookkeeping. Matching values
// must not fabricate an "applied" action merely to update provenance/touched.
export function previousValuesMatch(set,prior,exercise) {
  if (exercise) {
    const values = previousWorkingSetValues(exercise,prior);
    return Boolean(set && Object.keys(values).length && (set.rir??null)===null &&
      Object.entries(values).every(([key,value])=>key==='sides'
        ? Object.entries(value).every(([side,fields])=>Object.entries(fields).every(([field,number])=>(set.sides?.[side]?.[field]??null)===number))
        : (set[key]??null)===value));
  }
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
