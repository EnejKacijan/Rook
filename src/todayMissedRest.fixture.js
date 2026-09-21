// Synthetic test/review data only; never imported by production startup.
import {blankState,buildProgram,deserializeState,isoDay,weekday} from './domain.js';
import {missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
export function todayMissedRestFixture({count=3,active=false}={}) {
 let state=blankState();
 Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
 state.program=buildProgram(state.profile);
 state.program.trainingBlock.startDate='2026-09-14';state.program.createdAt='2026-09-14T12:00:00';
 state.program.days.forEach(day=>{day.name='UPPER B';day.workoutName='UPPER B';});
 state.selectedDate=isoDay();state.selectedDay=weekday();state.ai.planUpgradeDismissed=true;
 state=deserializeState(state);
 for(const item of missedFlexibleSessions(state).slice(0,Math.max(0,missedFlexibleSessions(state).length-count))) {
  const result=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId}));
  if(result.status!=='applied')throw Error(result.error);state=result.state;
 }
 return active?startFreestyleWorkout(state):state;
}
