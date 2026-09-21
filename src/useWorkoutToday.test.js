import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {isoDay,deserializeState,serializeState,adaptedTemplateForToday,startWorkout,completeWorkout,plannedWorkoutForDate} from './domain.js';
import {flexibleSessions} from './flexibleWeek.js';
import * as flexibleWeek from './flexibleWeek.js';
import {proposeWorkoutToday,applyWorkoutToday,cancelRepeatedWorkout,canUseWorkoutToday} from './useWorkoutToday.js';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-17T12:00:00'));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
function fixture(){const s=deserializeState(createReturningUserFixture(2));s.program.trainingBlock.startDate='2026-09-01';s.workouts=[];s.todayAdaptation=null;return s;}
const monday=s=>flexibleSessions(s).find(i=>i.originalDate==='2026-09-14');
function completed(s){
 const now=new Date(),item=monday(s);s.selectedDate=item.scheduledDate;
 try{
  vi.setSystemTime(new Date('2026-09-14T10:00:00'));
  s.activeWorkout=startWorkout(s,{...item.workout,logicalSessionId:item.logicalSessionId});
  for(const e of s.activeWorkout.exercises)for(const set of e.sets){set.completed=true;set.reps=8;set.weight=20;}
  vi.setSystemTime(new Date('2026-09-14T10:45:00'));
  return completeWorkout(s);
 }finally{vi.setSystemTime(now);}
}
const apply=(s,p)=>applyWorkoutToday(s,p,{persist:()=>true});
it('stops menu eligibility at the first valid destination while the real proposal retains all dates',()=>{
 const s=completed(fixture()),request={workoutId:s.workouts[0].id},before=serializeState(s);
 const validate=vi.spyOn(flexibleWeek,'proposeFlexibleWeek');
 const proposal=proposeWorkoutToday(s,request);expect(proposal.status).toBe('choose-date');expect(proposal.dates.length).toBeGreaterThan(1);
 const fullChecks=validate.mock.calls.length;expect(fullChecks).toBe(13);validate.mockClear();
 expect(canUseWorkoutToday(s,request)).toBe(true);expect(validate.mock.calls.length).toBeLessThan(fullChecks);
 expect(validate.mock.calls.at(-1)[1].toDate).toBe(proposal.dates[0]);
 expect(serializeState(s)).toBe(before);expect(proposeWorkoutToday(s,request)).toEqual(proposal);
});
it.each(['unchanged','activeWorkout','activeOptionalSession','todayAdaptation','completed-block','missing-record','no-exercises'])('menu eligibility agrees with canonical proposal for %s',guard=>{
 const s=completed(fixture()),requests=[{workoutId:s.workouts[0].id},{sessionId:flexibleSessions(s).find(item=>item.status==='missed').logicalSessionId}];
 if(['activeWorkout','activeOptionalSession','todayAdaptation'].includes(guard))s[guard]={id:'busy'};
 if(guard==='completed-block')s.program.trainingBlock.completed=true;
 if(guard==='missing-record')requests[0].workoutId='missing';
 if(guard==='no-exercises')s.workouts[0].exercises=[];
 const before=serializeState(s);
 for(const request of requests)expect(canUseWorkoutToday(s,request)).toBe(['ready','choose-date'].includes(proposeWorkoutToday(s,request).status));
 expect(serializeState(s)).toBe(before);
});
it('requires explicit displacement date then moves the exact Monday occurrence to Thursday without changing plan',()=>{
 const s=fixture(),before=structuredClone(s),request={sessionId:monday(s).logicalSessionId};
 const choose=proposeWorkoutToday(s,request);expect(choose.status).toBe('choose-date');expect(s).toEqual(before);
 const p=proposeWorkoutToday(s,{...request,displacedToDate:'2026-09-18'});expect(p.status).toBe('ready');
 const next=deserializeState(serializeState(apply(s,p)));expect(next.program).toEqual(s.program);expect(next.workouts).toEqual([]);
 expect(plannedWorkoutForDate(next,'2026-09-17').logicalSessionId).toBe(request.sessionId);
 expect(plannedWorkoutForDate(next,'2026-09-18').id).toBe(choose.displaced.workoutId);
 expect(plannedWorkoutForDate(next,'2026-09-14')).toBeNull();
 next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));for(const e of next.activeWorkout.exercises)for(const set of e.sets)set.completed=true;
 const done=completeWorkout(next);expect(done.workouts).toHaveLength(1);expect(done.workouts[0].logicalSessionId).toBe(request.sessionId);
 expect(flexibleSessions(done).find(i=>i.logicalSessionId===choose.displaced.logicalSessionId).status).toBe('planned');
});
it('repeats completed Monday with new identity, blank actuals and unchanged original history and plan',()=>{
 const s=completed(fixture()),record=s.workouts[0],plan=structuredClone(s.program),history=structuredClone(s.workouts);
 const p=proposeWorkoutToday(s,{workoutId:record.id,displacedToDate:'2026-09-18'});expect(p.kind).toBe('repeat');
 expect(p.sourceDate).toBe('2026-09-14');expect(record.durationSeconds).toBe(45*60);
 const next=deserializeState(serializeState(apply(s,p)));const template=adaptedTemplateForToday(next);expect(template.id).not.toBe(record.programDayId);
 next.activeWorkout=startWorkout(next,template);expect(next.activeWorkout.repeatedFromWorkoutId).toBe(record.id);
 expect(next.activeWorkout.exercises.flatMap(e=>e.sets).every(s=>!s.completed && s.rir==null)).toBe(true);
 for(const e of next.activeWorkout.exercises)for(const set of e.sets)set.completed=true;
 const done=completeWorkout(next);expect(done.workouts).toHaveLength(2);expect(done.workouts[0]).toEqual(history[0]);expect(done.program).toEqual(plan);expect(done.todayAdaptation).toBeNull();
 expect(deserializeState(serializeState(done)).workouts).toHaveLength(2);
});
it('allows completed today while preserving that history',()=>{
 const s=fixture(),today=flexibleSessions(s).find(i=>i.scheduledDate===isoDay());
 s.selectedDate=isoDay();s.activeWorkout=startWorkout(s,{...today.workout,logicalSessionId:today.logicalSessionId});for(const e of s.activeWorkout.exercises)for(const set of e.sets)set.completed=true;
 const done=completeWorkout(s),p=proposeWorkoutToday(done,{sessionId:monday(done).logicalSessionId});expect(p.status).toBe('ready');const next=apply(done,p);expect(next.workouts).toEqual(done.workouts);expect(adaptedTemplateForToday(next).logicalSessionId).toBe(p.request.sessionId);
});
it('supports rest day and uses IDs even with identical names',()=>{
 const s=fixture();for(const day of s.program.days)day.name='Upper';vi.setSystemTime(new Date('2026-09-18T12:00:00'));
 const request={sessionId:monday(s).logicalSessionId},p=proposeWorkoutToday(s,request);expect(p.status).toBe('ready');expect(p.displaced).toBeUndefined();expect(adaptedTemplateForToday(apply(s,p)).logicalSessionId).toBe(request.sessionId);
});
it('rejects past displacement, active/pending guards, stale and double apply; failed write leaves source intact',()=>{
 const s=fixture(),request={sessionId:monday(s).logicalSessionId,displacedToDate:'2026-09-18'},original=structuredClone(s),p=proposeWorkoutToday(s,request);
 expect(proposeWorkoutToday(s,{...request,displacedToDate:'2026-09-14'}).status).toBe('conflict');
 for(const key of ['activeWorkout','activeOptionalSession','todayAdaptation'])expect(proposeWorkoutToday({...s,[key]:{id:'pending'}},request).status).toBe('conflict');
 expect(()=>applyWorkoutToday(s,p,{persist:()=>false})).toThrow(/previous schedule/);expect(s).toEqual(original);
 expect(()=>apply(apply(s,p),p)).toThrow(/changed/);expect(()=>apply({...s,workouts:[{id:'changed'}]},p)).toThrow(/changed/);
});
it('cancels a repeated workout before and after Start without changing history or the displaced session',()=>{
 const s=completed(fixture()),p=proposeWorkoutToday(s,{workoutId:s.workouts[0].id,displacedToDate:'2026-09-18'}),pending=apply(s,p);
 for(const started of [false,true]){
  const next=deserializeState(serializeState(pending));if(started)next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));
  expect(()=>cancelRepeatedWorkout(next,{persist:()=>false})).toThrow(/unchanged/);
  const cancelled=cancelRepeatedWorkout(next,{persist:()=>true});expect(cancelled.todayAdaptation).toBeNull();expect(cancelled.activeWorkout).toBeNull();expect(cancelled.workouts).toEqual(s.workouts);expect(cancelled.program).toEqual(s.program);expect(plannedWorkoutForDate(cancelled,'2026-09-18')).not.toBeNull();
 }
 pending.activeWorkout=startWorkout(pending,adaptedTemplateForToday(pending));pending.activeWorkout.exercises[0].sets[0].completed=true;
 expect(()=>cancelRepeatedWorkout(pending,{persist:()=>true})).toThrow(/logged sets/);
});
it('applies both moves with an advancing clock rather than relying on identical timestamps',()=>{
 const s=fixture(),request={sessionId:monday(s).logicalSessionId,displacedToDate:'2026-09-18'},p=proposeWorkoutToday(s,request);
 vi.useRealTimers();const NativeDate=Date;let tick=0;const base=new NativeDate('2026-09-17T12:00:00').getTime();
 vi.stubGlobal('Date',class extends NativeDate{constructor(...args){super(...(args.length?args:[base+tick++]));}static now(){return base+tick++;}});
 const next=apply(s,p);expect(adaptedTemplateForToday(next).logicalSessionId).toBe(request.sessionId);expect(plannedWorkoutForDate(next,'2026-09-18')).not.toBeNull();
});
it('keeps two same-title occurrences from different weeks distinct after completion, move and backup',async()=>{
 let s=fixture();const earlier=flexibleSessions(s).find(i=>i.originalDate==='2026-09-07');const current=monday(s);
 s=apply(s,proposeWorkoutToday(s,{sessionId:earlier.logicalSessionId,displacedToDate:'2026-09-18'}));
 s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));for(const e of s.activeWorkout.exercises)for(const set of e.sets){set.completed=true;set.reps=8;}
 s=completeWorkout(s);const history=structuredClone(s.workouts);
 const p=proposeWorkoutToday(s,{sessionId:current.logicalSessionId});expect(p.status).toBe('ready');
 const next=apply(s,p);expect(adaptedTemplateForToday(next).logicalSessionId).toBe(current.logicalSessionId);expect(next.workouts).toEqual(history);
 const restored=(await parseBackupArchive((await buildBackupArchive(next,[])).bytes)).state;
 expect(adaptedTemplateForToday(restored).logicalSessionId).toBe(current.logicalSessionId);expect(restored.workouts).toEqual(history);
});
