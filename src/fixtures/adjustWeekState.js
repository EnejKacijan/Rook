import { blankState, buildProgram, startWorkout, deserializeState } from '../domain.js';
import { flexiblePlanFingerprint, addCalendarDays } from '../flexibleWeek.js';

export const ADJUSTMENT_TODAY = '2026-09-29';
export function adjustWeekState({ shifted = true, history = 0 } = {}) {
  let state = blankState();
  Object.assign(state.profile, {goal:'Build muscle',experience:'Intermediate',daysPerWeek:5,
    availableDays:['Mon','Tue','Wed','Thu','Fri'],sessionMinutes:60,environment:'Commercial gym',
    equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,showExerciseImages:false});
  state.program=buildProgram(state.profile);
  state.program.createdAt='2026-09-01T10:00:00.000Z';
  state.program.trainingBlock.startDate='2026-09-28';
  state.program.days.forEach((day,i)=>day.name=['UPPER A','NOGE A','FUNKCIONALNI DAN','UPPER B','NOGE B'][i]);
  state.selectedDate=ADJUSTMENT_TODAY;state.selectedDay='Tue';
  // Match a hydrated app state before creating occurrence fingerprints. Raw
  // buildProgram output is not yet the canonical persisted/normalized shape.
  state=deserializeState(state);
  if(shifted){
    const fingerprint=flexiblePlanFingerprint(state);
    state.flexibleWeek={schemaVersion:1,revision:1,sessions:Object.fromEntries(state.program.days.map((day,i)=>{
      const originalDate=addCalendarDays('2026-09-28',i),id=`${day.id}:${originalDate}`;
      return [id,{id,workoutId:day.id,name:day.name,originalDate,scheduledDate:addCalendarDays(originalDate,1),
        skipped:false,blockId:state.program.trainingBlock.id,blockWeekNumber:1,planFingerprint:fingerprint,updatedAt:'2026-09-28T10:00:00.000Z'}];
    }))};
  }
  for(let i=1;i<=history;i++){
    const date=addCalendarDays(ADJUSTMENT_TODAY,-i),workout=startWorkout(state,state.program.days[i%5]);
    Object.assign(workout,{id:`synthetic-history-${i}`,source:'freestyle',startedAt:Date.parse(`${date}T10:00:00`),
      endedAt:Date.parse(`${date}T11:00:00`),completedAt:`${date}T11:00:00`,workoutDateKey:date,canonicalPlanDate:date});
    workout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{weight:40,reps:8,completed:true})));
    state.workouts.push(workout);
  }
  return state;
}
