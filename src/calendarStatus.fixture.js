// Synthetic fixtures shared by status projection, rendering and browser QA.
import {blankState,buildProgram,deserializeState,startWorkout,completeWorkout,plannedWorkoutForDate} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {flexibleOccurrenceForDate,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';

export const calendarStatusDate='2026-09-21';
export function calendarStatusFixture(kind='planned'){
  let state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,showExerciseImages:false});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-09-14';state.program.createdAt='2026-09-14T12:00:00';
  state.selectedDate=calendarStatusDate;state.selectedDay='Mon';state.ai.planUpgradeDismissed=true;
  state=deserializeState(state);
  const finish=()=>{
    state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{completed:true,reps:8,weight:20})));
    state=completeWorkout(state);
  };
  const freestyle=()=>{state=addFreestyleExercise(startFreestyleWorkout(state),'plank');};
  if(['completed-freestyle','all-three','active-planned-completed','multiple-completed'].includes(kind)){freestyle();finish();}
  if(kind==='multiple-completed'){freestyle();finish();}
  if(['active-freestyle','all-three','active-completed'].includes(kind))freestyle();
  if(kind==='active-completed'){
    const planned=plannedWorkoutForDate(state,calendarStatusDate);
    const active=state.activeWorkout;state.activeWorkout=startWorkout({...state,activeWorkout:null},planned);finish();state.activeWorkout=active;
  }
  if(['active-planned','completed','active-planned-completed'].includes(kind)){
    state.activeWorkout=startWorkout(state,plannedWorkoutForDate(state,calendarStatusDate));
    if(kind==='completed')finish();
  }
  if(kind==='performed-elsewhere'){
    state.selectedDate='2026-09-14';state.selectedDay='Mon';
    state.activeWorkout=startWorkout(state,plannedWorkoutForDate(state,state.selectedDate));finish();
    state.selectedDate=calendarStatusDate;
  }
  if(kind==='moved'){
    const occurrence=flexibleOccurrenceForDate(state,calendarStatusDate);
    const result=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:occurrence.logicalSessionId,toDate:'2026-09-22'}));
    if(result.status!=='applied')throw Error(result.error);state=result.state;
  }
  return state;
}
