import {isoDay,weekDate,workoutPerformedDate,currentWeekSchedule,optionalStrengthForDate} from './domain.js';
import {flexibleOccurrencesForDate} from './flexibleWeek.js';
import {isRepeatAdjustment} from './useWorkoutToday.js';
import {isCombinedAdjustment} from './combinedWorkoutLifecycle.js';

export const calendarLocalDate = value => value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0,10)}T12:00:00`);
export function calendarRange(state,today=isoDay()) {
  const recorded=(state.workouts||[]).filter(w=>w.completedAt&&workoutPerformedDate(w)).map(workoutPerformedDate).sort();
  const earliest=recorded[0]||isoDay(state.program?.createdAt||today);
  const latest=Object.values(state.flexibleWeek?.sessions||{}).reduce((last,item)=>item.scheduledDate>last?item.scheduledDate:last,today);
  return {min:isoDay(weekDate('Mon',earliest)),max:isoDay(weekDate('Sun',latest))};
}
export function shiftMonth(value,direction) {
  const date=calendarLocalDate(value),day=date.getDate();
  date.setDate(1);date.setMonth(date.getMonth()+direction);
  const last=new Date(date.getFullYear(),date.getMonth()+1,0,12).getDate();
  date.setDate(Math.min(day,last));return isoDay(date);
}
export function monthDays(value) {
  const month=calendarLocalDate(value);month.setDate(1);
  const cursor=weekDate('Mon',month),last=new Date(month.getFullYear(),month.getMonth()+1,0,12);
  const end=weekDate('Sun',last),result=[];
  while(cursor<=end){result.push(isoDay(cursor));cursor.setDate(cursor.getDate()+1);}
  return result;
}
// Same date-keyed sources and completion matching as Today’s week strip.
export function calendarDayStates(state,dates) {
  const weeks=new Map();
  return Object.fromEntries(dates.map(key=>{
    const week=isoDay(weekDate('Mon',key));
    if(!weeks.has(week))weeks.set(week,new Map(currentWeekSchedule(state,calendarLocalDate(key)).map(item=>[item.scheduledDate,item.workout])));
    const scheduled=weeks.get(week).get(key);
    const complete=(state.workouts||[]).some(w=>w.completedAt&&workoutPerformedDate(w)===key);
    const planned=Boolean(scheduled||optionalStrengthForDate(state,calendarLocalDate(key)) || state.todayAdaptation?.mode==='repeat' && state.todayAdaptation.date===key);
    const active=Boolean(state.activeWorkout&&workoutPerformedDate(state.activeWorkout)===key);
    return [key,{complete,planned,active}];
  }));
}

// Read-only calendar presentation. Keep factual activity dates separate from
// occurrence fulfilment; the legacy flags above are not completion/credit rules.
export function calendarDayPresentation(state,dates) {
  const facts=calendarDayStates(state,dates);
  return Object.fromEntries(dates.map(date=>{
    const day=facts[date],buckets=new Set(),provenance=[];
    if(day.active)buckets.add('active');
    if(day.complete)buckets.add('completed');
    for(const occurrence of flexibleOccurrencesForDate(state,date)){
      if(occurrence.completedWorkout)buckets.add('completed');
      // The occurrence can be browsed on its scheduled/source date while its
      // execution is already happening elsewhere. Calendar activity is a fact
      // of the execution date, never provenance of the source occurrence.
      else if(occurrence.activeWorkout && occurrence.actualPerformedDate===date)buckets.add('active');
      else if(occurrence.activeWorkout)provenance.push('workout already started elsewhere');
      else if(occurrence.completedWorkout && occurrence.actualPerformedDate!==date)provenance.push('workout performed elsewhere');
      else if(occurrence.scheduledDate===date && ['planned','missed','optional'].includes(occurrence.status))buckets.add('planned');
    }
    // Optional strength and repeat/combined preparations own independent IDs.
    // Starting one replaces its own ring, never a different planned occurrence.
    for(const optional of state.optionalSessions||[]){
      if(optional.kind!=='Strength'||optional.date!==date||!optional.workout?.exercises)continue;
      if(optional.id&&state.workouts?.some(w=>w.completedAt&&w.optionalSessionId===optional.id))buckets.add('completed');
      else if(optional.id&&state.activeWorkout?.optionalSessionId===optional.id)buckets.add('active');
      else if(optional.status==='planned')buckets.add('planned');
    }
    const adjustment=state.todayAdaptation;
    if(adjustment?.date===date && (isRepeatAdjustment(adjustment)||isCombinedAdjustment(adjustment))){
      if(adjustment.id&&state.workouts?.some(w=>w.completedAt&&w.adjustment?.id===adjustment.id))buckets.add('completed');
      else if(adjustment.id&&state.activeWorkout?.adjustment?.id===adjustment.id)buckets.add('active');
      else buckets.add('planned');
    }
    const statuses=['active','completed','planned'].filter(status=>buckets.has(status));
    // At most two shapes. Keep an active session and an unresolved obligation
    // visible when all three coexist; the accessible label still includes history.
    const markers=compactCalendarMarkers(statuses);
    const labels={active:'workout in progress',completed:'completed workout',planned:'planned workout'};
    return [date,{...day,statuses,markers,label:statuses.map(status=>labels[status]).join(', ')||provenance.join(', ')||'rest day'}];
  }));
}

// The status summary remains complete for accessibility and detail views. The
// small day-cell slot has room for one clear activity signal when a session is
// actually in progress.
export function compactCalendarMarkers(statuses=[]) {
  return statuses.includes('active') ? ['active'] : statuses.length>2 ? ['active','planned'] : statuses;
}
