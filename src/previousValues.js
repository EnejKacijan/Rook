import {exerciseLoadRequirement,previousExercise} from './domain.js';
import {preparedExercise} from './workoutSessionStart.js';
import {copyFreestylePrevious,freestylePreviousSets,previousWorkingSetValues,previousValuesSetEligible,withPreviousWorkingSetValues} from './freestyleWorkout.js';
import {loggingModeOf,unilateralSetReps,setTypeOf} from './advancedLogging.js';
import {userEditedWeight} from './workoutWeightChanges.js';

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
      (!values.sides || (set.reps??null)===unilateralSetReps(set)) &&
      Object.entries(values).every(([key,value])=>key==='sides'
        ? Object.entries(value).every(([side,fields])=>Object.entries(fields).every(([field,number])=>(set.sides?.[side]?.[field]??null)===number))
        : (set[key]??null)===value));
  }
  return Boolean(set&&prior&&(set.weight??null)===(prior.weight??null)&&
    (set.reps??null)===(prior.reps??null)&&(set.rir??null)===null&&
    (!prior.sides||equal(sideValues(set.sides),sideValues(prior.sides))));
}

const setPatch=(before,after)=>[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>
  Object.hasOwn(before,key)!==Object.hasOwn(after,key)||!equal(before[key],after[key])
).map(key=>({key,existed:Object.hasOwn(before,key),value:structuredClone(before[key])}));

// Only future fields that still belong to the prescription/automatic defaults
// are eligible. A manual empty entry is still an explicit user decision.
export function previousValuesFutureChanges(state,identity,{protectedFields=[]}={}) {
  const current=locate(state,identity);
  if(!previousValuesSetEligible(current))return [];
  const exercise=state.activeWorkout.exercises[state.activeWorkout.exerciseIndex];
  const history=freestylePreviousSets(state,exercise),index=exercise.sets.findIndex(set=>set.id===identity.setId);
  const changes=[];
  let ordinal=identity.ordinal;
  for(const set of exercise.sets.slice(index+1)){
    if(setTypeOf(set)!=='standard'||set.segments?.length)continue;
    ordinal++;
    if(!previousValuesSetEligible(set))continue;
    if(protectedFields.some(item=>item.setId===set.id))continue;
    const values=previousWorkingSetValues(exercise,history[ordinal]);
    const knownEntryMode=set.weightEntryMode||set.repsEntryMode||set.sideRepsEntryMode||set.rirEntryMode;
    if(set.touched&&!knownEntryMode)continue;
    if(userEditedWeight(set))delete values.weight;
    if(set.repsEntryMode==='manual')delete values.reps;
    if(values.sides){
      values.sides=Object.fromEntries(Object.entries(values.sides).flatMap(([side,fields])=>{
        if(set.sideRepsEntryMode?.[side]==='manual')return [];
        // Future reuse never imports an effort score from a previous workout.
        const {rir,...supported}=fields;
        return Object.keys(supported).length?[[side,supported]]:[];
      }));
      if(!Object.keys(values.sides).length)delete values.sides;
    }
    if(!Object.keys(values).length)continue;
    const after=withPreviousWorkingSetValues(set,values);
    // Preserve today's effort; this action only pre-fills load and counts.
    if(Object.hasOwn(set,'rir'))after.rir=set.rir;else delete after.rir;
    if(['weight','reps','sides'].every(key=>equal(set[key]??null,after[key]??null)))continue;
    changes.push({setId:set.id,ordinal,before:set,after,patch:setPatch(set,after)});
  }
  return changes;
}

export function preparePreviousValues(state,identity,{remaining=false,protectedFields=[],expectedHistory}={}) {
  const before=locate(state,identity);
  if(!before)return {state,record:null};
  const exercise=state.activeWorkout.exercises[state.activeWorkout.exerciseIndex];
  if(expectedHistory!==undefined&&expectedHistory!==JSON.stringify(freestylePreviousSets(state,exercise)))throw Error('Previous workout data changed. Review the values and try again.');
  let next=copyFreestylePrevious(state,identity.exerciseId,identity.setId,identity.ordinal);
  if(next===state)return {state,record:null};
  let after=locate(next,identity);
  const currentChanged=!['weight','reps','rir','sides'].every(key=>equal(before[key]??null,after[key]??null));
  const future=remaining?previousValuesFutureChanges(state,identity,{protectedFields}):[];
  if(!currentChanged){next=state;after=before;}
  if(!currentChanged&&!future.length)return {state,record:null};
  if(future.length){
    const replacements=new Map(future.map(change=>[change.setId,change.after]));
    next={...next,activeWorkout:{...next.activeWorkout,exercises:next.activeWorkout.exercises.map(exercise=>exercise.id!==identity.exerciseId?exercise:{...exercise,sets:exercise.sets.map(set=>replacements.get(set.id)||set)})}};
  }
  const patch=currentChanged?setPatch(before,after):[];
  return {state:next,record:{...identity,units:state.profile.units,patch,after:structuredClone(after),...(future.length?{future:future.map(({before,...change})=>structuredClone(change))}:{})}};
}

export function canUndoPreviousValues(state,record) {
  const set=record&&locate(state,record);
  const exercise=state.activeWorkout?.exercises[state.activeWorkout.exerciseIndex];
  return Boolean(set&&!set.completed&&state.profile.units===record.units&&equal(set,record.after)&&
    (record.future||[]).every(change=>{
      const current=exercise.sets.find(item=>item.id===change.setId);
      return current&&!current.completed&&change.patch.every(({key})=>Object.hasOwn(current,key)===Object.hasOwn(change.after,key)&&equal(current[key],change.after[key]));
    }));
}

export function undoPreviousValues(state,record) {
  if(!canUndoPreviousValues(state,record))return state;
  const active=state.activeWorkout;
  const exercises=active.exercises.map(exercise=>exercise.id!==record.exerciseId?exercise:{...exercise,sets:exercise.sets.map(set=>{
    const patch=set.id===record.setId?record.patch:record.future?.find(change=>change.setId===set.id)?.patch;
    if(!patch)return set;
    const restored={...set};
    for(const {key,existed,value} of patch){if(existed)restored[key]=structuredClone(value);else delete restored[key];}
    return restored;
  })});
  return {...state,activeWorkout:{...active,exercises}};
}

export function prefillReplacementValues(state,exercise) {
  const previous=freestylePreviousSets(state,exercise),load=exerciseLoadRequirement(exercise);
  return {...exercise,sets:exercise.sets.map((set,index)=>{
    const values=previousValuesSetEligible(set)?previousWorkingSetValues(exercise,previous[index]):{};
    const next = {...set,...(values||{}),weight:load==='none'?null:values?.weight??null,
      weightProvenance:load!=='none'&&values&&Object.hasOwn(values,'weight')?'history':null};
    if (values?.sides) next.reps = unilateralSetReps(next);
    return next;
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
  const compatible = freestylePreviousSets(state,next).some(set => Object.keys(previousWorkingSetValues(next,set)).length);
  const historicalRange = compatible && Number.isInteger(previous?.repMin) && previous.repMin > 0 &&
    Number.isInteger(previous?.repMax) && previous.repMax >= previous.repMin;
  [next.repMin,next.repMax] = historicalRange ? [previous.repMin,previous.repMax] : fallback;
  for (const key of ['failureTarget','repTarget','partialPrescription','nextBlockStartingLoad']) delete next[key];
  next.sets = next.sets.map(set => ({...set,weight:null,weightProvenance:null,reps:next.repMin,rir:null,
    sides:next.loggingMode === 'per_side' ? {left:{reps:null},right:{reps:null}} : undefined,
    ...(set.segments ? {segments:set.segments.map(segment=>({...segment,weight:null,reps:null,rir:null}))} : {})}));
  return prefillReplacementValues(state,next);
}
