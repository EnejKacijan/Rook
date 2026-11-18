import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {blankState,buildProgram,deserializeState,serializeState,startWorkout,completeWorkout,plannedWorkoutForDate} from './domain.js';
import {applyFlexibleWeek,flexibleSessions,missedFlexibleSessions,proposeFlexibleWeek,temporaryScheduleReview} from './flexibleWeek.js';
import {scheduleRevisionUndo,undoScheduleRevision} from './scheduleTransactions.js';
import {applyTodayAdjustment,createManualTodayPreparation} from './adjustToday.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){
  const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.rotationStartDate='2026-11-16';state.program.trainingBlock.startDate='2026-11-16';return deserializeState(state);
}
const byDate=(state,date)=>flexibleSessions(state).find(item=>item.originalDate===date);
const apply=(state,request,choice='keep')=>{
  const proposal=proposeFlexibleWeek(state,request);expect(proposal.status,proposal.error).toBe('ready');
  const result=applyFlexibleWeek(state,proposal,{adaptationChoice:choice});expect(result.status,result.error).toBe('applied');return result.state;
};
const shifted=()=>{const state=fixture();return apply(state,{mode:'recover-week',sessionId:byDate(state,'2026-11-16').logicalSessionId});};
const revertRequest=id=>({mode:'restore',sessionId:id,revert:true});
const ids=state=>['2026-11-16','2026-11-18','2026-11-20'].map(date=>byDate(state,date).logicalSessionId);

it.each([[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])('supports selecting changes in order %j without orphaned moves or collisions',(...order)=>{
  let state=shifted();const original=fixture(),list=ids(state),program=structuredClone(state.program);
  const nextWeek=flexibleSessions(state).filter(item=>item.originalDate>='2026-11-23').map(item=>[item.logicalSessionId,item.scheduledDate]);
  for(const index of order){
    if(!state.flexibleWeek.sessions[list[index]])continue;
    state=deserializeState(serializeState(apply(state,revertRequest(list[index]))),{strict:true});
    expect(temporaryScheduleReview(state).unresolved).toEqual([]);
    const dates=flexibleSessions(state).filter(item=>item.status!=='skipped').map(item=>item.scheduledDate);expect(new Set(dates).size).toBe(dates.length);
  }
  expect(state.flexibleWeek.sessions).toEqual({});expect(state.program).toEqual(program);expect(state.workouts).toEqual(original.workouts);
  expect(missedFlexibleSessions(state).map(item=>item.originalDate)).toEqual(['2026-11-16']);
  expect(flexibleSessions(state).filter(item=>item.originalDate>='2026-11-23').map(item=>[item.logicalSessionId,item.scheduledDate])).toEqual(nextWeek);
});

it('previews only the dependencies of the selected change, leaving unrelated moves untouched',()=>{
  let state=shifted();const [a,b,c]=ids(state),unrelated=byDate(state,'2026-11-25');
  state=apply(state,{mode:'move',sessionId:unrelated.logicalSessionId,toDate:'2026-11-26'});
  expect(proposeFlexibleWeek(state,revertRequest(a)).restoreRecords.map(item=>item.id)).toEqual([a]);
  expect(proposeFlexibleWeek(state,revertRequest(b)).restoreRecords.map(item=>item.id)).toEqual([b,a]);
  const restored=apply(state,revertRequest(b));expect(Object.keys(restored.flexibleWeek.sessions).sort()).toEqual([c,unrelated.logicalSessionId].sort());
  expect(restored.flexibleWeek.sessions[c]).toEqual(state.flexibleWeek.sessions[c]);expect(restored.flexibleWeek.sessions[unrelated.logicalSessionId]).toEqual(state.flexibleWeek.sessions[unrelated.logicalSessionId]);
});

it.each(['active','completed'])('protects an %s recovery and its log when reverting a dependent workout',status=>{
  let state=shifted();const [a,b]=ids(state),source=byDate(state,'2026-11-16');
  state.selectedDate='2026-11-18';state.activeWorkout=startWorkout(state,source.workout);
  if(status==='completed'){
    for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:40});
    state=completeWorkout(state);
  }
  const before=serializeState(state);expect(proposeFlexibleWeek(state,revertRequest(a)).status).toBe('conflict');
  const blocked=proposeFlexibleWeek(state,revertRequest(b));expect(blocked.status).toBe('conflict');expect(blocked.error).toMatch(/started, finished/);
  expect(serializeState(state)).toBe(before);
  const moved=apply(state,{mode:'move',sessionId:b,toDate:'2026-11-19'});expect(moved.workouts).toEqual(state.workouts);expect(moved.activeWorkout).toEqual(state.activeWorkout);
});

it('keeps global restore conservative while explicit reverts may return a current-week workout as missed',()=>{
  const state=shifted(),[a]=ids(state);expect(proposeFlexibleWeek(state,{mode:'restore',sessionId:a}).status).toBe('conflict');
  const next=apply(state,revertRequest(a));expect(byDate(next,'2026-11-16').status).toBe('missed');expect(missedFlexibleSessions(next).some(item=>item.logicalSessionId===a)).toBe(true);
  expect(plannedWorkoutForDate(next,'2026-11-18')).toBeNull();
});

it('does not return a carried workout into an expired missed backlog',()=>{
  let state=fixture();vi.setSystemTime(new Date('2026-11-16T12:00:00'));
  const id=byDate(state,'2026-11-16').logicalSessionId;state=apply(state,{mode:'move',sessionId:id,toDate:'2026-11-24'});
  vi.setSystemTime(new Date('2026-11-23T12:00:00'));const before=serializeState(state),proposal=proposeFlexibleWeek(state,revertRequest(id));
  expect(proposal.status).toBe('conflict');expect(proposal.error).toContain('closed week');expect(serializeState(state)).toBe(before);
});

it('reverts an unresolved skip, but never rewinds a block already advanced by it',()=>{
  let state=fixture();const item=byDate(state,'2026-11-20');state=apply(state,{mode:'skip',sessionId:item.logicalSessionId});
  const next=apply(state,revertRequest(item.logicalSessionId));expect(byDate(next,'2026-11-20').status).toBe('planned');expect(next.program).toEqual(state.program);
  state.program.trainingBlock.resolvedSkips=[{logicalSessionId:item.logicalSessionId,blockWorkoutId:'resolved',blockWeekNumber:1,date:item.originalDate}];
  expect(proposeFlexibleWeek(state,revertRequest(item.logicalSessionId)).status).toBe('conflict');
});

it('preserves different one-off edits when linked moves share a template and target a source date',()=>{
  let state=fixture();const a=byDate(state,'2026-11-16'),b=byDate(state,'2026-11-23');
  state=apply(state,{mode:'move',sessionId:a.logicalSessionId,toDate:'2026-11-19'});
  state=apply(state,{mode:'swap',sessionId:a.logicalSessionId,otherSessionId:b.logicalSessionId});
  const editA={orderedEntryIds:a.workout.exercises.map(item=>item.id).reverse()},editB={excludedEntryIds:[b.workout.exercises[0].id]};
  state.workoutOccurrenceOverrides={'2026-11-23':{[a.workoutId]:editA},'2026-11-19':{[b.workoutId]:editB}};
  const next=apply(state,revertRequest(b.logicalSessionId));
  expect(next.workoutOccurrenceOverrides['2026-11-16'][a.workoutId]).toEqual(editA);expect(next.workoutOccurrenceOverrides['2026-11-23'][b.workoutId]).toEqual(editB);
  expect(next.workoutOccurrenceOverrides['2026-11-19'][b.workoutId]).toBeUndefined();
});

it('keeps a future one-off adjustment and offers a factual inverse of a selected revert',()=>{
  let state=fixture();const source=byDate(state,'2026-11-18'),draft=createManualTodayPreparation(state);draft.workout.exercises[0].sets[0].weight=43;
  state=applyTodayAdjustment(state,draft).state;state=apply(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-11-19'});
  const next=apply(state,revertRequest(source.logicalSessionId));expect(next.todayAdaptation.workout.exercises[0].sets[0].weight).toBe(43);expect(next.todayAdaptation.date).toBe('2026-11-18');
  const undo=undoScheduleRevision(next,scheduleRevisionUndo(state,next));expect(undo.flexibleWeek.sessions).toEqual(state.flexibleWeek.sessions);expect(undo.todayAdaptation).toEqual(state.todayAdaptation);
});

it('rejects stale per-change confirmations after a new move or completion',()=>{
  const state=shifted(),[a]=ids(state),proposal=proposeFlexibleWeek(state,revertRequest(a));
  const changed=apply(state,{mode:'move',sessionId:a,toDate:'2026-11-19'}),before=serializeState(changed);
  expect(applyFlexibleWeek(changed,proposal,{adaptationChoice:'keep'}).status).toBe('stale');expect(serializeState(changed)).toBe(before);
});
