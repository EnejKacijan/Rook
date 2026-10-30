// Synthetic Coach evaluation data; never read from or inserted into real profiles.
import {combineExample} from './combineWorkouts.fixture.js';
import {deserializeState,isoDay,weekKey,weekday,estimateWorkoutMinutes} from './domain.js';
export function coachQualityFixture({todayThird=false}={}){
  const state=combineExample();state.profile.id='synthetic-coach-quality';state.profile.name='Demo';
  state.program.trainingBlock.startDate=weekKey();state.program.trainingBlock.currentWeek=1;state.program.rotationStartDate=weekKey();state.selectedDate=isoDay();state.selectedDay=weekday();
  if(todayThird){
    const day={...structuredClone(state.program.days[1]),id:'lower-source',weekday:weekday(),name:'Lower',workoutName:'Lower',nameEdited:true};
    day.exercises=day.exercises.slice(0,3).map((exercise,index)=>({...exercise,id:`lower-${index}`,exerciseId:['leg-press','seated-leg-curl','standing-calf-raise-machine'][index],sets:exercise.sets.slice(0,2).map((set,i)=>({...set,id:`lower-${index}-${i}`}))}));
    day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile);state.program.days.push(day);state.profile.daysPerWeek=3;state.profile.availableDays=state.program.days.map(day=>day.weekday);
  }
  const loaded=deserializeState(state,{strict:true});loaded.activeCoachConversationId='quality-current';loaded.conversations=[];
  loaded.coachConversationMeta={'quality-current':{id:'quality-current',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:isoDay()}};
  return loaded;
}
