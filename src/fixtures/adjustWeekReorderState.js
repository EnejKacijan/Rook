import {blankState,buildProgram,deserializeState} from '../domain.js';

export function adjustWeekReorderState() {
  const state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,showExerciseImages:false});
  state.program=buildProgram(state.profile);
  state.program.days.forEach((day,index)=>Object.assign(day,{name:['Upper A','Lower A','Upper B'][index],weekday:['Mon','Wed','Fri'][index]}));
  state.program.trainingBlock.startDate='2026-10-05';
  state.program.createdAt='2026-10-05T10:00:00.000Z';
  state.selectedDate='2026-10-05';state.selectedDay='Mon';
  Object.assign(state.profile,{daysPerWeek:3,availableDays:['Mon','Wed','Sun']});
  return deserializeState(state);
}
