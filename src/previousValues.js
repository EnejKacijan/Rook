import {copyFreestylePrevious,freestylePreviousSets,previousWorkingSetValues} from './freestyleWorkout.js';
import {exerciseLoadRequirement, previousExercise} from './domain.js';
import {preparedExercise} from './workoutSessionStart.js';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['weight','reps','rir','sides'];
const empty=value=>value==null||value==='';

function locate(state,identity) {
  const active=state.activeWorkout,exercise=active?.exercises[active.exerciseIndex];
  return active?.id===identity.sessionId && exercise?.id===identity.exerciseId &&
    (!identity.canonicalExerciseId||exercise.exerciseId===identity.canonicalExerciseId) &&
    (!Object.hasOwn(identity,'profileId')||state.profile.id===identity.profileId)?exercise:null;
}

export function previousValuesMatch(set,prior) {
  return Boolean(set&&prior&&fields.every(key=>equal(set[key]??null,prior[key]??null)));
}

// Logging writes mark touched/manual. Numeric targets and prepared history have
// no manual origin. Protect unknown legacy numbers as well as explicit edits.
function hasLoggingEdits(set,exercise) {
  if(set.completed||set.completedAt||set.touched||set.setType||set.segments?.length||
    ['weightEntryMode','repsEntryMode','rirEntryMode'].some(key=>set[key]==='manual')||
    Object.values(set.sideRepsEntryMode||{}).includes('manual'))return true;
  if(!empty(set.rir))return true;
  if(!empty(set.weight)&&set.weightEntryMode!=='auto'&&!['history','explicit-plan','next-block-review'].includes(set.weightProvenance))return true;
  if(!empty(set.reps)&&set.repsEntryMode!=='auto'&&set.reps!==exercise.repMin&&set.weightProvenance!=='history')return true;
  return Object.entries(set.sides||{}).some(([side,value])=>value.completed||value.completedAt||value.touched||
    !empty(value.reps)&&set.sideRepsEntryMode?.[side]!=='auto');
}

// One policy for visibility and durable application. Instance, canonical
// identity, session and profile guards also reject stale callbacks.
export function previousValuesEligibility(state,identity) {
  const exercise=locate(state,identity);
  if(!exercise||exercise.prescriptionSource!=='freestyle'||exercise.replacementOfExerciseId||
    exercise.sets.some(set=>hasLoggingEdits(set,exercise)))return [];
  const previous=freestylePreviousSets(state,exercise);
  // Explicit reuse fills the entire current draft. Extra sets reuse the last
  // compatible historical set; automatic scheduled/replacement prefill stays
  // ordinal-only. The resolved ordinal also owns the canonical copy below.
  let last=previous.length-1;
  while(last>=0&&!previousWorkingSetValues(exercise,previous[last]))last--;
  return exercise.sets.flatMap((set,index)=>{
    const ordinal=index<previous.length?index:last;
    const values=previousWorkingSetValues(exercise,previous[ordinal]);
    return values&&!previousValuesMatch(set,values)?[{setId:set.id,ordinal}]:[];
  });
}

export function preparePreviousValues(state,identity) {
  const targets=previousValuesEligibility(state,identity);
  if(!targets.length)return {state,record:null};
  let next=state;
  const sets=[];
  for(const target of targets){
    const before=locate(next,identity).sets.find(set=>set.id===target.setId);
    const applied=copyFreestylePrevious(next,identity.exerciseId,target.setId,target.ordinal);
    if(applied===next)continue;
    const exercise=locate(applied,identity),index=exercise.sets.findIndex(set=>set.id===target.setId);
    const after=exercise.sets[index];
    // Repeated values for an extra set are a suggestion from the preceding
    // current set, not an independent logged result for this ordinal.
    if(target.ordinal!==index&&(exercise.sets[index-1].weight??null)===(after.weight??null)){
      after.weightEntryMode='auto';after.weightSourceSetId=exercise.sets[index-1].id;
    }
    const patch=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>
      Object.hasOwn(before,key)!==Object.hasOwn(after,key)||!equal(before[key],after[key])
    ).map(key=>({key,existed:Object.hasOwn(before,key),value:structuredClone(before[key])}));
    sets.push({setId:target.setId,patch,after:structuredClone(after)});
    next=applied;
  }
  return sets.length?{state:next,record:{...identity,canonicalExerciseId:locate(state,identity).exerciseId,profileId:state.profile.id,units:state.profile.units,sets}}:{state,record:null};
}

export function canUndoPreviousValues(state,record) {
  const exercise=record&&locate(state,record);
  return Boolean(exercise&&state.profile.units===record.units&&record.sets.every(saved=>{
    const set=exercise.sets.find(set=>set.id===saved.setId);
    return set&&!set.completed&&equal(set,saved.after);
  }));
}

export function undoPreviousValues(state,record) {
  if(!canUndoPreviousValues(state,record))return state;
  const active=state.activeWorkout;
  const exercises=active.exercises.map(exercise=>exercise.id!==record.exerciseId?exercise:{...exercise,sets:exercise.sets.map(set=>{
    const saved=record.sets.find(saved=>saved.setId===set.id);
    if(!saved)return set;
    const restored={...set};
    for(const {key,existed,value} of saved.patch){if(existed)restored[key]=structuredClone(value);else delete restored[key];}
    return restored;
  })});
  return {...state,activeWorkout:{...active,exercises}};
}

export function prefillReplacementValues(state,exercise) {
  const previous=freestylePreviousSets(state,exercise),load=exerciseLoadRequirement(exercise);
  return {...exercise,sets:exercise.sets.map((set,index)=>{
    const values=!set.setType&&!set.segments?.length&&previousWorkingSetValues(exercise,previous[index]);
    return {...set,...(values||{}),weight:load==='none'?null:values?.weight??null,
      weightProvenance:values?.weight!=null?'history':null};
  })};
}

// Today's preparation is a session draft. Resolve new and replaced exercises now, using
// the same ordinal history projection as a replacement in the active logger.
export function prepareTodayReplacementValues(state, exercise, item) {
  const next = {...preparedExercise(exercise), exerciseId:item.id,
    measure:item.measure || 'reps', loggingMode:item.loggingMode || 'normal',
    loadRequirement:exerciseLoadRequirement(item)};
  const timed = item.measure === 'seconds';
  const compound = item.kind === 'compound' || item.kind === 'power';
  const fallback = timed ? [item.durationRange?.[0] || 20,item.durationRange?.[1] || 40]
    : compound ? [6,10] : [10,15];
  const previous = previousExercise(state.workouts || [],item.id);
  const compatible = freestylePreviousSets(state,next).some(set => previousWorkingSetValues(next,set));
  const historicalRange = compatible && Number.isInteger(previous?.repMin) && previous.repMin > 0 &&
    Number.isInteger(previous?.repMax) && previous.repMax >= previous.repMin;
  [next.repMin,next.repMax] = historicalRange ? [previous.repMin,previous.repMax] : fallback;
  for (const key of ['failureTarget','repTarget','partialPrescription','nextBlockStartingLoad']) delete next[key];
  next.sets = next.sets.map(set => ({...set,weight:null,weightProvenance:null,reps:next.repMin,rir:null,
    sides:next.loggingMode === 'per_side' ? {left:{reps:null},right:{reps:null}} : undefined,
    ...(set.segments ? {segments:set.segments.map(segment=>({...segment,weight:null,reps:null,rir:null}))} : {})}));
  return prefillReplacementValues(state,next);
}
