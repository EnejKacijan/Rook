import {progressionFor,workoutPerformedDate,workoutSetSummary} from './domain.js';

export function completedProgressWorkouts(workouts=[]) {
  return workouts.filter(workout=>
    workout.completedAt && workoutSetSummary(workout).completed>0,
  ).sort((left,right)=>
    String(workoutPerformedDate(left)).localeCompare(String(workoutPerformedDate(right))) ||
    new Date(left.startedAt||left.completedAt)-new Date(right.startedAt||right.completedAt),
  );
}

function priority(result) {
  if(result.type==='progress')return 0;
  if(/smaller increment/i.test(result.title))return 1;
  if(result.type==='stalled')return 2;
  return 3;
}

// One read-only collection feeds the goal summary, four-row preview and full list.
// Preserve the existing latest-logged-first, then planned, exercise-ID identity.
export function selectProgressionRows(state,completedWorkouts=completedProgressWorkouts(state.workouts)) {
  const latest=[],seenLogged=new Set();
  for(const workout of [...completedWorkouts].reverse())
    for(const exercise of workout.exercises)
      if(!seenLogged.has(exercise.exerciseId)&&exercise.sets.some(set=>set.completed)){
        seenLogged.add(exercise.exerciseId);
        latest.push(exercise);
      }
  const planned=[],seenPlanned=new Set();
  for(const day of state.program?.days||[])
    for(const exercise of day.exercises||[])
      if(!seenPlanned.has(exercise.exerciseId)){
        seenPlanned.add(exercise.exerciseId);
        planned.push(exercise);
      }
  const exercises=[],seen=new Set();
  for(const exercise of [...latest,...planned])
    if(!seen.has(exercise.exerciseId)){
      seen.add(exercise.exerciseId);
      exercises.push(exercise);
    }
  return exercises.map(exercise=>({exercise,result:progressionFor(exercise,state.workouts,state.profile)}))
    .filter(item=>item.result)
    .sort((left,right)=>priority(left.result)-priority(right.result));
}

export function progressionSummary(rows=[]) {
  const repeatLoad=rows.filter(({result})=>result.title==='Repeat this load').length;
  const repeatConfirm=rows.filter(({result})=>result.title==='Repeat to confirm').length;
  const other=rows.length-repeatLoad-repeatConfirm;
  const parts=[
    repeatLoad&&`Repeat this load: ${repeatLoad}`,
    repeatConfirm&&`Repeat to confirm: ${repeatConfirm}`,
    other&&(repeatLoad||repeatConfirm)&&`Other next ${other===1?'step':'steps'}: ${other}`,
  ].filter(Boolean);
  return {
    total:rows.length,
    label:`${rows.length} ${rows.length===1?'exercise':'exercises'} with progression guidance`,
    breakdown:parts.join(' · '),
  };
}
