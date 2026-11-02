import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {weekendStreakReminder,weeklyTrainingStreak,setStreakReminderHidden,streakPresentationSeen,claimStreakPresentation,STREAK_PRESENTATION_KEY} from './trainingStreak.js';
import {blankState} from './domain.js';

// Week of Mon 26 Oct 2026: Fri 30, Sat 31, Sun 1 Nov. Streak weeks 12 and 19 Oct.
const log=(day,id=day,more={})=>({id,startedAt:new Date(`${day}T09:00:00`).getTime(),completedAt:new Date(`${day}T10:00:00`).toISOString(),status:'completed',exercises:[{sets:[{completed:true,reps:8}]}],...more});
const state=(days=['2026-10-12','2026-10-19'])=>({...blankState(),profile:{...blankState().profile,id:'p1'},workouts:days.map(day=>log(day))});
const at=value=>new Date(value);
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(at('2026-10-31T12:00:00'));localStorage.clear();});
afterEach(()=>{vi.useRealTimers();localStorage.clear();});

it('stays quiet Monday to Friday and appears from Saturday through Sunday for a running streak',()=>{
  const s=state();
  for(const day of ['2026-10-26','2026-10-28','2026-10-30'])expect(weekendStreakReminder(s,at(`${day}T20:00:00`))).toBeNull();
  expect(weekendStreakReminder(s,at('2026-10-31T00:00:00'))).toEqual({current:2,week:'2026-10-26',lastDay:false});
  expect(weekendStreakReminder(s,at('2026-11-01T23:59:00'))).toEqual({current:2,week:'2026-10-26',lastDay:true});
  // Monday: the open week closed without training, so nothing remains to keep.
  expect(weekendStreakReminder(s,at('2026-11-02T00:00:00'))).toBeNull();
  expect(weeklyTrainingStreak(s,at('2026-11-02T00:00:00')).current).toBe(0);
});
it('one completed workout this week is enough, even with other planned workouts missed',()=>{
  const s=state(['2026-10-12','2026-10-19','2026-10-27']);s.program={days:[{weekday:'Mon'},{weekday:'Wed'},{weekday:'Fri'}]};
  expect(weekendStreakReminder(s)).toBeNull();
  const cardio=state();cardio.optionalSessions=[{id:'c',kind:'Cardio',status:'completed',date:'2026-10-29',startedAt:at('2026-10-29T08:00:00').getTime(),completedAt:at('2026-10-29T08:20:00').toISOString(),elapsedSeconds:1200}];
  expect(weekendStreakReminder(cardio)).toBeNull();
  cardio.optionalSessions[0].elapsedSeconds=30;expect(weekendStreakReminder(cardio)).toMatchObject({current:2});
});
it('nothing to lose: new user, zero streak and an already broken streak get no reminder',()=>{
  expect(weekendStreakReminder(state([]))).toBeNull();
  expect(weekendStreakReminder(state(['2026-10-05']))).toBeNull();
  expect(weeklyTrainingStreak(state(['2026-10-05'])).best).toBe(1);
});
it('only the actual local today shows it, never a browsed past or future date',()=>{
  const s=state();
  expect(weekendStreakReminder(s,at('2026-10-31T12:00:00'),'2026-10-31')).not.toBeNull();
  expect(weekendStreakReminder(s,at('2026-10-31T12:00:00'),'2026-10-30')).toBeNull();
  expect(weekendStreakReminder(s,at('2026-10-31T12:00:00'),'2026-11-01')).toBeNull();
  expect(weekendStreakReminder(s,at('2026-10-31T12:00:00'),'2026-10-24')).toBeNull();
});
it('uses the performed date: last week’s workout finished today does not cover this week',()=>{
  const s=state(['2026-10-12']);s.workouts.push(log('2026-10-25','late',{completedAt:at('2026-10-31T08:00:00').toISOString()}));
  expect(weeklyTrainingStreak(s)).toMatchObject({current:2,earnedThisWeek:false});
  expect(weekendStreakReminder(s)).toEqual({current:2,week:'2026-10-26',lastDay:false});
});
it('gives way to a session already open this week but not to a stale one from last week',()=>{
  const s=state();
  s.activeWorkout={id:'a',status:'active',startedAt:at('2026-10-31T09:00:00').getTime(),exercises:[{sets:[{completed:false}]}]};
  expect(weekendStreakReminder(s)).toBeNull();
  s.activeWorkout.startedAt=at('2026-10-24T09:00:00').getTime();
  expect(weekendStreakReminder(s)).toMatchObject({current:2});
  s.activeWorkout={id:'undated',status:'active',exercises:[]};expect(weekendStreakReminder(s)).toBeNull();
  s.activeWorkout=null;s.activeOptionalSession={id:'o',kind:'Mobility',status:'paused',date:'2026-10-31',startedAt:at('2026-10-31T09:00:00').getTime()};
  expect(weekendStreakReminder(s)).toBeNull();
  s.activeOptionalSession.date='2026-10-23';expect(weekendStreakReminder(s)).toMatchObject({current:2});
});
it('recalculates after completion, deletion, correction and imported history',()=>{
  const s=state();expect(weekendStreakReminder(s)).not.toBeNull();
  s.workouts.push(log('2026-10-31','today'));expect(weekendStreakReminder(s)).toBeNull();
  s.workouts.at(-1).exercises[0].sets[0].completed=false;expect(weekendStreakReminder(s)).not.toBeNull();
  s.workouts.pop();s.workouts.splice(0,1);expect(weekendStreakReminder(s)).toMatchObject({current:1});
  const imported=state([]);imported.workouts=['2026-10-12','2026-10-19'].map(day=>log(day,`i-${day}`,{historicalImport:true,sourceDate:{day}}));
  expect(weekendStreakReminder(imported)).toMatchObject({current:2});
  imported.workouts.push(log('2026-10-30','i-now',{historicalImport:true,sourceDate:{day:'2026-10-30'}}));expect(weekendStreakReminder(imported)).toBeNull();
});
it('follows the local calendar over DST changes and the year boundary',()=>{
  // EU DST ended Sun 25 Oct 2026; US DST ends Sun 1 Nov 2026.
  const dst=state(['2026-10-05','2026-10-12']);
  expect(weekendStreakReminder(dst,at('2026-10-25T23:30:00'))).toMatchObject({lastDay:true,week:'2026-10-19'});
  expect(weekendStreakReminder(dst,at('2026-10-26T00:30:00'))).toBeNull();
  expect(weekendStreakReminder(state(),at('2026-11-01T01:30:00'))).toMatchObject({lastDay:true});
  expect(weekendStreakReminder(state(['2026-12-21','2026-12-28']),at('2027-01-02T10:00:00'))).toBeNull();
  const open=state(['2026-12-14','2026-12-21']);
  expect(weekendStreakReminder(open,at('2027-01-02T10:00:00'))).toEqual({current:2,week:'2026-12-28',lastDay:false});
  expect(weekendStreakReminder(open,at('2027-01-03T23:59:00'))).toEqual({current:2,week:'2026-12-28',lastDay:true});
  expect(weekendStreakReminder(open,at('2027-01-04T00:00:00'))).toBeNull();
});
it('hidden choices are per profile and week, bounded, reversible and safe on storage errors',()=>{
  expect(streakPresentationSeen('p1','reminderHidden','2026-10-26')).toBe(false);
  expect(setStreakReminderHidden('p1','2026-10-26',true)).toBe(true);
  expect(streakPresentationSeen('p1','reminderHidden','2026-10-26')).toBe(true);
  expect(streakPresentationSeen('p2','reminderHidden','2026-10-26')).toBe(false);
  expect(streakPresentationSeen('p1','reminderHidden','2026-11-02')).toBe(false);
  expect(setStreakReminderHidden('p1','2026-10-26',false)).toBe(true);
  expect(streakPresentationSeen('p1','reminderHidden','2026-10-26')).toBe(false);
  // The reminder entrance and the weekly gain keep separate receipts in one record.
  expect(claimStreakPresentation('p1','gain','2026-10-26')).toBe(true);expect(claimStreakPresentation('p1','reminder','2026-10-26')).toBe(true);
  expect(claimStreakPresentation('p1','reminder','2026-10-26')).toBe(false);expect(claimStreakPresentation('p1','reminderHidden','2026-10-26')).toBe(false);
  expect(JSON.parse(localStorage.getItem(STREAK_PRESENTATION_KEY)).records).toEqual([{profileId:'p1',gain:'2026-10-26',reminder:'2026-10-26',reminderHidden:null}]);
  for(let i=0;i<20;i++)setStreakReminderHidden(`x${i}`,'2026-10-26',true);
  expect(JSON.parse(localStorage.getItem(STREAK_PRESENTATION_KEY)).records).toHaveLength(8);
  expect(setStreakReminderHidden('p1','bad',true)).toBe(false);expect(setStreakReminderHidden('','2026-10-26',true)).toBe(false);
  expect(setStreakReminderHidden('p1','2026-10-26',true,{getItem:()=>null,setItem(){throw Error('quota');}})).toBe(false);
  expect(streakPresentationSeen('p1','reminderHidden','2026-10-26',{getItem(){throw Error('blocked');}})).toBe(false);
});
