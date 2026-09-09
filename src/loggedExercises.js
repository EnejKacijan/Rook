import {workoutPlanDate} from './domain.js';
// Read-only index. Recorded date takes precedence over array/import order.
export function loggedExercises(workouts = []) {
  const records=workouts.filter(w=>w.completedAt).map(workout=>{
    const date=workoutPlanDate(workout);
    const raw=workout.completedAt||workout.endedAt||workout.startedAt;
    const time=raw===true?NaN:new Date(raw).getTime();
    return {workout,date,time:Number.isFinite(time)?time:0};
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||b.time-a.time||String(a.workout.id||'').localeCompare(String(b.workout.id||'')));
  const seen=new Set(),rows=[];
  for(const {workout,date} of records)for(const exercise of workout.exercises||[]){
    if(!exercise.exerciseId||seen.has(exercise.exerciseId)||!(exercise.sets||[]).some(s=>s.completed))continue;
    seen.add(exercise.exerciseId);rows.push({exercise,date,workoutId:workout.id});
  }
  return rows;
}
export function highestSimpleLoggedLoad(exercise) {
  // Complex protocols stay in the full set breakdown; don't imply comparable loads.
  if(exercise.loggingMode==='per_side'||exercise.importedExercise?.loggingMode==='per_side')return null;
  const completed=(exercise.sets||[]).filter(s=>s.completed);
  if(completed.some(s=>s.setType&&s.setType!=='standard'))return null;
  const loads=completed.filter(s=>s.weight!==null&&s.weight!==undefined&&s.weight!==''&&Number.isFinite(Number(s.weight))&&Number(s.weight)>=0).map(s=>Number(s.weight));
  return loads.length?Math.max(...loads):null;
}
