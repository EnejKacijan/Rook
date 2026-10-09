import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {adjustWeekReorderState} from './fixtures/adjustWeekReorderState.js';
import {proposeFlexibleWeek,flexibleReorderRows,applyFlexibleWeek,flexibleSessions} from './flexibleWeek.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {scheduleRevisionUndo,undoScheduleRevision} from './scheduleTransactions.js';
import {syncEntities,planSyncReconciliation,applySyncDownloads} from './accountSyncModel.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const request={mode:'available',dateScope:'current-week',availableDates:['2026-10-05','2026-10-07','2026-10-11']};
const auto=state=>proposeFlexibleWeek(state,request);
const reordered=state=>{const initial=auto(state),ids=flexibleReorderRows(initial).map(row=>row.logicalSessionId);return proposeFlexibleWeek(state,{...request,workoutOrder:[ids[2],ids[0],ids[1]]});};
it('uses the same validated date slots in order with stable occurrences and changed-only provenance',()=>{
 const state=adjustWeekReorderState(),before=structuredClone(state),initial=auto(state),next=reordered(state),rows=flexibleReorderRows(next);
 expect(next.status).toBe('ready');expect(rows.map(row=>[row.name,row.toDate])).toEqual([['Upper B','2026-10-05'],['Upper A','2026-10-07'],['Lower A','2026-10-11']]);
 expect(rows.map(row=>row.logicalSessionId).sort()).toEqual(flexibleReorderRows(initial).map(row=>row.logicalSessionId).sort());
 for(const row of rows)expect(row).toMatchObject(initial.availabilitySchedule.find(item=>item.logicalSessionId===row.logicalSessionId)&&{originalDate:initial.availabilitySchedule.find(item=>item.logicalSessionId===row.logicalSessionId).originalDate});
 expect(new Set(next.changes.map(row=>row.logicalSessionId)).size).toBe(next.changes.length);expect(state).toEqual(before);
 const applied=applyFlexibleWeek(state,next);expect(applied.status).toBe('applied');
 for(const row of rows)expect(applied.state.flexibleWeek.sessions[row.logicalSessionId]).toMatchObject({id:row.logicalSessionId,originalDate:row.originalDate,scheduledDate:row.toDate});
 expect(applied.state.program).toEqual(state.program);expect(applied.state.workouts).toEqual(state.workouts);
 expect(flexibleSessions(applied.state).filter(row=>row.originalDate>='2026-10-12').map(row=>[row.logicalSessionId,row.scheduledDate])).toEqual(flexibleSessions(state).filter(row=>row.originalDate>='2026-10-12').map(row=>[row.logicalSessionId,row.scheduledDate]));
 expect(deserializeState(serializeState(applied.state)).flexibleWeek).toEqual(applied.state.flexibleWeek);
});
it('one placed, unresolved capacity, or non-availability context never advertises reorder',()=>{
 const state=adjustWeekReorderState(),short=proposeFlexibleWeek(state,{...request,availableDates:['2026-10-05']});
 expect(short.unresolvedCount).toBe(2);expect(flexibleReorderRows(short)).toEqual([]);
 const one=structuredClone(state);one.program.days=one.program.days.slice(0,1);expect(flexibleReorderRows(auto(one))).toEqual([]);
 expect(flexibleReorderRows({status:'ready',request:{mode:'move'},availabilitySchedule:auto(state).availabilitySchedule})).toEqual([]);
});
it.each(['duplicate','missing','future','unresolved'])('rejects a %s order without importing or discarding sources',kind=>{
 const state=adjustWeekReorderState(),ids=auto(state).availabilitySchedule.map(row=>row.logicalSessionId),input={...request,workoutOrder:[...ids]};
 if(kind==='duplicate')input.workoutOrder[1]=ids[0];if(kind==='missing')input.workoutOrder.pop();
 if(kind==='future')input.workoutOrder[0]=flexibleSessions(state).find(row=>row.originalDate==='2026-10-12').logicalSessionId;
 if(kind==='unresolved')input.availableDates=['2026-10-05','2026-10-07'];
 expect(proposeFlexibleWeek(state,input).status).toBe('conflict');expect(state.flexibleWeek).toBeNull();
});
it.each(['active','completed','ended'])('%s source is fixed and excluded from order',kind=>{
 const state=adjustWeekReorderState(),item=flexibleSessions(state).find(row=>row.originalDate==='2026-10-05');state.activeWorkout=startWorkout(state,item.workout);
 if(kind!=='active'){state.workouts.push({...state.activeWorkout,endedEarly:kind==='ended',endedAt:Date.now(),completedAt:Date.now()});state.activeWorkout=null;}
 const p=auto(state);expect(p.status).toBe('ready');expect(p.sourceScope.sessionIds).not.toContain(item.logicalSessionId);expect(flexibleReorderRows(p)).toHaveLength(2);
 const ids=flexibleReorderRows(p).map(row=>row.logicalSessionId).reverse(),result=proposeFlexibleWeek(state,{...p.request,workoutOrder:ids});expect(result.status).toBe('ready');
 const after=applyFlexibleWeek(state,result).state;expect(after.activeWorkout).toEqual(state.activeWorkout);expect(after.workouts).toEqual(state.workouts);
 expect(after.flexibleWeek.sessions[item.logicalSessionId]).toBeUndefined();
});
it('includes an explicitly moved later slot without extending the current-week source set',()=>{
 const state=adjustWeekReorderState(),initial=proposeFlexibleWeek(state,{...request,availableDates:['2026-10-05','2026-10-07']}),pending=initial.availabilitySchedule.find(row=>!row.toDate);
 const resolved=proposeFlexibleWeek(state,{...initial.request,resolutions:[{mode:'move',sessionId:pending.logicalSessionId,toDate:'2026-10-13'}]});expect(resolved.status).toBe('ready');
 const ids=flexibleReorderRows(resolved).map(row=>row.logicalSessionId).reverse(),next=proposeFlexibleWeek(state,{...resolved.request,workoutOrder:ids});expect(next.status).toBe('ready');
 expect(flexibleReorderRows(next).map(row=>row.toDate)).toEqual(['2026-10-05','2026-10-07','2026-10-13']);expect(next.sourceScope).toEqual(initial.sourceScope);
 expect(next.availabilitySchedule.every(row=>row.originalDate<='2026-10-11')).toBe(true);
});
it('retains canonical back-to-back warnings after reorder',()=>{
 const state=adjustWeekReorderState(),p=proposeFlexibleWeek(state,{...request,availableDates:['2026-10-05','2026-10-06','2026-10-07']});
 const next=proposeFlexibleWeek(state,{...p.request,workoutOrder:flexibleReorderRows(p).map(row=>row.logicalSessionId).reverse()});expect(next.warnings).toContain('This creates back-to-back training days.');
});
it.each(['generation','plan','completed','optional','rollover','tamper'])('rejects stale/tampered Apply after %s',kind=>{
 const state=adjustWeekReorderState(),p=reordered(state),newer=structuredClone(state);
 if(kind==='generation')newer.flexibleWeek={schemaVersion:1,revision:2,generation:'external',sessions:{}};
 if(kind==='plan')newer.program.days[0].name='Edited';
 if(kind==='completed')newer.workouts.push({id:'external',completedAt:Date.now()});
 if(kind==='optional')newer.activeOptionalSession={id:'optional',date:'2026-10-07'};
 if(kind==='rollover')vi.setSystemTime(new Date('2026-10-06T12:00:00'));
 if(kind==='tamper')p.availabilitySchedule[0].toDate='2026-10-08';
 expect(applyFlexibleWeek(newer,p).status).toBe('stale');expect(newer.program).toEqual(kind==='plan'?newer.program:state.program);
});
it('Apply and whole-revision Undo converge through the existing sync entities',()=>{
 const initial=adjustWeekReorderState(),a=applyFlexibleWeek(initial,proposeFlexibleWeek(initial,{mode:'skip',sessionId:flexibleSessions(initial).find(row=>row.originalDate==='2026-10-05').logicalSessionId})).state;
 const p=auto(a),order=flexibleReorderRows(p).map(row=>row.logicalSessionId).reverse(),b=applyFlexibleWeek(a,proposeFlexibleWeek(a,{...p.request,workoutOrder:order})).state;
 function converge(before,after){const base=syncEntities(before),next=syncEntities(after),ack=new Map([...base].map(([k,e])=>[k,{revision:1,digest:e.digest}])),cloud=new Map([...base].map(([k,e])=>[k,{...e,revision:1,syncSchemaVersion:1,deleted:false}]));
  const upload=planSyncReconciliation({localEntities:next,cloudEntities:cloud,acknowledged:ack});expect(upload.conflicts).toEqual([]);for(const op of upload.upload)cloud.set(op.key,{...op.entity,revision:op.baseRevision+1,syncSchemaVersion:1,deleted:false});
  const download=planSyncReconciliation({localEntities:base,cloudEntities:cloud,acknowledged:ack});expect(download.conflicts).toEqual([]);return applySyncDownloads(before,download.download);}
 expect(converge(a,b).flexibleWeek).toEqual(b.flexibleWeek);
 const undo=undoScheduleRevision(b,scheduleRevisionUndo(a,b));expect(undo.flexibleWeek.sessions).toEqual(a.flexibleWeek.sessions);expect(undo.flexibleWeek.revision).toBeGreaterThan(b.flexibleWeek.revision);expect(undo.flexibleWeek.generation).not.toBe(b.flexibleWeek.generation);
 expect(undo.workouts).toEqual(a.workouts);expect(undo.program).toEqual(a.program);expect(converge(b,undo).flexibleWeek).toEqual(undo.flexibleWeek);
});
