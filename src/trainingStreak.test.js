import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {weeklyTrainingStreak,completedWorkoutStreakGain,completedActivityStreakGain,claimStreakPresentation,STREAK_PRESENTATION_KEY} from './trainingStreak.js';
import {blankState,completeWorkout,startWorkout,serializeState,deserializeState} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkoutReversibly,continueWorkout,canContinueWorkout} from './workoutCompletion.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T12:00:00'));localStorage.clear();});
afterEach(()=>{vi.useRealTimers();localStorage.clear();});
const log=(day,id=day,more={})=>({id,startedAt:new Date(`${day}T09:00:00`).getTime(),completedAt:new Date(`${day}T10:00:00`).toISOString(),status:'completed',exercises:[{sets:[{completed:true,reps:8}]}],...more});
const state=days=>({...blankState(),workouts:days.map(day=>log(day))});

it('starts at zero and credits real logged weeks once, regardless of training frequency',()=>{
  expect(weeklyTrainingStreak(state([]))).toMatchObject({current:0,best:0,earnedThisWeek:false,workoutsThisWeek:0});
  const s=state(['2026-10-12','2026-10-19','2026-10-26','2026-10-27']);s.workouts.push(s.workouts.at(-1));
  expect(weeklyTrainingStreak(s)).toMatchObject({current:3,best:3,earnedThisWeek:true,workoutsThisWeek:2,week:'2026-10-26'});
});
it('rest/absent app visits keep the streak through the open week, then a fully missed week ends it',()=>{
  const s=state(['2026-10-12','2026-10-19']);
  expect(weeklyTrainingStreak(s)).toMatchObject({current:2,best:2,earnedThisWeek:false});
  expect(weeklyTrainingStreak(s,new Date('2026-11-01T23:59:00'))).toMatchObject({current:2,best:2});
  expect(weeklyTrainingStreak(s,new Date('2026-11-02T00:00:00'))).toMatchObject({current:0,best:2});
});
it('a return after a missed week starts at one and keeps the longer best streak',()=>{
  const s=state(['2026-09-28','2026-10-05','2026-10-12','2026-10-27']);
  expect(weeklyTrainingStreak(s)).toMatchObject({current:1,best:3});
});
it('uses actual performed dates, not moved schedule dates, finish day or the current plan',()=>{
  const s=state([]);s.workouts=[log('2026-10-25','late',{canonicalPlanDate:'2026-10-27',workoutDateKey:'2026-10-27',completedAt:'2026-10-27T09:00:00Z'})];
  expect(weeklyTrainingStreak(s)).toMatchObject({current:1,earnedThisWeek:false,workoutsThisWeek:0});
  const original=structuredClone(s);s.program={days:[{weekday:'Sun'}]};s.weekScheduleOverrides={random:'2026-10-26'};
  expect(weeklyTrainingStreak(s)).toEqual(weeklyTrainingStreak(original));
});
it('accepts logged partial and freestyle workouts, excludes empty, active, cancelled and future logs',()=>{
  const s=state([]);s.workouts=[log('2026-10-12','partial',{status:'ended-early',endedEarly:true}),log('2026-10-19','freestyle',{source:'freestyle'}),
    log('2026-10-26','empty',{exercises:[{sets:[{completed:false}]}]}),log('2026-10-26','active',{completedAt:null}),log('2026-10-26','cancelled',{status:'cancelled'}),
    log('2026-10-28'),log('2026-10-27','future-finish',{completedAt:'2027-01-01T00:00:00Z'}),log('2026-10-27','bad',{completedAt:true})];
  expect(weeklyTrainingStreak(s)).toMatchObject({current:2,best:2,earnedThisWeek:false,workoutsThisWeek:0});
});
it('completed cardio/mobility/conditioning count after one minute of actual recorded activity',()=>{
  const s=state([]);s.optionalSessions=[{...log('2026-10-12'),kind:'Cardio',elapsedSeconds:60},
    {...log('2026-10-19'),kind:'Mobility',elapsedSeconds:90},{...log('2026-10-27'),kind:'Conditioning',intent:'conditioning',elapsedSeconds:120},
    {...log('2026-10-27','scheduled'),kind:'Cardio',elapsedSeconds:600,status:'planned'},
    {...log('2026-10-27','short'),kind:'Cardio',elapsedSeconds:59},{...log('2026-10-27','strength-copy'),kind:'Strength',elapsedSeconds:1000}];
  expect(weeklyTrainingStreak(s)).toMatchObject({current:3,workoutsThisWeek:1});
});
it('imported source-local history can restore a streak, but importing never creates a completion reward',()=>{
  const s=state(['2026-10-19']);const imported=log('2026-10-27','import',{historicalImport:true,sourceDate:{day:'2026-10-27'}});s.workouts.push(imported);
  expect(weeklyTrainingStreak(s)).toMatchObject({current:2,earnedThisWeek:true});
  expect(completedWorkoutStreakGain(s,imported,s.workouts.slice(0,1))).toBeNull();
  expect(weeklyTrainingStreak(deserializeState(serializeState(s)))).toEqual(weeklyTrainingStreak(s));
});
it('handles DST, year boundaries and explicitly recorded training timezones',()=>{
  const s=state(['2026-10-12','2026-10-19','2026-10-26']);expect(weeklyTrainingStreak(s).current).toBe(3);
  const years=state(['2026-12-21','2026-12-28','2027-01-04']);expect(weeklyTrainingStreak(years,new Date('2027-01-04T12:00:00')).current).toBe(3);
  const zoned=state([]);zoned.workouts=[log('2026-10-26','tz',{startedAt:Date.parse('2026-10-26T01:00:00Z'),completedAt:'2026-10-26T02:00:00Z',timeZoneAtStart:'America/New_York'})];
  expect(weeklyTrainingStreak(zoned)).toMatchObject({earnedThisWeek:false,current:1});
});
it('deletion and editing a log recalculate the streak without a separate award counter',()=>{
  const s=state(['2026-10-12','2026-10-19','2026-10-26']);expect(weeklyTrainingStreak(s).current).toBe(3);
  s.workouts.splice(1,1);expect(weeklyTrainingStreak(s)).toMatchObject({current:1,best:1});
  s.workouts.at(-1).exercises[0].sets[0].completed=false;expect(weeklyTrainingStreak(s)).toMatchObject({current:0,best:1});
});
it('only the first qualifying completion in the current week earns +1 week',()=>{
  const s=state(['2026-10-12','2026-10-19']),prior=structuredClone(s.workouts),fresh=log('2026-10-27');s.workouts.push(fresh);
  expect(completedWorkoutStreakGain(s,fresh,prior)).toEqual({previous:2,current:3,week:'2026-10-26'});
  const next=log('2026-10-27','second');s.workouts.push(next);expect(completedWorkoutStreakGain(s,next,s.workouts.slice(0,-1))).toBeNull();
  expect(completedWorkoutStreakGain({...s,workouts:prior},fresh,prior)).toBeNull();
});
it('finishing last week’s workout today does not invent a new current-week reward',()=>{
  const s=state(['2026-10-12','2026-10-19']),prior=structuredClone(s.workouts),fresh=log('2026-10-25','late',{completedAt:'2026-10-27T09:00:00Z'});s.workouts.push(fresh);
  expect(completedWorkoutStreakGain(s,fresh,prior)).toBeNull();
});
it('the first genuine optional session also earns a week, not another credit after a strength workout',()=>{
  const s=state(['2026-10-19']),activity={...log('2026-10-27','cardio'),kind:'Cardio',elapsedSeconds:120};s.optionalSessions=[activity];
  expect(completedActivityStreakGain(s,activity,[])).toEqual({previous:1,current:2,week:'2026-10-26'});
  s.workouts.push(log('2026-10-26'));expect(completedActivityStreakGain(s,activity,[])).toBeNull();
});
it('immediate Continue removes the completion credit and remains valid despite presentation receipts',()=>{
  const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,reps:8,weight:30});
  const {state:finished,reversal}=completeWorkoutReversibly(s);expect(weeklyTrainingStreak(finished).current).toBe(1);
  claimStreakPresentation(s.profile.id,'gain','2026-10-26');expect(canContinueWorkout(finished,reversal)).toBe(true);
  const continued=continueWorkout(finished,reversal);expect(weeklyTrainingStreak(continued).current).toBe(0);
  expect(weeklyTrainingStreak(completeWorkout(continued)).current).toBe(1);
});
it('weekly celebration receipts are once per profile/week, bounded and safe on storage errors; rest earns no receipt',()=>{
  expect(claimStreakPresentation('a','gain','2026-10-26')).toBe(true);expect(claimStreakPresentation('a','gain','2026-10-26')).toBe(false);
  expect(claimStreakPresentation('a','rest','2026-10-27')).toBe(false);expect(claimStreakPresentation('a','gain','2026-11-02')).toBe(true);
  expect(claimStreakPresentation('b','gain','2026-10-26')).toBe(true);
  for(let i=0;i<20;i++)claimStreakPresentation(String(i),'gain','2026-10-26');expect(JSON.parse(localStorage.getItem(STREAK_PRESENTATION_KEY)).records).toHaveLength(8);
  expect(claimStreakPresentation('a','gain','invalid')).toBe(false);
  expect(claimStreakPresentation('a','gain','2026-10-26',{getItem(){throw Error('blocked');}})).toBe(false);
  expect(claimStreakPresentation('a','gain','2026-10-26',{getItem:()=>null,setItem(){throw Error('quota');}})).toBe(false);
});
