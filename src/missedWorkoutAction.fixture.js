// Synthetic reproduction/review data only; never used by production startup.
import {blankState,buildProgram,startWorkout,completeWorkout,deserializeState} from './domain.js';

export function missedWorkoutActionFixture({outsidePlan=false,loggedToday=true}={}) {
  let state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:['Fri','Sun'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.profile.id='synthetic-missed-workout-action-review';
  state.program=buildProgram(state.profile);
  state.program.days=state.program.days.map((day,index)=>({...day,id:index?'upper-a':'noge-b',weekday:index?'Sun':'Fri',name:index?'UPPER A':'NOGE B'}));
  state.program.createdAt='2026-10-04T12:00:00';
  state.program.trainingBlock.startDate=outsidePlan?'2026-10-04':'2026-09-28';
  state.selectedDate='2026-10-04';state.selectedDay='Sun';
  if(loggedToday) {
    state.activeWorkout=startWorkout(state,state.program.days[1]);
    state.activeWorkout.exercises[0].sets[0]={...state.activeWorkout.exercises[0].sets[0],completed:true,reps:8,weight:20};
    state=completeWorkout(state);
  }
  state.selectedDate='2026-10-02';state.selectedDay='Fri';state.ai.planUpgradeDismissed=true;
  return deserializeState(state,{strict:true});
}
