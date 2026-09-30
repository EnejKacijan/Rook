import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { deserializeState, plannedWorkoutForDate, startWorkout } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, availabilityAdjustmentScope, flexibleSessions, proposeFlexibleWeek, temporaryScheduleReview, remainingPlanWeekDates } from './flexibleWeek.js';
import { adjustWeekState, ADJUSTMENT_TODAY as today } from './fixtures/adjustWeekState.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(today+'T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const dates=indices=>indices.map(i=>addCalendarDays(today,i));
const review=(state,indices,windowDays=7)=>proposeFlexibleWeek(state,{mode:'available',windowDays,availableDates:dates(indices)},today);

it.each([['2026-09-28',7],['2026-09-30',5],['2026-10-04',1]])('remaining calendar-week dates from %s stop on Sunday', (date,count)=>{
 const remaining=remainingPlanWeekDates(date);
 expect(remaining).toHaveLength(count);expect(remaining[0]).toBe(date);expect(remaining.at(-1)).toBe('2026-10-04');
});
it('current-week availability cannot silently schedule into the following week, while an explicit move still can',()=>{
 const state=adjustWeekState(),request={mode:'available',dateScope:'current-week',availableDates:dates([0,1,2,3,6])};
 expect(proposeFlexibleWeek(state,request,today)).toMatchObject({status:'conflict'});
 const valid=proposeFlexibleWeek(state,{...request,availableDates:dates([0,1,2,3,5])},today);
 expect(valid).toMatchObject({status:'ready',sourceScope:{start:'2026-09-28',end:'2026-10-04'}});
 expect(valid.availabilitySchedule.every(row=>row.toDate<='2026-10-04')).toBe(true);
 const source=availabilityAdjustmentScope(state,today).sources[0];
 expect(proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-10'},today).status).toBe('ready');
});

it('keeps five current sources when next Monday is visible, independent of destination expansion',()=>{
 const state=adjustWeekState(),sources=availabilityAdjustmentScope(state).sources;
 expect(sources).toHaveLength(5);expect(flexibleSessions(state).find(s=>s.originalDate==='2026-10-05')).toBeDefined();
 for(const window of [7,14]){
  const result=review(state,[0,1,2,3,4],window);
  expect(result).toMatchObject({status:'ready',remainingSessions:5,canApplySchedule:true});
  expect(result.sourceScope).toEqual({start:'2026-09-28',end:'2026-10-04',sessionIds:sources.map(s=>s.logicalSessionId)});
  expect(result.availabilitySchedule).toHaveLength(5);
 }
});
it('four days preserves all five sources in review, one unresolved, and cannot apply partially',()=>{
 const state=adjustWeekState(),before=structuredClone(state),result=review(state,[0,1,2,3]);
 expect(result).toMatchObject({status:'insufficient-capacity',remainingSessions:5,selectedDays:4,placedCount:4,unresolvedCount:1,canApplySchedule:false});
 expect(result.availabilitySchedule).toHaveLength(5);expect(result.availabilitySchedule.filter(s=>!s.toDate)).toHaveLength(1);
 expect(result.availabilitySchedule.map(s=>s.logicalSessionId)).toEqual(availabilityAdjustmentScope(state).sources.map(s=>s.logicalSessionId));
 expect(state).toEqual(before);expect(applyFlexibleWeek(state,result).status).not.toBe('applied');
});
for(const indices of [[0,1,2,3,4,5],[0,1,2,3,4,5,6]])it(indices.length+' available days do not fabricate sources',()=>{
 const state=adjustWeekState(),result=review(state,indices);
 expect(result).toMatchObject({status:'ready',remainingSessions:5,unresolvedCount:0});
 expect(result.availabilitySchedule).toHaveLength(5);expect(new Set(result.availabilitySchedule.map(s=>s.toDate)).size).toBe(5);
 expect(result.availabilitySchedule.every(s=>dates(indices).includes(s.toDate))).toBe(true);
});
it('shows an occupied future Monday explicitly without recursively moving next week',()=>{
 const state=adjustWeekState(),future=flexibleSessions(state).filter(s=>s.originalDate>='2026-10-05');
 const partial=review(state,[0,1,2,3,6],14);
 expect(partial).toMatchObject({placedCount:4,unresolvedCount:1,canApplySchedule:false});
 expect(partial.dateConflicts).toEqual([{date:'2026-10-05',name:'UPPER A',logicalSessionId:future[0].logicalSessionId}]);
 const result=review(state,[0,1,2,3,6,11],14);expect(result.status).toBe('ready');
 expect(result.availabilitySchedule.at(-1).toDate).toBe('2026-10-10');
 const next=applyFlexibleWeek(state,result).state;
 expect(flexibleSessions(next).filter(s=>s.originalDate>='2026-10-05')).toEqual(future);
 expect(next.program).toEqual(state.program);expect(next.profile).toEqual(state.profile);
});
it('uses the existing scheduler for shifting the five current workouts forward in order',()=>{
 const state=adjustWeekState({shifted:false}),result=review(state,[0,1,2,3,4]);
 expect(result.status).toBe('ready');expect(result.changes).toHaveLength(5);
 expect(result.availabilitySchedule.map(s=>s.originalDate)).toEqual(['2026-09-28',...dates([0,1,2,3])]);
 expect(result.availabilitySchedule.map(s=>s.toDate)).toEqual(dates([0,1,2,3,4]));
});
it('applies exactly reviewed identities/dates atomically, survives reload, and retains source/destination provenance',()=>{
 const state=adjustWeekState(),before=structuredClone(state),result=review(state,[1,2,3,4,5]);
 const next=applyFlexibleWeek(state,result).state,reloaded=deserializeState(JSON.stringify(next));
 expect(state).toEqual(before);expect(reloaded.program).toEqual(deserializeState(state).program);
 for(const row of result.availabilitySchedule){
  expect(next.flexibleWeek.sessions[row.logicalSessionId]).toMatchObject({id:row.logicalSessionId,originalDate:row.originalDate,scheduledDate:row.toDate});
  expect(plannedWorkoutForDate(reloaded,row.toDate).logicalSessionId).toBe(row.logicalSessionId);
 }
 expect(plannedWorkoutForDate(reloaded,today)).toBeNull();expect(temporaryScheduleReview(reloaded).unresolved).toHaveLength(0);
 expect(new Set(flexibleSessions(reloaded).map(s=>s.logicalSessionId)).size).toBe(flexibleSessions(reloaded).length);
 expect(applyFlexibleWeek(next,result).status).toBe('stale');
});
it('rejects changed or tampered reviewed proposals without touching schedule state',()=>{
 const state=adjustWeekState(),result=review(state,[1,2,3,4,5]);
 const changed=structuredClone(state);changed.flexibleWeek.revision++;
 expect(applyFlexibleWeek(changed,result)).toMatchObject({status:'stale',state:changed});
 result.availabilitySchedule[0].toDate='2026-10-11';expect(applyFlexibleWeek(state,result).status).toBe('stale');
});
it.each(['completed','active','skipped','reserved'])('excludes %s work from source capacity and preserves it',status=>{
 const state=adjustWeekState(),source=availabilityAdjustmentScope(state).sources[0];
 if(status==='completed')state.workouts=[{...startWorkout(state,source.workout),logicalSessionId:source.logicalSessionId,completedAt:Date.now()}];
 if(status==='active')state.activeWorkout={...startWorkout(state,source.workout),logicalSessionId:source.logicalSessionId};
 if(status==='skipped')state.flexibleWeek.sessions[source.logicalSessionId].skipped=true;
 if(status==='reserved')state.activeOptionalSession={date:source.scheduledDate,id:'reserved'};
 const before=structuredClone(state),result=review(state,[1,2,3,4]);
 expect(result).toMatchObject({status:'ready',remainingSessions:4});
 expect(result.availabilitySchedule.some(s=>s.logicalSessionId===source.logicalSessionId)).toBe(false);
 const next=applyFlexibleWeek(state,result).state;
 expect(next.workouts).toEqual(before.workouts);expect(next.activeWorkout).toEqual(before.activeWorkout);
 expect(next.activeOptionalSession).toEqual(before.activeOptionalSession);
 expect(next.flexibleWeek.sessions[source.logicalSessionId]).toEqual(before.flexibleWeek.sessions[source.logicalSessionId]);
});
it('does not resurrect closed-week backlog but retains an explicit carried-in obligation',()=>{
 const state=adjustWeekState({shifted:false});state.program.trainingBlock.startDate='2026-09-21';
 expect(availabilityAdjustmentScope(state).sources).toHaveLength(5);
 const old=flexibleSessions(state).find(s=>s.originalDate==='2026-09-21');
 const carried=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:old.logicalSessionId,toDate:'2026-10-04'})).state;
 expect(availabilityAdjustmentScope(carried).sources).toHaveLength(6);
});
it('zero selected days leaves every source visible and unresolved; zero remaining is calm',()=>{
 const state=adjustWeekState(),result=review(state,[]);
 expect(result).toMatchObject({status:'insufficient-capacity',selectedDays:0,placedCount:0,unresolvedCount:5});
 expect(result.availabilitySchedule).toHaveLength(5);
 Object.values(state.flexibleWeek.sessions).forEach(s=>s.skipped=true);
 expect(review(state,[0])).toMatchObject({status:'no-change',remainingSessions:0});
});
it('rejects hidden-window and invalid dates instead of silently discarding them',()=>{
 expect(review(adjustWeekState(),[0,1,2,3,7],7).status).toBe('conflict');
 expect(proposeFlexibleWeek(adjustWeekState(),{mode:'available',availableDates:['2026-02-30']},today).status).toBe('conflict');
});
