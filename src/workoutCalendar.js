import {isoDay,weekDate,workoutPerformedDate,currentWeekSchedule,optionalStrengthForDate,pluralize} from './domain.js';
import {flexibleOccurrencesForDate} from './flexibleWeek.js';
import {isRepeatAdjustment} from './useWorkoutToday.js';
import {isCombinedAdjustment} from './combinedWorkoutLifecycle.js';

export const calendarLocalDate = value => value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0,10)}T12:00:00`);
export function calendarRange(state,today=isoDay()) {
  const recorded=(state.workouts||[]).filter(w=>w.completedAt&&workoutPerformedDate(w)).map(workoutPerformedDate).sort();
  const earliest=recorded[0]||isoDay(state.program?.createdAt||today);
  const latest=Object.values(state.flexibleWeek?.sessions||{}).reduce((last,item)=>item.scheduledDate>last?item.scheduledDate:last,today);
  return {min:isoDay(weekDate('Mon',earliest)),max:state.program?isoDay(weekDate('Sun',latest)):today};
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
    const planned=Boolean(state.program && (scheduled||optionalStrengthForDate(state,calendarLocalDate(key)) || state.todayAdaptation?.mode==='repeat' && state.todayAdaptation.date===key));
    const active=Boolean(state.activeWorkout&&workoutPerformedDate(state.activeWorkout)===key);
    return [key,{complete,planned,active}];
  }));
}

// Read-only calendar presentation. Keep factual activity dates separate from
// occurrence fulfilment; the legacy flags above are not completion/credit rules.
export function calendarDayPresentation(state,dates) {
  const facts=calendarDayStates(state,dates);
  // These dates share weeks. Resolve each canonical occurrence schedule once
  // for this read, instead of prescribing the same week for every day cell.
  const occurrenceRead={weeks:new Map(),materialized:null};
  return Object.fromEntries(dates.map(date=>{
    const day=facts[date],provenance=[];
    // Count executions once from history, not again for each linked occurrence
    // (one combined workout can fulfil several source occurrences).
    const counts={active:Number(day.active),completed:(state.workouts||[]).filter(w=>w.completedAt&&workoutPerformedDate(w)===date).length,planned:0,missed:0};
    for(const occurrence of state.program ? flexibleOccurrencesForDate(state,date,occurrenceRead) : []){
      // The occurrence can be browsed on its scheduled/source date while its
      // execution is already happening elsewhere. Calendar activity is a fact
      // of the execution date, never provenance of the source occurrence.
      if(occurrence.completedWorkout){
        if(occurrence.actualPerformedDate!==date)provenance.push('workout performed elsewhere');
      }
      else if(occurrence.activeWorkout){
        if(occurrence.actualPerformedDate!==date)provenance.push('workout already started elsewhere');
      }
      else if(occurrence.scheduledDate===date && ['planned','missed','optional'].includes(occurrence.status))counts[occurrence.status==='missed'?'missed':'planned']++;
    }
    // Optional strength and repeat/combined preparations own independent IDs.
    // Starting one replaces its own ring, never a different planned occurrence.
    for(const optional of state.program ? state.optionalSessions||[] : []){
      if(optional.kind!=='Strength'||optional.date!==date||!optional.workout?.exercises)continue;
      if(optional.id&&state.workouts?.some(w=>w.completedAt&&w.optionalSessionId===optional.id)) {
        if(!state.workouts.some(w=>w.completedAt&&w.optionalSessionId===optional.id&&workoutPerformedDate(w)===date))provenance.push('workout performed elsewhere');
      }
      else if(optional.id&&state.activeWorkout?.optionalSessionId===optional.id) {
        if(workoutPerformedDate(state.activeWorkout)!==date)provenance.push('workout already started elsewhere');
      }
      else if(optional.status==='planned')counts.planned++;
    }
    const adjustment=state.todayAdaptation;
    if(state.program && adjustment?.date===date && (isRepeatAdjustment(adjustment)||isCombinedAdjustment(adjustment))){
      if(adjustment.id&&state.workouts?.some(w=>w.completedAt&&w.adjustment?.id===adjustment.id)) {
        if(!state.workouts.some(w=>w.completedAt&&w.adjustment?.id===adjustment.id&&workoutPerformedDate(w)===date))provenance.push('workout performed elsewhere');
      }
      else if(adjustment.id&&state.activeWorkout?.adjustment?.id===adjustment.id) {
        if(workoutPerformedDate(state.activeWorkout)!==date)provenance.push('workout already started elsewhere');
      }
      else counts.planned++;
    }
    const statuses=['active','completed','planned','missed'].filter(status=>counts[status]>0);
    const markers=compactCalendarMarkers(statuses);
    const labels={active:`${pluralize(counts.active,'workout')} in progress`,completed:pluralize(counts.completed,'completed workout'),planned:pluralize(counts.planned,'planned workout'),missed:pluralize(counts.missed,'missed workout')};
    return [date,{...day,counts,statuses,markers,label:[...statuses.map(status=>labels[status]),...new Set(provenance)].join(', ')||'rest day'}];
  }));
}

// One compact activity signal, shared by week and month. Full counts/statuses
// remain available above. Missed-only dates retain their existing outlined ring.
export function compactCalendarMarkers(statuses=[]) {
  const primary=['active','completed','planned'].find(status=>statuses.includes(status));
  return primary ? [primary] : statuses.includes('missed') ? ['planned'] : [];
}
