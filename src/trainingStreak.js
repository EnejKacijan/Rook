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
  const weekCounts=new Map();
  for(const workout of qualifying.values()) {
    const date=dayNumber(workoutPerformedDate(workout));
    if(date===null||date>today)continue;
    const week=monday(date);weeks.add(week);weekCounts.set(week,(weekCounts.get(week)||0)+1);
    if(week===currentWeek)workoutsThisWeek++;
  }
  let best=0,run=0,previous=null;
  const orderedWeeks=[...weeks].sort((a,b)=>a-b),firstWeek=orderedWeeks[0]??null;
  for(const week of orderedWeeks) {
    run=previous!==null&&week-previous===7?run+1:1;best=Math.max(best,run);previous=week;
  }
  const earnedThisWeek=weeks.has(currentWeek);
  let current=0,tail=earnedThisWeek?currentWeek:currentWeek-7;
  while(weeks.has(tail)){current++;tail-=7;}
  return {current,best,earnedThisWeek,workoutsThisWeek,week:dayKey(currentWeek),
    recentWeeks:Array.from({length:6},(_,index)=>{
      const week=currentWeek-(5-index)*7,trained=weeks.has(week);
      return {week:dayKey(week),trained,count:weekCounts.get(week)||0,current:week===currentWeek,
        status:trained?'counted':week===currentWeek?'open':firstWeek!==null&&week>=firstWeek?'missed':'no-history'};
    })};
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
// gain: the weekly +1 roll; reminder: legacy inline reminder entrance;
// riskMoment: the once-a-week weekend sheet; reminderHidden: the user hid
// this week's reminders.
const PRESENTATION_KINDS=['gain','reminder','riskMoment','reminderHidden'];
// When a write fails, both Hide and Undo still express the user's choice for
// this app session. A false override must win over an older stored Hide.
const sessionReminderChoices=new Map();
export function clearStreakReminderSession(){sessionReminderChoices.clear();}
export function streakReminderHidden(profileId,week,storage=globalThis.localStorage){
  const key=`${profileId}:${week}`;
  return sessionReminderChoices.has(key)?sessionReminderChoices.get(key):streakPresentationSeen(profileId,'reminderHidden',week,storage);
}
function presentationRecords(storage) {
  const parsed=JSON.parse(storage.getItem(STREAK_PRESENTATION_KEY)||'{}');
  return Array.isArray(parsed.records)?parsed.records.filter(row=>row&&typeof row.profileId==='string'):[];
}
function writePresentation(profileId,kind,stamp,storage) {
  const records=presentationRecords(storage),existing=records.find(row=>row.profileId===profileId);
  const next=[...records.filter(row=>row.profileId!==profileId),{...existing,profileId,[kind]:stamp}].slice(-8);
  storage.setItem(STREAK_PRESENTATION_KEY,JSON.stringify({records:next}));
}
export function claimStreakPresentation(profileId,kind,stamp,storage=globalThis.localStorage) {
  if(!profileId||!['gain','reminder','riskMoment'].includes(kind)||dayNumber(stamp)===null)return false;
  try {
    if(presentationRecords(storage).find(row=>row.profileId===profileId)?.[kind]===stamp)return false;
    writePresentation(profileId,kind,stamp,storage);return true;
  } catch {return false;}
}
export function streakPresentationSeen(profileId,kind,stamp,storage=globalThis.localStorage) {
  if(!profileId||!PRESENTATION_KINDS.includes(kind)||dayNumber(stamp)===null)return false;
  try {return presentationRecords(storage).find(row=>row.profileId===profileId)?.[kind]===stamp;}
  catch {return false;}
}
// Returns false when storage refuses the write; callers keep their own
// in-memory choice so a blocked store never brings the row straight back.
export function setStreakReminderHidden(profileId,week,hidden,storage=globalThis.localStorage) {
  if(!profileId||dayNumber(week)===null)return false;
  const key=`${profileId}:${week}`;
  try {
    const existing=presentationRecords(storage).find(row=>row.profileId===profileId);
    if(hidden)writePresentation(profileId,'reminderHidden',week,storage);
    else if(existing?.reminderHidden===week)writePresentation(profileId,'reminderHidden',null,storage);
    sessionReminderChoices.delete(key);
    return true;
  } catch {
    sessionReminderChoices.delete(key);sessionReminderChoices.set(key,Boolean(hidden));
    while(sessionReminderChoices.size>8)sessionReminderChoices.delete(sessionReminderChoices.keys().next().value);
    return false;
  }
}

// Saturday is the first reminder day: it leaves two real days to train or to
// decide to rest, while Monday–Friday stays quiet. Only the actual local today
// counts, never a browsed date, and only an already-running streak is at stake.
export const STREAK_REMINDER_FIRST_WEEKDAY=6;
export function weekendStreakReminder(state,now=new Date(),viewedDay=localDay(now)) {
  const todayKey=localDay(now),today=dayNumber(todayKey);
  if(viewedDay!==todayKey||today===null)return null;
  const weekdayIndex=new Date(today*DAY_MS).getUTCDay();
  if(weekdayIndex!==0&&weekdayIndex<STREAK_REMINDER_FIRST_WEEKDAY)return null;
  const streak=weeklyTrainingStreak(state,now);
  if(!streak.current||streak.earnedThisWeek)return null;
  // A session already open this week owns Today's actions; finishing it is the
  // user's call and may or may not count (no set logged, under a minute).
  // An undatable open session is treated as this week's, so the row stays out of its way.
  const currentWeek=monday(today),inThisWeek=day=>{const value=dayNumber(day);return value===null||monday(value)===currentWeek;};
  if(state.activeWorkout&&inThisWeek(workoutPerformedDate(state.activeWorkout)||state.activeWorkout.workoutDateKey))return null;
  const optional=state.activeOptionalSession;
  if(optional&&inThisWeek(optional.date||workoutPerformedDate(optional)))return null;
  return {current:streak.current,week:streak.week,lastDay:weekdayIndex===0};
}
