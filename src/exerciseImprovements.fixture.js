import {createReturningUserFixture} from './demoFixture.js';

// Synthetic, read-only Progress examples for tests and the isolated local preview.
export function improvementsFixture({olderOnly=false,flat=false}={}) {
  const state=createReturningUserFixture(0),exercises=state.program.days[0].exercises.slice(0,5);
  state.profile.showExerciseImages=false;
  const log=(id,date,reps)=>({id,name:'Upper A',programDayId:state.program.days[0].id,status:'completed',durationSeconds:2400,
    startedAt:new Date(`${date}T09:00:00`).getTime(),completedAt:new Date(`${date}T10:00:00`).toISOString(),
    exercises:exercises.map((exercise,index)=>({...structuredClone(exercise),repMin:6,repMax:12,sets:[{id:`${id}-${index}`,completed:true,weight:!flat&&index===4&&date>='2026-10-26'?32.5:30,reps:flat?8:typeof reps==='function'?reps(index):reps}]}))});
  state.workouts=[log('baseline','2026-10-19',8),log('older','2026-10-22',9),...olderOnly?[]:[log('monday','2026-10-26',10),log('wednesday','2026-10-28',index=>index===0?11:10)]];
  state.ai={...state.ai,planUpgradeDismissed:true};return state;
}
