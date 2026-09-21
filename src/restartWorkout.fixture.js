// Synthetic reproduction of the owner's repeated leg workout; no personal data.
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,isoDay} from './domain.js';
import {proposeWorkoutToday,applyWorkoutToday,repeatTemplate} from './useWorkoutToday.js';

export function repeatedRestartFixture({legacySnapshot=false}={}) {
  let state=createReturningUserFixture(0);
  const past=Date.now()-7*86400000;
  const entries=[['leg-press',3,11],['hack-squat',3,7],['single-leg-leg-extension',2,13],['step-down',2,9],['standing-leg-curl',2,8],['leg-press-calf-raise',2,16]];
  state.workouts=[{id:'restart-source',name:'NOGE A (MOČ)',workoutName:'NOGE A (MOČ)',startedAt:past,completedAt:new Date(past+3600000).toISOString(),workoutDateKey:isoDay(past),
    exercises:entries.map(([exerciseId,count,reps],i)=>({id:`historical-${i}`,exerciseId,repMin:reps,repMax:reps,targetRir:2,restSeconds:90,defaultIncrement:5,
      startedAt:past+i*60000,completedAt:past+(i+1)*60000,
      sets:Array.from({length:count},(_,n)=>({id:`historical-${i}-${n}`,weight:i===0?(n===2?100:165):90,reps,rir:1,completed:true,completedAt:past+(i+1)*60000,touched:true}))}))}];
  state=applyWorkoutToday(state,proposeWorkoutToday(state,{workoutId:'restart-source'}),{persist:()=>true});
  state.activeWorkout=startWorkout(state,repeatTemplate(state,isoDay()));
  if(legacySnapshot){
    // An already persisted pre-fix baseline copied these historical timestamps.
    for(const list of [state.activeWorkout.exercises,state.activeWorkout.restartSnapshot.exercises])
      for(const index of [1,2])list[index].startedAt=past+index*60000;
  }
  return state;
}
