import {isoDay,uid,exerciseName,weekKey} from './domain.js';
import {flexibleOccurrencesForDate,effectiveWeekSchedule,temporaryScheduleReview,flexiblePlanFingerprint} from './flexibleWeek.js';

const valid=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&isoDay(new Date(`${date}T12:00:00`))===date;
const name=item=>item?.activeWorkout?.workoutName||item?.activeWorkout?.name||item?.completedWorkout?.workoutName||item?.completedWorkout?.name||item?.workout?.workoutName||item?.workout?.name||'';
export const coachDayLabel=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
function lookup(state,date){
  const stale=temporaryScheduleReview(state).unresolved.filter(item=>item.originalDate===date||item.scheduledDate===date);
  const items=flexibleOccurrencesForDate(state,date).filter(item=>item.scheduledDate===date&&!['skipped','reserved','combined'].includes(item.status));
  const item=items.find(item=>['active','planned','missed','optional'].includes(item.status))||items[0]||null;
  return {item,stale,ambiguous:items.length>1};
}
export function createCoachDayContext(state,date=isoDay()){
  if(!valid(date))throw Error('Choose a valid calendar date.');
  const {item,stale,ambiguous}=lookup(state,date);
  return {kind:'ask',id:uid('coach-day'),profileId:state.profile.id,planId:state.program?.id||null,date,
    occurrenceId:item?.logicalSessionId||null,originalDate:item?.originalDate||null,occurrenceStatus:item?.status||null,workoutName:stale.length?'':name(item),
    unresolved:Boolean(stale.length||ambiguous),staleOccurrences:stale.map(item=>({id:item.id,name:item.name,originalDate:item.originalDate,scheduledDate:item.scheduledDate})),
    planFingerprint:flexiblePlanFingerprint(state)};
}
export function coachDayStarter(context){return `${context.unresolved||!context.occurrenceId?'Help me review my schedule for':'I’d like help with my workout on'} ${coachDayLabel(context.date)}: `;}
export function resolveCoachDayContext(state,context){
  if(!context||!valid(context.date)||context.profileId!==state.profile.id)throw Error('This workout context belongs to another profile. Remove it and choose the day again.');
  const {item,stale,ambiguous}=lookup(state,context.date);
  const changed=(state.program?.id||null)!==context.planId||context.planFingerprint!==flexiblePlanFingerprint(state)||(item?.logicalSessionId||null)!==context.occurrenceId||(item?.status||null)!==context.occurrenceStatus;
  const source=item?.activeWorkout||item?.completedWorkout||item?.workout;
  return {date:context.date,originalDate:context.originalDate,occurrenceId:context.occurrenceId,
    changed,unresolved:Boolean(changed||stale.length||ambiguous),status:changed?'changed':stale.length?'needs-review':item?.status||'rest',
    staleOccurrences:stale.map(item=>({id:item.id,name:item.name,originalDate:item.originalDate,scheduledDate:item.scheduledDate})),
    workout:!changed&&!stale.length&&!ambiguous&&item?{id:item.workoutId,name:name(item),exercises:source.exercises.map(e=>({entryId:e.id,exerciseId:e.exerciseId,name:exerciseName(e),sets:e.sets,repMin:e.repMin,repMax:e.repMax}))}:null,
    schedule:effectiveWeekSchedule(state,context.date).map(item=>({id:item.logicalSessionId,date:item.scheduledDate,originalDate:item.originalDate,name:name(item)}))};
}
export function coachActionMatchesDay(action,selectedDay){
  if(!action||!selectedDay)return true;
  if(selectedDay.unresolved)return false;
  if(action.type==='combine-workouts')return action.proposal?.date===isoDay()&&action.proposal.sourceSessions?.some(source=>source.logicalSessionId===selectedDay.occurrenceId);
  if(action.type==='adapt-today')return action.targetDate===selectedDay.date&&action.programDayId===selectedDay.workout?.id;
  if(action.type==='add-today-workout')return selectedDay.date===isoDay()&&!selectedDay.workout&&action.targetDate===selectedDay.date;
  if(action.type==='week-schedule-change')return weekKey(selectedDay.date)===weekKey()&&Boolean(selectedDay.workout)&&action.changes.some(change=>change.programDayId===selectedDay.workout.id||change.workoutId===selectedDay.workout.id);
  return false;
}
