import {isoDay, weekday} from './domain.js';

// Viewing a date never changes a workout's performed date or plan association.
export function calendarDateSelection(date) {
  return {date, day:weekday(`${date}T12:00:00`)};
}

export function calendarTodaySelection(now=Date.now()) {
  return calendarDateSelection(isoDay(new Date(now)));
}

export function withCalendarSelection(state, {date, day}) {
  return state.selectedDate===date && state.selectedDay===day
    ? state : {...state, selectedDate:date, selectedDay:day};
}

export function selectCalendarToday(update, now=Date.now()) {
  const selection=calendarTodaySelection(now);
  return update(state=>withCalendarSelection(state,selection), {
    navigationDate:{...selection,followToday:true},
  });
}

export function selectCalendarDate(update, date) {
  const selection=calendarDateSelection(date);
  return update(state=>withCalendarSelection(state,selection), {
    navigationDate:{...selection,followToday:false},
  });
}
