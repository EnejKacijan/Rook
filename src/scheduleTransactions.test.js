import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {adjustWeekState} from './fixtures/adjustWeekState.js';
import {isoDay,serializeState,deserializeState,startWorkout} from './domain.js';
import {flexibleSessions,applyFlexibleWeek,proposeFlexibleWeek,temporaryScheduleReview,temporaryScheduleRestoreScope,temporaryScheduleRejoinDate} from './flexibleWeek.js';
import {scheduleRevisionUndo,undoScheduleRevision,canUndoScheduleRevision} from './scheduleTransactions.js';
import {hideTemporaryScheduleSummary,temporaryScheduleSummaryHidden} from './temporarySchedulePresentation.js';
import {syncEntities,applySyncDownloads,planSyncReconciliation} from './accountSyncModel.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const sample=()=>adjustWeekState({shifted:false,history:1});
const apply=(s,r)=>{const p=proposeFlexibleWeek(s,r);expect(p.status).toBe('ready');const result=applyFlexibleWeek(s,p,{adaptationChoice:'restore'});expect(result.status).toBe('applied');return result.state;};
const byDate=(s,date)=>flexibleSessions(s).find(i=>i.originalDate===date);
const change=(s,date,toDate)=>apply(s,{mode:toDate?'move':'skip',sessionId:byDate(s,date).logicalSessionId,...(toDate?{toDate}:{})});
function converge(before,after){
 const base=syncEntities(before),next=syncEntities(after),ack=new Map([...base].map(([k,e])=>[k,{revision:1,digest:e.digest}]));
 const cloud=new Map([...base].map(([k,e])=>[k,{...e,revision:1,syncSchemaVersion:1,deleted:false}]));
 const upload=planSyncReconciliation({localEntities:next,cloudEntities:cloud,acknowledged:ack});expect(upload.conflicts).toEqual([]);expect(upload.blocked).toEqual([]);
 for(const p of upload.upload)cloud.set(p.key,{...p.entity,revision:p.baseRevision+1,syncSchemaVersion:1,deleted:false});
 const download=planSyncReconciliation({localEntities:base,cloudEntities:cloud,acknowledged:ack});expect(download.conflicts).toEqual([]);expect(download.blocked).toEqual([]);
 return applySyncDownloads(before,download.download);
}
it('first revision Undo restores exact scheduling contents, leaving history/preferences intact with a new generation',()=>{
 const before=sample(),id=byDate(before,'2026-09-28').logicalSessionId;before.workoutOccurrenceOverrides={'2026-09-28':{[byDate(before,'2026-09-28').workoutId]:{orderedEntryIds:['entry']}}};
 const after=change(before,'2026-09-28','2026-10-03'),inverse=scheduleRevisionUndo(before,after);
 after.profile.units='lb';const result=undoScheduleRevision(after,inverse);
 expect(result.flexibleWeek.sessions).toEqual({});expect(result.flexibleWeek.revision).toBe(after.flexibleWeek.revision+1);expect(result.flexibleWeek.generation).not.toBe(after.flexibleWeek.generation);
 expect(result.program).toEqual(before.program);expect(result.workouts).toEqual(before.workouts);expect(result.workoutOccurrenceOverrides).toEqual(before.workoutOccurrenceOverrides);expect(result.profile.units).toBe('lb');expect(byDate(result,'2026-09-28').logicalSessionId).toBe(id);
 expect(canUndoScheduleRevision(result,inverse)).toBe(false);
});
it('A move → B additional skip → Undo returns the complete A revision, not base',()=>{
 const base=sample(),a=change(base,'2026-09-28','2026-10-03'),b=change(a,'2026-09-29');
 const result=undoScheduleRevision(b,scheduleRevisionUndo(a,b));
 expect(result.flexibleWeek.sessions).toEqual(a.flexibleWeek.sessions);expect(result.program).toEqual(a.program);
 expect(result.workouts).toEqual(a.workouts);expect(byDate(result,'2026-09-28').scheduledDate).toBe('2026-10-03');expect(byDate(result,'2026-09-29').status).toBe('planned');
 const loaded=deserializeState(serializeState(result),{strict:true});expect(loaded.flexibleWeek).toEqual(result.flexibleWeek);
 const remote=converge(b,result);expect(remote.flexibleWeek).toEqual(result.flexibleWeek);expect(remote.program).toEqual(result.program);expect(remote.workouts).toEqual(result.workouts);
});
it.each(['schedule','generation','workout','active','plan','day'])('rejects stale Undo after a later %s change',kind=>{
 const before=sample(),after=change(before,'2026-09-28','2026-10-03'),inverse=scheduleRevisionUndo(before,after);let newer=structuredClone(after);
 if(kind==='schedule')newer=change(newer,'2026-09-29');
 if(kind==='generation')newer.flexibleWeek.generation=crypto.randomUUID();
 if(kind==='workout')newer.workouts.push({id:'new-history',completedAt:Date.now()});
 if(kind==='active')newer.activeWorkout={id:'active',exercises:[]};
 if(kind==='plan')newer.program.name='Renamed';
 if(kind==='day')vi.setSystemTime(new Date('2026-09-29T12:00:00'));
 const saved=structuredClone(newer);expect(canUndoScheduleRevision(newer,inverse)).toBe(false);expect(()=>undoScheduleRevision(newer,inverse)).toThrow(/changed/);expect(newer).toEqual(saved);
});
it('Undo guard tolerates cloud property ordering without weakening generation checks',()=>{
 const base=sample(),a=change(base,'2026-09-28','2026-10-03'),inverse=scheduleRevisionUndo(base,a);
 const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reverse(v[k])])):v;
 expect(canUndoScheduleRevision(reverse(a),inverse)).toBe(true);
});
it('Restore removes safe future move/skip overrides and converges through the current sync path',()=>{
 let s=sample();s=change(s,'2026-09-29','2026-10-03');s=change(s,'2026-09-30');const before=structuredClone(s),restored=apply(s,{mode:'restore'});
 expect(restored.flexibleWeek.sessions).toEqual({});expect(byDate(restored,'2026-09-29').scheduledDate).toBe('2026-09-29');expect(byDate(restored,'2026-09-30').status).toBe('planned');
 expect(restored.workouts).toEqual(before.workouts);expect(restored.program).toEqual(before.program);
 const remote=converge(before,restored);expect(remote.flexibleWeek).toEqual(restored.flexibleWeek);expect(remote.workouts).toEqual(before.workouts);
});
it('Restore retains completed, active, past skip/move and archived block consequences',()=>{
 let s=sample();s=change(s,'2026-09-28','2026-10-03');s=change(s,'2026-09-29');s=change(s,'2026-09-30','2026-10-04');
 const item=byDate(s,'2026-09-30');s.selectedDate=item.scheduledDate;s.activeWorkout=startWorkout(s,item.workout);
 vi.setSystemTime(new Date('2026-09-30T12:00:00'));const before=structuredClone(s),scope=temporaryScheduleRestoreScope(s);expect(scope.removable).toHaveLength(0);
 const restored=apply(s,{mode:'restore'});expect(restored.flexibleWeek.sessions).toEqual(before.flexibleWeek.sessions);expect(restored.activeWorkout).toEqual(before.activeWorkout);expect(restored.workouts).toEqual(before.workouts);expect(byDate(restored,'2026-09-29').status).toBe('skipped');
});
it('completed move stays fixed while a separate future skip is restored',()=>{
 let s=sample();s=change(s,'2026-09-28','2026-10-03');s=change(s,'2026-09-29');const item=byDate(s,'2026-09-28');
 s.workouts.push({...startWorkout({...s,selectedDate:item.scheduledDate},item.workout),completedAt:'2026-09-28T13:00:00',workoutDateKey:'2026-09-28'});
 const history=structuredClone(s.workouts),restored=apply(s,{mode:'restore'});expect(restored.workouts).toEqual(history);expect(Object.keys(restored.flexibleWeek.sessions)).toEqual([item.logicalSessionId]);expect(byDate(restored,'2026-09-29').status).toBe('planned');
});
it('future archived block skip stays resolved when restoring another safe change',()=>{
 let s=sample();s=change(s,'2026-09-29');s=change(s,'2026-09-30');const archived=idFor(s,'2026-09-29');
 s.program.trainingBlock.resolvedSkips=[{logicalSessionId:archived,blockWorkoutId:'archived',blockWeekNumber:1,date:'2026-09-29'}];
 const before=structuredClone(s),scope=temporaryScheduleRestoreScope(s);expect(scope.removable.map(r=>r.originalDate)).toEqual(['2026-09-30']);const restored=apply(s,{mode:'restore'});
 expect(restored.program.trainingBlock.resolvedSkips).toEqual(before.program.trainingBlock.resolvedSkips);expect(Object.keys(restored.flexibleWeek.sessions)).toEqual([archived]);expect(restored.workouts).toEqual(before.workouts);
});
function idFor(state,date){return byDate(state,date).logicalSessionId;}
it('resumption is after the final override, not just the newly changed occurrence',()=>{
 let s=sample();s=change(s,'2026-09-28','2026-10-10');const p=proposeFlexibleWeek(s,{mode:'skip',sessionId:byDate(s,'2026-09-29').logicalSessionId});expect(p.rejoinDate).toBe('2026-10-11');
 s=apply(s,p.request);expect(temporaryScheduleRejoinDate(s)).toBe('2026-10-11');
});
it('details include changes only; Hide is presentation-only and cannot suppress unresolved attention',()=>{
 let s=change(sample(),'2026-09-29');const review=temporaryScheduleReview(s);expect(review.items).toHaveLength(1);expect(review.items[0].skipped).toBe(true);
 const hidden=hideTemporaryScheduleSummary(s);expect(hidden.flexibleWeek).toBe(s.flexibleWeek);expect(hidden.program).toBe(s.program);expect(temporaryScheduleSummaryHidden(hidden)).toBe(true);
 let moved=change(sample(),'2026-09-28','2026-10-03');moved=hideTemporaryScheduleSummary(moved);moved.program.days[0].name='Changed';expect(temporaryScheduleSummaryHidden(moved)).toBe(false);
});
