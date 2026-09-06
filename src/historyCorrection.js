import { workingSetCanComplete, exerciseMeasure, exerciseLoadRequirement, normalizeSessionNote, normalizeExercisePersonalNote, workoutSetSummary } from './domain.js';
import { SET_TYPES, setTypeOf, loggingModeOf, normalizeSetLogging } from './advancedLogging.js';
import { validSessionFeedback } from './sessionFeedback.js';

const copy=value=>structuredClone(value);
export const correctionFingerprint=workout=>JSON.stringify(workout);
function editableSnapshot(workout) {
  const snapshot=copy(workout);
  snapshot.exercises.forEach((exercise,index)=>{
    exercise.id||=`${workout.id}:history-exercise:${index}`;
    exercise.sets.forEach((set,setIndex)=>{set.id||=`${exercise.id}:history-set:${setIndex}`;});
  });
  return snapshot;
}
export function createHistoryCorrection(workout) {
  const snapshot=editableSnapshot(workout);
  return {workoutId:workout.id,fingerprint:correctionFingerprint(workout),initialFingerprint:correctionFingerprint(snapshot),workout:snapshot};
}
const numeric=(value,{integer=false,min=0,max=Infinity}={})=>value==null||value===''||
  typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
function validSet(exercise,set,preserveUnknown=false) {
  if(typeof set.completed!=='boolean')return false;
  if(set.sides!=null&&(loggingModeOf(exercise)!=='per_side'||typeof set.sides!=='object'||Array.isArray(set.sides)))return false;
  if(set.sides&&['left','right'].some(side=>set.sides[side]!=null&&(typeof set.sides[side]!=='object'||Array.isArray(set.sides[side]))))return false;
  if(!numeric(set.weight)||!numeric(set.reps,{min:1,integer:exerciseMeasure(exercise)!=='seconds'})||!numeric(set.rir,{integer:true,max:4}))return false;
  if(set.setType!=null&&!Object.hasOwn(SET_TYPES,set.setType))return false;
  if(loggingModeOf(exercise)==='per_side' && ['left','right'].some(side=>!numeric(set.sides?.[side]?.reps,{min:1,integer:true})))return false;
  if(!['drop','rest_pause'].includes(setTypeOf(set)) && set.segments?.length)return false;
  if(set.segments!=null&&!Array.isArray(set.segments))return false;
  if(new Set((set.segments||[]).map(segment=>segment?.id)).size!==(set.segments||[]).length)return false;
  if((set.segments||[]).some(segment=>!segment||typeof segment.completed!=='boolean'||!segment.id||segment.kind!==setTypeOf(set)||!numeric(segment.weight)||!numeric(segment.reps,{min:1,integer:true})||!numeric(segment.rir,{integer:true,max:4})||
    segment.completed&&!workingSetCanComplete({...exercise,loggingMode:'normal',importedExercise:{...exercise.importedExercise,loggingMode:'normal'}},{...segment,setType:'standard'})))return false;
  // Use the same completion contract as active logging (including intentionally
  // partial unilateral sets), with strict serialized numeric validation above.
  return !set.completed||workingSetCanComplete(exercise,set)||preserveUnknown&&
    (exerciseLoadRequirement(exercise)!=='required'||set.weight==null||set.weight>0);
}
const actual=set=>({weight:set.weight??null,reps:set.reps??null,rir:set.rir??null,completed:Boolean(set.completed),setType:setTypeOf(set),sides:set.sides??null,segments:set.segments??null});
export function correctionChanges(original,draft) {
  const changes=[];
  for(const exercise of draft.exercises){const old=original.exercises.find(e=>e.id===exercise.id);if(!old)continue;
    for(const [index,set] of exercise.sets.entries()){
      const before=old.sets.find(s=>s.id===set.id);
      if(!before||JSON.stringify(actual(before))!==JSON.stringify(actual(set)))changes.push({exerciseId:exercise.id,setId:set.id,setNumber:index+1,before:before?actual(before):null,after:actual(set)});
    }
    for(const set of old.sets)if(!exercise.sets.some(s=>s.id===set.id))changes.push({exerciseId:exercise.id,setId:set.id,setNumber:old.sets.indexOf(set)+1,before:actual(set),after:null});
  }return changes;
}
export function prepareHistoryCorrection(state,draft) {
  const stored=state.workouts.find(w=>w.id===draft?.workoutId);
  if(!stored||correctionFingerprint(stored)!==draft.fingerprint)return {status:'stale',error:'This workout changed. Reopen Edit to review the latest record.'};
  const original=editableSnapshot(stored);
  if(!Array.isArray(draft.workout?.exercises)||draft.workout.exercises.length!==original.exercises.length)return {status:'invalid',error:'Exercise identity cannot be changed here.'};
  const corrected=copy(original);
  if(typeof draft.workout.sessionNote!=='string'&&draft.workout.sessionNote!=null)return {status:'invalid',error:'Check the session note.'};
  corrected.sessionNote=normalizeSessionNote(draft.workout.sessionNote);
  if(!validSessionFeedback(draft.workout.sessionFeedback))return {status:'invalid',error:'Choose a valid session feedback option.'};
  if(draft.workout.sessionFeedback == null)delete corrected.sessionFeedback;else corrected.sessionFeedback=draft.workout.sessionFeedback;
  for(const [index,base] of original.exercises.entries()){
    const edit=draft.workout.exercises[index];
    if(edit?.id!==base.id||edit.exerciseId!==base.exerciseId||!Array.isArray(edit.sets)||edit.sets.length>100)return {status:'invalid',error:'Exercise identity cannot be changed here.'};
    const ids=new Set();
    for(const set of edit.sets){
      if(!set||typeof set!=='object'||Array.isArray(set))return {status:'invalid',error:'Check the set values.'};
      const old=base.sets.find(s=>s.id===set.id);
      const preserveUnknown=Boolean(original.historicalImport&&old?.completed&&set.completed&&setTypeOf(old)===setTypeOf(set)&&
        ['weight','reps'].some(key=>old[key]==null&&set[key]==null)&&['weight','reps'].every(key=>old[key]==null||set[key]!=null&&set[key]!==''));
      if(!set.id||ids.has(set.id)||!old&&(!set.added||set.planned!==false)||(!old||JSON.stringify(actual(old))!==JSON.stringify(actual(set)))&&!validSet(base,set,preserveUnknown))return {status:'invalid',error:'Check the load, repetitions, RIR and segment values. Required logged values cannot be empty.'};
      ids.add(set.id);
    }
    if(base.sets.some(set=>!set.added&&!edit.sets.some(item=>item.id===set.id)))return {status:'invalid',error:'Mark a prescribed set as unlogged instead of deleting its prescription.'};
    if(edit.personalNote!=null&&typeof edit.personalNote!=='string')return {status:'invalid',error:'Check the exercise note.'};
    const next=corrected.exercises[index];next.personalNote=normalizeExercisePersonalNote(edit.personalNote);
    next.sets=edit.sets.map(set=>{
      const old=base.sets.find(s=>s.id===set.id);
      if(old&&JSON.stringify(actual(old))===JSON.stringify(actual(set)))return copy(old);
      const nextSet={...(old||{id:set.id,planned:false,added:true}),...actual(set)};
      if(old?.durationSeconds!=null&&exerciseMeasure(base)==='seconds')nextSet.durationSeconds=nextSet.reps;
      normalizeSetLogging(nextSet,base);return nextSet;
    });
    if(JSON.stringify(base.sets)!==JSON.stringify(next.sets))next.originalPrescription=base.originalPrescription||{
      repMin:base.repMin,repMax:base.repMax,targetRir:base.targetRir,
      sets:base.sets.filter(s=>s.planned!==false&&!s.added).map(s=>({id:s.id,setType:setTypeOf(s)})),
    };
  }
  const changes=correctionChanges(original,corrected);
  return {status:'ready',original,corrected,changes};
}
export function saveHistoryCorrection(state,draft,{persist,now=Date.now()}={}) {
  const checked=prepareHistoryCorrection(state,draft);if(checked.status!=='ready')return {...checked,state};
  const next=copy(state),workout=checked.corrected;
  workout.correctedAt=new Date(now).toISOString();workout.correctionRevision=(checked.original.correctionRevision||0)+1;
  const summary=workoutSetSummary(workout);workout.completedSetCount=summary.completed;
  workout.completedPlannedSetCount=workout.exercises.reduce((n,e)=>n+e.sets.filter(s=>s.completed&&s.planned!==false&&!s.added).length,0);
  next.workouts[next.workouts.findIndex(w=>w.id===workout.id)]=workout;
  if(checked.changes.length)for(const block of next.completedTrainingBlocks||[])if(block.id===workout.trainingBlock?.blockId){delete block.reviewSummary;block.historyCorrectedAt=workout.correctedAt;}
  if(persist){let saved=false;try{saved=Boolean(persist(next));}catch{}if(!saved)return {status:'persistence-failed',state,error:'ROOK couldn’t save these corrections. Your history is unchanged. Try again.'};}
  return {status:'saved',state:next};
}
