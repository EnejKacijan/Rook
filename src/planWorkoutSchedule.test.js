import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {blankState,buildProgram,completeWorkout,deserializeState} from './domain.js';
import * as domain from './domain.js';
import {planWorkoutChoices,startPlanWorkoutExtra} from './planWorkoutTemplates.js';
import {planScheduledOptions,reviewPlanWorkoutStart,startScheduledPlanWorkout} from './planWorkoutSchedule.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
function scheduleFixture(days=['Mon','Wed','Fri']){
  const state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:days.length,availableDays:days,sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-10-19';state.selectedDate='2026-10-23';
  return deserializeState(state);
}
const request=(state,index=0)=>{
  const reference=planWorkoutChoices(state)[index].reference,snapshot=planScheduledOptions(state,reference);
  const option=snapshot.options[0];
  return {reference,snapshot,sessionId:option?.id,displacedTo:option?.destinations[0],requestId:'planned-test'};
};
it('reviews both missed recovery moves, never sends today into the past, and starts atomically with the original identity',()=>{
  const state=scheduleFixture(),before=structuredClone(state),r=request(state),review=reviewPlanWorkoutStart(state,r);
  expect(review.mode).toBe('recover');expect(review.changes).toHaveLength(2);
  expect(review.changes.every(c=>c.toDate>='2026-10-23')).toBe(true);
  expect(review.changes.find(c=>c.workoutId===r.reference.dayId)).toMatchObject({fromDate:'2026-10-19',toDate:'2026-10-23'});
  expect(state).toEqual(before);
  const next=startScheduledPlanWorkout(state,r);
  expect(next.activeWorkout).toMatchObject({logicalSessionId:r.sessionId,originalScheduledDate:'2026-10-19',canonicalPlanDate:'2026-10-23'});
  expect(next.activeWorkout.source).not.toBe('freestyle');expect(next.activeWorkout.planWorkoutOrigin).toBeUndefined();
  expect(next.program).toEqual(before.program);expect(next.workouts).toEqual(before.workouts);
  expect(startScheduledPlanWorkout(next,r)).toBe(next);
  expect(deserializeState(next).activeWorkout.logicalSessionId).toBe(r.sessionId);
});
it('moves a missed or future occurrence to a rest day and retains pinned block week',()=>{
  const state=scheduleFixture(['Mon','Wed']),r=request(state),review=reviewPlanWorkoutStart(state,r);
  expect(review.mode).toBe('move');expect(review.changes).toHaveLength(1);
  expect(startScheduledPlanWorkout(state,r).activeWorkout.trainingBlock.blockWeekNumber).toBe(1);
  const future={...r,sessionId:r.snapshot.options.find(o=>o.date>'2026-10-23').id};
  const result=startScheduledPlanWorkout(state,future);
  expect(result.activeWorkout.originalScheduledDate).toBe('2026-10-26');
  expect(result.activeWorkout.trainingBlock.blockWeekNumber).toBe(2);
});
it('swaps a future occurrence with today and keeps both identities',()=>{
  const state=scheduleFixture(),r=request(state),future=r.snapshot.options.find(o=>o.date>'2026-10-23');r.sessionId=future.id;
  const review=reviewPlanWorkoutStart(state,r);expect(review.mode).toBe('swap');expect(review.changes).toHaveLength(2);
  const next=startScheduledPlanWorkout(state,r),sessions=flexibleSessions(next);
  expect(next.activeWorkout.logicalSessionId).toBe(future.id);
  expect(sessions.find(o=>o.workoutId===state.program.days[2].id&&o.originalDate==='2026-10-23').scheduledDate).toBe(future.date);
});
it('same-day start does not change the schedule and explicit extra never resolves an occurrence',()=>{
  const state=scheduleFixture(),r=request(state,2);r.sessionId=r.snapshot.options.find(o=>o.date==='2026-10-23').id;
  const next=startScheduledPlanWorkout(state,r);expect(next.flexibleWeek).toEqual(state.flexibleWeek);
  const extra=startPlanWorkoutExtra(state,r);expect(extra.activeWorkout.source).toBe('freestyle');expect(extra.flexibleWeek).toEqual(state.flexibleWeek);
});
it('uses actual occurrence edits and transfers them with the move',()=>{
  const state=scheduleFixture(),day=state.program.days[0],entry=day.exercises[0];
  state.workoutOccurrenceOverrides={'2026-10-19':{[day.id]:{excludedEntryIds:[entry.id]}}};
  const r=request(state),review=reviewPlanWorkoutStart(state,r),next=startScheduledPlanWorkout(state,r);
  expect(review.adjusted).toBe(true);
  expect(review.draft.exercises).toHaveLength(day.exercises.length-1);
  expect(review.workout.exercises.some(e=>e.id===entry.id)).toBe(false);
  expect(next.activeWorkout.exercises).toHaveLength(review.workout.exercises.length);
  expect(next.workoutOccurrenceOverrides['2026-10-23'][day.id].excludedEntryIds).toContain(entry.id);
});
it('uses the final schedule when warning about adjacent training days',()=>{
  const state=scheduleFixture(['Mon','Fri']),r=request(state);
  const review=reviewPlanWorkoutStart(state,r);
  expect(review.warnings).toEqual(['Your schedule includes back-to-back training days.']);
  const spaced=reviewPlanWorkoutStart(state,{...r,displacedTo:'2026-10-28'});
  expect(spaced.warnings).toEqual([]);
});
it.each(['profile','history','plan','schedule','active','optional','midnight'])('rejects stale %s reviews without mutating anything',kind=>{
  const state=scheduleFixture(),r=request(state),changed=structuredClone(state);
  if(kind==='profile')changed.profile.units='lb';
  if(kind==='history')changed.workouts.push({id:'new-history'});
  if(kind==='plan')changed.program.version++;
  if(kind==='schedule')changed.flexibleWeek={schemaVersion:1,revision:1,sessions:{}};
  if(kind==='active')changed.activeWorkout={id:'other'};
  if(kind==='optional')changed.activeOptionalSession={id:'optional'};
  if(kind==='midnight')vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  const before=structuredClone(changed);expect(()=>startScheduledPlanWorkout(changed,r)).toThrow('changed');expect(changed).toEqual(before);
});
it('rejects invalid/colliding displacement dates, duplicate names, skipped sources and expired missed workouts',()=>{
  const state=scheduleFixture();state.program.days[1].name=state.program.days[0].name;
  const r=request(state);expect(r.snapshot.options.every(o=>o.id.startsWith(`${state.program.days[0].id}:`))).toBe(true);
  for(const displacedTo of ['2026-10-19','2026-10-23','2026-10-26','2026-11-06'])expect(()=>startScheduledPlanWorkout(state,{...r,displacedTo})).toThrow();
  const skipped=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:r.sessionId})).state;
  expect(planScheduledOptions(skipped,r.reference).options.some(o=>o.id===r.sessionId)).toBe(false);
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
  expect(planScheduledOptions(state,r.reference).options.some(o=>o.id===r.sessionId)).toBe(false);
});
it('offers no planned starts during active strength/optional sessions or incompatible pending adjustments',()=>{
  const state=scheduleFixture(),r=request(state);
  for(const patched of [{activeWorkout:{id:'active'}},{activeOptionalSession:{id:'optional'}},{todayAdaptation:{mode:'repeat'}},{program:{...state.program,trainingBlock:{...state.program.trainingBlock,completed:true}}}])expect(planScheduledOptions({...state,...patched},r.reference).options).toEqual([]);
});
it('does not expose a planned move into an already completed today, and a failing start cannot publish staged moves',()=>{
  const state=scheduleFixture(),r=request(state),before=structuredClone(state);
  vi.spyOn(domain,'startWorkout').mockImplementation(()=>{throw Error('Cannot start this prescription.');});
  expect(()=>startScheduledPlanWorkout(state,r)).toThrow('Cannot start');expect(state).toEqual(before);
  const today=flexibleSessions(state).find(item=>item.scheduledDate==='2026-10-23');
  state.workouts.push({id:'completed',programDayId:today.workoutId,logicalSessionId:today.logicalSessionId,completedAt:'2026-10-23T09:00:00',exercises:[]});
  expect(planScheduledOptions(state,r.reference).options).toEqual([]);
});
it('finishing resolves the original missed occurrence exactly once; canceling before completion does not',()=>{
  const state=scheduleFixture(),r=request(state),next=startScheduledPlanWorkout(state,r);
  const cancelled={...next,activeWorkout:null};expect(flexibleSessions(cancelled).find(o=>o.logicalSessionId===r.sessionId).status).toBe('planned');
  expect(cancelled.flexibleWeek).toEqual(next.flexibleWeek);
  next.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{weight:20,reps:8,completed:true})));
  const completed=completeWorkout(next);expect(flexibleSessions(completed).find(o=>o.logicalSessionId===r.sessionId).status).toBe('completed');
  expect(completed.workouts.filter(w=>w.logicalSessionId===r.sessionId)).toHaveLength(1);
  expect(planScheduledOptions(completed,r.reference).options).toEqual([]);
});
