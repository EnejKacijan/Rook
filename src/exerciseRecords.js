import {displayWeight, weightUnit} from './domain.js';
import {activeExercisePrDetails} from './performanceInsights.js';

const gain = (kg, units, decimals = 2) => {
  const amount = Number(displayWeight(kg, units)), rounded = Number(amount.toFixed(decimals));
  return `${rounded > 0 ? rounded : `<${decimals === 1 ? '0.1' : '0.01'}`} ${weightUnit(units)}`;
};
const estimate = (kg, units) => Number(Number(displayWeight(kg, units)).toFixed(1));
export const recordSignature = record => JSON.stringify([record.setId,record.weight,record.reps,record.weightPr,record.repPr,record.e1rmPr]);

// The evidence/calculations stay in performanceInsights. Presentation favors
// what the person actually lifted over a simultaneous formula-derived best.
export function exerciseRecordPresentation(details, units = 'kg') {
  if (!details?.record) return null;
  const {record, previous} = details, unit = weightUnit(units);
  const setLabel = `${displayWeight(record.weight,units)} ${unit} × ${record.reps} reps`;
  const common = {record,signature:recordSignature(record),setLabel};
  if (record.weightPr) return {...common,kind:'weight',label:'Weight best',gain:`+${gain(record.weight-previous.weight,units)}`,
    value:setLabel,valueLabel:'Your logged set',previousLabel:'Previous weight best',previousValue:`${displayWeight(previous.weight,units)} ${unit}`};
  if (record.repPr) {
    const delta = record.reps-previous.repsAtWeight;
    return {...common,kind:'reps',label:'Rep best',gain:`+${delta} ${delta===1?'rep':'reps'}`,
      value:setLabel,valueLabel:'Your logged set',previousLabel:`Previous best at ${displayWeight(record.weight,units)} ${unit}`,previousValue:`${previous.repsAtWeight} reps`};
  }
  if (record.e1rmPr) return {...common,kind:'estimate',label:'Strength estimate',gain:`↑ ${gain(record.estimatedOneRepMax-previous.estimatedOneRepMax,units,1)}`,
    value:`${estimate(record.estimatedOneRepMax,units)} ${unit}`,valueLabel:'Estimated 1-rep max',previousLabel:'Previous estimate',previousValue:`${estimate(previous.estimatedOneRepMax,units)} ${unit}`};
  return null;
}

// A small per-profile/session UI receipt, not a training metric or reward bank.
// It survives navigation/reload, so unchecking or correcting a set cannot farm
// animations. If session storage is unavailable, the ordinary static best stays.
export function createExerciseRecordFeedback(state, {storage, eligible = () => true} = {}) {
  if (storage === undefined) {try {storage = globalThis.sessionStorage;} catch {storage = null;}}
  const profileId = state.profile.id, workoutId = state.activeWorkout?.id;
  const key = `rook-record-feedback-v1:${profileId}`;
  let available = Boolean(storage), saved;
  try {const raw=storage?.getItem(key);if(raw){saved=JSON.parse(raw);if(!Array.isArray(saved.seen)||!Array.isArray(saved.celebrated))throw Error('Invalid UI receipt');}}
  catch {available=false;}
  const same = Boolean(saved && workoutId && saved.workoutId===workoutId);
  const seen = new Set(same?saved.seen:[]), celebrated = new Set(same?saved.celebrated:[]);
  for (const exercise of state.activeWorkout?.exercises || []) {
    for (const set of exercise.sets || []) if (set.completed || set.completedAt) seen.add(set.id);
    if (activeExercisePrDetails(state.workouts,exercise,{e1rmEligible:eligible(exercise)})) celebrated.add(exercise.id);
  }
  return {
    claim(before, after, exerciseId, setId) {
      if (before.profile.id!==profileId || after.profile.id!==profileId || before.activeWorkout?.id!==workoutId || after.activeWorkout?.id!==workoutId) return null;
      const oldExercise=before.activeWorkout.exercises.find(e=>e.id===exerciseId), exercise=after.activeWorkout.exercises.find(e=>e.id===exerciseId);
      const oldSet=oldExercise?.sets.find(s=>s.id===setId), set=exercise?.sets.find(s=>s.id===setId);
      if(!oldSet||!set||oldExercise.exerciseId!==exercise.exerciseId)return null;
      if(Boolean(oldSet.completed)===Boolean(set.completed))return null;
      const fresh = !oldSet.completed && set.completed && !seen.has(setId);
      seen.add(setId);
      const details = fresh&&!celebrated.has(exerciseId)?activeExercisePrDetails(after.workouts,exercise,{e1rmEligible:eligible(exercise)}):null;
      const presentation = details?.record.setId===setId?exerciseRecordPresentation(details,after.profile.units):null;
      if(presentation)celebrated.add(exerciseId);
      try {if(available)storage.setItem(key,JSON.stringify({workoutId,seen:[...seen].slice(-500),celebrated:[...celebrated].slice(-100)}));}
      catch {available=false;}
      return available?presentation:null;
    },
  };
}
