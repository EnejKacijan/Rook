// Synthetic review/test data only; never imported by production startup.
import {blankState,buildProgram,startWorkout,completeWorkout,isoDay,weekday,deserializeState} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';

export function dayOverflowFixture({count=2,date=isoDay(),kind='mixed',sameName=false,active=false}={}) {
  let state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:['Tue','Thu'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);
  state.ai.planUpgradeDismissed=true;
  state.selectedDate=date;state.selectedDay=weekday(date);
  for(let i=0;i<count;i++){
    if(kind==='planned' || kind==='mixed' && i===0)state.activeWorkout=startWorkout(state,state.program.days[i%state.program.days.length]);
    else state=addFreestyleExercise(startFreestyleWorkout(state),'push-up');
    state.activeWorkout.id=`review-completed-${i+1}`;
    state.activeWorkout.name=sameName?'UPPER A':i===0?'UPPER B':i===1?'NOGE A (MOČ)':`Freestyle ${i+1}`;
    state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{reps:8,weight:20,completed:true})));
    state=completeWorkout(state);
    const record=state.workouts.at(-1);
    // Actual performed dates remain separate from source plan dates.
    record.completedAt=new Date(`${date}T${String(10+i).padStart(2,'0')}:42:00`).toISOString();
    record.startedAt=new Date(record.completedAt).getTime()-45*60000;
    record.durationSeconds=45*60;
  }
  if(active)state=startFreestyleWorkout(state);
  state.selectedDate=date;state.selectedDay=weekday(date);
  return deserializeState(state,{strict:true});
}
