import {isoDay,weekDate,workoutPlanDate,currentWeekSchedule,optionalStrengthForDate} from './domain.js';

export const calendarLocalDate = value => value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0,10)}T12:00:00`);
export function calendarRange(state,today=isoDay()) {
  const recorded=(state.workouts||[]).filter(w=>w.completedAt&&workoutPlanDate(w)).map(workoutPlanDate).sort();
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
    const complete=(state.workouts||[]).some(w=>workoutPlanDate(w)===key&&(!scheduled||w.programDayId===scheduled.id||(!w.programDayId&&w.templateId===scheduled.weekday)));
    const planned=Boolean(scheduled||optionalStrengthForDate(state,calendarLocalDate(key)));
    const active=Boolean(state.activeWorkout&&workoutPlanDate(state.activeWorkout)===key);
    return [key,{complete,planned,active}];
  }));
}
