import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {adaptedTemplateForToday,blankState,buildProgram,completeWorkout,deserializeState,plannedWorkoutForDate,serializeState,startWorkout} from './domain.js';
import {addCalendarDays,applyFlexibleWeek,createFlexibleWeekPlanner,flexibleSessions,proposeFlexibleWeek,temporaryScheduleReview} from './flexibleWeek.js';
import {applyTodayAdjustment,createManualTodayPreparation} from './adjustToday.js';
import {applyWorkoutToday,proposeWorkoutToday} from './useWorkoutToday.js';
import {scheduleRevisionUndo,undoScheduleRevision} from './scheduleTransactions.js';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
import {missedWeekShift} from './missedWeekShift.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(days=['Mon','Wed','Fri'],start='2026-11-16'){
  const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:days.length,availableDays:days,sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.rotationStartDate=start;state.program.trainingBlock.startDate=start;
  return deserializeState(state,{strict:true});
}
const source=state=>flexibleSessions(state).find(item=>item.status==='missed');
const propose=(state,request={})=>proposeFlexibleWeek(state,{mode:'recover-week',sessionId:source(state).logicalSessionId,...request});
const apply=(state,proposal)=>{const result=applyFlexibleWeek(state,proposal,{adaptationChoice:'keep'});expect(result.status).toBe('applied');return result.state;};
const nextWeek=state=>flexibleSessions(state).filter(item=>item.originalDate>='2026-11-23'&&item.originalDate<='2026-11-29').map(item=>[item.logicalSessionId,item.scheduledDate]);
function finish(state,date){
  vi.setSystemTime(new Date(`${date}T12:00:00`));state.selectedDate=date;
  state.activeWorkout=startWorkout(state,adaptedTemplateForToday(state));
  for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:set.weight??40});
  return deserializeState(serializeState(completeWorkout(state)),{strict:true});
}

it('shifts each workout by the same two days in one transaction',()=>{
  const state=fixture(),before=serializeState(state),future=nextWeek(state),proposal=propose(state);
  expect(proposal.status).toBe('ready');expect(proposal.changes.map(item=>[item.fromDate,item.toDate])).toEqual([
    ['2026-11-16','2026-11-18'],['2026-11-18','2026-11-20'],['2026-11-20','2026-11-22']]);
  expect(proposal.recoveryShift.dayOffset).toBe(2);expect(serializeState(state)).toBe(before);
  const next=deserializeState(serializeState(apply(state,proposal)),{strict:true});
  expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);expect(nextWeek(next)).toEqual(future);
  expect(temporaryScheduleReview(next).unresolved).toEqual([]);expect(next.selectedDate).toBe('2026-11-18');
  expect(plannedWorkoutForDate(next,'2026-11-18').logicalSessionId).toBe(source(state).logicalSessionId);
  const undone=undoScheduleRevision(next,scheduleRevisionUndo(state,next));expect(undone.flexibleWeek.sessions).toEqual({});expect(nextWeek(undone)).toEqual(future);
});

it('offers a choice of start days, with one calendar offset for the entire shift',()=>{
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  const state=fixture(),proposal=propose(state);
  expect(proposal.recoveryShift.startDateOptions).toEqual(['2026-11-17','2026-11-18']);
  expect(proposal.changes.map(item=>item.toDate)).toEqual(['2026-11-17','2026-11-19','2026-11-21']);
  expect(propose(state,{shiftStartDate:'2026-11-18'}).changes.map(item=>item.toDate)).toEqual(['2026-11-18','2026-11-20','2026-11-22']);
  for(const shiftStartDate of ['2026-11-16','2026-11-19','2026-11-23',null])expect(propose(state,{shiftStartDate}).status).toBe('conflict');
});

it('moves the whole shift one day later when Saturday is occupied',()=>{
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  const state=fixture(),missed=source(state);
  const saturday={logicalSessionId:'fixed-saturday',scheduledDate:'2026-11-21',status:'reserved'};
  const shift=missedWeekShift(state,missed,[...flexibleSessions(state),saturday],'2026-11-17');
  expect(shift.status).toBe('ready');
  expect(shift.details.startDateOptions).toEqual(['2026-11-18']);
  expect(shift.moves.map(item=>item.toDate)).toEqual(['2026-11-18','2026-11-20','2026-11-22']);
});

it('keeps later missed workouts in order at their original intervals',()=>{
  const state=fixture(['Mon','Tue','Thu']);
  const proposal=propose(state);expect(proposal.status).toBe('ready');
  expect(proposal.changes.map(item=>item.toDate)).toEqual(['2026-11-18','2026-11-19','2026-11-21']);
  const next=apply(state,proposal);expect(new Set(Object.values(next.flexibleWeek.sessions).map(item=>item.scheduledDate)).size).toBe(3);
});

it('continues through completion and reload without review and leaves next week on its original dates',()=>{
  let state=fixture();const future=nextWeek(state);state=apply(state,propose(state));
  for(const date of ['2026-11-18','2026-11-20','2026-11-22']){
    state=finish(state,date);expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  }
  expect(state.workouts).toHaveLength(3);expect(new Set(state.workouts.map(item=>item.logicalSessionId)).size).toBe(3);
  expect(nextWeek(state)).toEqual(future);expect(state.program.trainingBlock.currentWeek).toBe(2);
});

function alreadyRecovered(){
  let state=fixture();const id=source(state).logicalSessionId;
  state=applyWorkoutToday(state,proposeWorkoutToday(state,{sessionId:id,displacedToDate:'2026-11-19'}),{persist:()=>true});
  state=finish(state,'2026-11-18');return {state,id};
}
it('can shift the remaining workouts after the missed workout was already performed, preserving that history exactly',()=>{
  const {state,id}=alreadyRecovered(),history=structuredClone(state.workouts),record=structuredClone(state.flexibleWeek.sessions[id]),future=nextWeek(state);
  const proposal=proposeFlexibleWeek(state,{mode:'recover-week',sessionId:id});
  expect(proposal.status).toBe('ready');expect(proposal.recoveryShift.sourceCompleted).toBe(true);
  expect(proposal.changes.map(item=>[item.fromDate,item.toDate])).toEqual([['2026-11-19','2026-11-20'],['2026-11-20','2026-11-22']]);
  const next=apply(state,proposal);expect(next.workouts).toEqual(history);expect(next.flexibleWeek.sessions[id]).toEqual(record);
  expect(nextWeek(next)).toEqual(future);expect(temporaryScheduleReview(next).unresolved).toEqual([]);
  expect(proposeFlexibleWeek(next,{mode:'recover-week',sessionId:id}).status).toBe('conflict');
});

it('moves a carried-in one-off adjustment once even when the following occurrence uses the same workout template',()=>{
  vi.setSystemTime(new Date('2026-11-16T12:00:00'));let state=fixture(['Wed','Fri'],'2026-11-09');
  const old=flexibleSessions(state).find(item=>item.originalDate==='2026-11-11');
  state=apply(state,proposeFlexibleWeek(state,{mode:'move',sessionId:old.logicalSessionId,toDate:'2026-11-16'}));
  const draft=createManualTodayPreparation(state);draft.workout.exercises[0].sets[0].weight=43;
  state=applyTodayAdjustment(state,draft).state;vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  const next=apply(state,proposeFlexibleWeek(state,{mode:'recover-week',sessionId:old.logicalSessionId}));
  expect(next.todayAdaptation.date).toBe('2026-11-18');expect(next.todayAdaptation.workout.exercises[0].sets[0].weight).toBe(43);
  expect(plannedWorkoutForDate(next,'2026-11-18').logicalSessionId).toBe(old.logicalSessionId);
  expect(plannedWorkoutForDate(next,'2026-11-20').logicalSessionId).not.toBe(old.logicalSessionId);
});

it('does not advertise a shift that cannot finish this week or that has an active workout',()=>{
  const noRoom=fixture(['Mon','Wed','Sun']);vi.setSystemTime(new Date('2026-11-22T12:00:00'));expect(propose(noRoom).status).toBe('conflict');vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  const state=fixture();for(const key of ['activeWorkout','activeOptionalSession']){
    const busy={...state,[key]:{id:'active'}};expect(createFlexibleWeekPlanner(busy).check({mode:'recover-week',sessionId:source(state).logicalSessionId}).status).toBe('conflict');
  }
});

it('declines to compress the gaps when a shift would move the last workout past Sunday',()=>{
  const state=fixture(['Mon','Wed','Sun']),proposal=propose(state);
  expect(proposal.status).toBe('conflict');expect(proposal.error).toContain('keeping their spacing');
});

it('preserves both the consecutive pair and the longer gap in a mixed schedule',()=>{
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  const state=fixture(['Mon','Tue','Fri']),proposal=propose(state);
  expect(proposal.status).toBe('ready');
  expect(proposal.changes.map(item=>[item.fromDate,item.toDate])).toEqual([
    ['2026-11-16','2026-11-17'],['2026-11-17','2026-11-18'],['2026-11-20','2026-11-21']]);
  const next=apply(state,proposal);
  expect(plannedWorkoutForDate(next,'2026-11-21').id).toBe(state.program.days[2].id);
  expect(nextWeek(next)).toEqual(nextWeek(state));
});

it('corrects logical order after a recovery displaced a workout past another planned session',()=>{
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));let state=fixture(['Mon','Tue','Wed','Fri']),id=source(state).logicalSessionId;
  state=applyWorkoutToday(state,proposeWorkoutToday(state,{sessionId:id,displacedToDate:'2026-11-19'}),{persist:()=>true});
  state=finish(state,'2026-11-17');const history=structuredClone(state.workouts);
  const proposal=proposeFlexibleWeek(state,{mode:'recover-week',sessionId:id});expect(proposal.status).toBe('ready');
  expect(proposal.changes.map(item=>[item.originalDate,item.toDate])).toEqual([
    ['2026-11-17','2026-11-18'],['2026-11-18','2026-11-19'],['2026-11-20','2026-11-21']]);
  const next=apply(state,proposal);expect(next.workouts).toEqual(history);expect(proposeFlexibleWeek(next,{mode:'recover-week',sessionId:id}).status).toBe('conflict');
});

it('does not repack the rest of the week when the completed workout anchors a shift past Sunday',()=>{
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));let state=fixture(['Mon','Tue','Fri','Sun']),id=source(state).logicalSessionId;
  state=applyWorkoutToday(state,proposeWorkoutToday(state,{sessionId:id,displacedToDate:'2026-11-21'}),{persist:()=>true});
  state=finish(state,'2026-11-17');
  const before=serializeState(state),proposal=proposeFlexibleWeek(state,{mode:'recover-week',sessionId:id});
  expect(proposal.status).toBe('conflict');expect(proposal.error).toContain('keeping their spacing');expect(serializeState(state)).toBe(before);
});

it('rejects stale, changed-day and tampered previews without partial writes',()=>{
  const state=fixture(),proposal=propose(state),before=serializeState(state);
  expect(applyFlexibleWeek({...state,program:{...state.program,version:state.program.version+1}},proposal).status).toBe('stale');
  const changed=structuredClone(state);changed.profile.availableDays=['Mon','Wed','Fri','Sat'];
  expect(applyFlexibleWeek(changed,proposal).status).not.toBe('applied');
  const tampered=structuredClone(proposal);tampered.recoveryShift.firstDate='2026-11-23';expect(applyFlexibleWeek(state,tampered,{adaptationChoice:'keep'}).status).toBe('stale');
  vi.setSystemTime(new Date('2026-11-19T12:00:00'));expect(applyFlexibleWeek(state,proposal).status).toBe('stale');expect(serializeState(state)).toBe(before);
});

it('round-trips the shift through a real backup while keeping occurrence IDs and future dates',async()=>{
  const before=fixture(),state=apply(before,propose(before));
  const archive=await buildBackupArchive(state,[]),parsed=await parseBackupArchive(archive.bytes);
  expect(parsed.state.flexibleWeek.sessions).toEqual(state.flexibleWeek.sessions);
  expect(temporaryScheduleReview(parsed.state).unresolved).toEqual([]);expect(nextWeek(parsed.state)).toEqual(nextWeek(before));
});

for(const days of [['Mon','Thu'],['Mon','Wed','Fri'],['Mon','Tue','Thu','Sat'],['Mon','Tue','Wed','Thu','Fri'],['Mon','Tue','Wed','Thu','Fri','Sat'],['Mon','Wed','Sun']]){
  it.each([0,1,2,3,4,5,6])(`${days.length}-day ${days.join('/')} plan keeps every valid shift within its week from weekday %i`,offset=>{
    const today=addCalendarDays('2026-11-16',offset);vi.setSystemTime(new Date(`${today}T12:00:00`));
    const state=fixture(days),original=serializeState(state),future=nextWeek(state),planner=createFlexibleWeekPlanner(state);
    for(const missed of flexibleSessions(state).filter(item=>item.status==='missed'&&item.scheduledDate>='2026-11-16')){
      const request={mode:'recover-week',sessionId:missed.logicalSessionId},preview=proposeFlexibleWeek(state,request);
      expect(planner.check(request).status).toBe(preview.status);
      if(preview.status!=='ready')continue;
      expect(preview.changes.every(item=>item.toDate>=today&&item.toDate<='2026-11-22')).toBe(true);
      expect(preview.changes.every(item=>item.toDate===addCalendarDays(item.fromDate,preview.recoveryShift.dayOffset))).toBe(true);
      const next=deserializeState(serializeState(apply(state,preview)),{strict:true});
      expect(temporaryScheduleReview(next).unresolved).toEqual([]);expect(nextWeek(next)).toEqual(future);
      expect(next.workouts).toEqual(state.workouts);expect(next.program).toEqual(state.program);
      const pending=flexibleSessions(next).filter(item=>item.scheduledDate>=today&&item.scheduledDate<='2026-11-22'&&item.status!=='skipped');
      expect(new Set(pending.map(item=>item.scheduledDate)).size).toBe(pending.length);
      expect(serializeState(state)).toBe(original);
    }
  });
}

it('keeps a December-to-January shift in the same calendar week',()=>{
  vi.setSystemTime(new Date('2026-12-30T12:00:00'));const state=fixture(['Mon','Wed','Fri'],'2026-12-28');
  const proposal=propose(state);expect(proposal.status).toBe('ready');
  expect(proposal.changes.map(item=>item.toDate)).toEqual(['2026-12-30','2027-01-01','2027-01-03']);
  const next=apply(state,proposal);expect(plannedWorkoutForDate(next,'2027-01-04').id).toBe(state.program.days[0].id);
});
