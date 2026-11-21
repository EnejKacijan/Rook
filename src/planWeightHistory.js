import {exerciseLoadRequirement,exerciseMeasure} from './domain.js';
import {loggingModeOf,setTypeOf} from './advancedLogging.js';
import {previousWorkingSetValues} from './freestyleWorkout.js';
import {workoutPerformedDate} from './workoutDates.js';
import {exerciseInPlannedSlot} from './workoutExerciseSlots.js';

const ordinary=set=>setTypeOf(set)==='standard'&&!set.segments?.length;
export const supportsPlannedLoads=exercise=>exerciseMeasure(exercise)==='reps'&&
  exerciseLoadRequirement(exercise)!=='none'&&loggingModeOf(exercise)!=='per_side'&&
  exercise.sets.length>0&&exercise.sets.every(ordinary)&&exercise.trackingSupport!=='history-only';

export function planWeightHistory(workouts,exercise,slot=null){
  const rows=[];
  const compatible=entry=>entry.exerciseId===exercise.exerciseId&&
    (entry.importRole||null)===(exercise.importRole||null)&&
    exerciseMeasure(entry)===exerciseMeasure(exercise)&&
    exerciseLoadRequirement(entry)===exerciseLoadRequirement(exercise)&&loggingModeOf(entry)===loggingModeOf(exercise);
  for(const workout of workouts||[]){
    if(!workout.completedAt)continue;
    const matches=(slot ? [exerciseInPlannedSlot(workout, slot)].filter(Boolean) : workout.exercises).filter(compatible);
    const entry=matches.find(entry=>entry.id===exercise.id)||(matches.length===1?matches[0]:null);
    if(!entry)continue;
    const sets=entry.sets.filter(ordinary);
    if(!sets.some(set=>set.completed))continue;
    rows.push({id:workout.id,date:workoutPerformedDate(workout),completedAt:workout.completedAt,entry,sets});
  }
  rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||new Date(b.completedAt)-new Date(a.completedAt));
  const latest=rows[0];
  // Only a complete, ordinal-for-ordinal set of compatible loads can replace
  // planned loads. Unknown, bodyweight and assisted loads are reference only.
  const weights=supportsPlannedLoads(exercise)&&latest?.sets.length===exercise.sets.length
    ? latest.sets.map(set=>set.completed?previousWorkingSetValues(exercise,set).weight:null)
    : [];
  return {rows:rows.slice(0,5), reusable:weights.length&&weights.every(weight=>Number.isFinite(weight)&&weight>0)?weights:null};
}
