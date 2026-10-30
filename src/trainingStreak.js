import {workoutPerformedDate} from './workoutDates.js';
import {isConditioning} from './optionalActivity.js';

const DAY_MS=86400000;
function dayNumber(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?Math.floor(time/DAY_MS):null;
}
const localDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const monday=day=>day-((new Date(day*DAY_MS).getUTCDay()+6)%7);
const dayKey=day=>new Date(day*DAY_MS).toISOString().slice(0,10);
function completedInTime(record,now) {
  if(!record?.completedAt||!['number','string'].includes(typeof record.completedAt)||['active','paused','cancelled','discarded'].includes(record.status))return false;
  const time=new Date(record.completedAt).getTime();
  return Number.isFinite(time)&&time<=now.getTime();
}
export function qualifiesForTrainingStreak(workout,now=new Date()) {
  return completedInTime(workout,now)&&Array.isArray(workout.exercises)&&workout.exercises.some(exercise=>
    Array.isArray(exercise?.sets)&&exercise.sets.some(set=>set?.completed));
}
function qualifiesActivity(activity,now) {
  return activity?.status==='completed'&&(['Cardio','Mobility'].includes(activity.kind)||isConditioning(activity))&&
    completedInTime(activity,now)&&Number.isFinite(Number(activity.elapsedSeconds))&&Number(activity.elapsedSeconds)>=60;
}

// The log is the only counter. No schedule edits, login events or award ledger
// can create a training week; deleting/resuming/correcting a log recalculates it.
export function weeklyTrainingStreak(state,now=new Date()) {
  const today=dayNumber(localDay(now)),currentWeek=monday(today),weeks=new Set();
  const qualifying=new Map();
  for(const [index,workout] of (Array.isArray(state.workouts)?state.workouts:[]).entries())
    if(qualifiesForTrainingStreak(workout,now))qualifying.set(`strength:${workout.id||index}`,workout);
  for(const [index,activity] of (Array.isArray(state.optionalSessions)?state.optionalSessions:[]).entries())
    if(qualifiesActivity(activity,now))
      qualifying.set(`activity:${activity.id||index}`,activity);
  let workoutsThisWeek=0;
  for(const workout of qualifying.values()) {
    const date=dayNumber(workoutPerformedDate(workout));
    if(date===null||date>today)continue;
    const week=monday(date);weeks.add(week);
    if(week===currentWeek)workoutsThisWeek++;
  }
  let best=0,run=0,previous=null;
  for(const week of [...weeks].sort((a,b)=>a-b)) {
    run=previous!==null&&week-previous===7?run+1:1;best=Math.max(best,run);previous=week;
  }
  const earnedThisWeek=weeks.has(currentWeek);
  let current=0,tail=earnedThisWeek?currentWeek:currentWeek-7;
  while(weeks.has(tail)){current++;tail-=7;}
  return {current,best,earnedThisWeek,workoutsThisWeek,week:dayKey(currentWeek),
    recentWeeks:Array.from({length:6},(_,index)=>{const week=currentWeek-(5-index)*7;return {week:dayKey(week),trained:weeks.has(week)};})};
}

function newWeekGain(state,session,beforeState,now) {
  const after=weeklyTrainingStreak(state,now),before=weeklyTrainingStreak(beforeState,now);
  const performed=dayNumber(workoutPerformedDate(session));
  if(performed===null||dayKey(monday(performed))!==after.week||before.earnedThisWeek||!after.earnedThisWeek||after.current<=before.current)return null;
  return {previous:before.current,current:after.current,week:after.week};
}
export function completedWorkoutStreakGain(state,session,priorWorkouts,now=new Date()) {
  if(!session||session.historicalImport||!Array.isArray(priorWorkouts)||!qualifiesForTrainingStreak(session,now)||
    !state.workouts?.some(workout=>workout.id===session.id&&workout.completedAt===session.completedAt))return null;
  return newWeekGain(state,session,{...state,workouts:priorWorkouts},now);
}
export function completedActivityStreakGain(state,session,priorOptionalSessions,now=new Date()) {
  if(!session||session.historicalImport||!Array.isArray(priorOptionalSessions)||!qualifiesActivity(session,now)||
    !state.optionalSessions?.some(activity=>activity.id===session.id&&activity.completedAt===session.completedAt))return null;
  return newWeekGain(state,session,{...state,optionalSessions:priorOptionalSessions},now);
}

export const STREAK_PRESENTATION_KEY='rook-streak-presentation-v1';
// Device-local, bounded presentation receipts only. These never award a streak
// or enter workout state, cloud sync, backups, or completion-reversal guards.
export function claimStreakPresentation(profileId,kind,stamp,storage=globalThis.localStorage) {
  if(!profileId||kind!=='gain'||dayNumber(stamp)===null)return false;
  try {
    const parsed=JSON.parse(storage.getItem(STREAK_PRESENTATION_KEY)||'{}');
    const records=Array.isArray(parsed.records)?parsed.records.filter(row=>row&&typeof row.profileId==='string'):[];
    const existing=records.find(row=>row.profileId===profileId);
    if(existing?.[kind]===stamp)return false;
    const next=[...records.filter(row=>row.profileId!==profileId),{...existing,profileId,[kind]:stamp}].slice(-8);
    storage.setItem(STREAK_PRESENTATION_KEY,JSON.stringify({records:next}));return true;
  } catch {return false;}
}
