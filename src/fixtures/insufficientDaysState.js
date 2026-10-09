import { deserializeState } from '../domain.js';
import { combineExample } from '../combineWorkouts.fixture.js';

// Synthetic prescriptions only; shared by the regression and local visual QA.
export function insufficientDaysState({single=false,incompatible=false,extra=false}={}) {
  let state=combineExample();
  if(single)state.program.days=[{...state.program.days[1],name:'Lower B',weekday:'Sat'}];
  if(incompatible)state.program.days[1].warmupPlan={mode:'custom',items:[]};
  if(extra){const third={...structuredClone(state.program.days[0]),id:'third-source',name:'Upper B',weekday:'Thu'};
    third.exercises.forEach(e=>{e.id='third-'+e.id;e.sets.forEach(s=>s.id='third-'+s.id);});state.program.days.push(third);}
  state.program.trainingBlock=null;
  state.program.createdAt='2026-09-28T10:00:00.000Z';
  state.profile.availableDays=['Sun'];
  state=deserializeState(state);
  state.program.trainingBlock.startDate='2026-09-28';
  state.selectedDate='2026-10-04';state.selectedDay='Sun';
  return state;
}
