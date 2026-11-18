import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { blankState, buildProgram, completeWorkout, deserializeState, plannedWorkoutForDate, removeExerciseFromOccurrence, restoreOccurrenceOverride, serializeState, startWorkout } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, flexibleOccurrenceForDate, flexiblePlanFingerprint, flexibleSessions, proposeFlexibleWeek, remainingPlanWeekDates, temporaryScheduleReview } from './flexibleWeek.js';
import { normalizeTrainingBlocksState } from './trainingBlocks.js';
import {persistProgramReplacement} from './planReplacement.js';
import {addPlanVersion,planRestoreImpact,restorePlanVersion} from './planHistory.js';
import {applyScheduleRecovery,preserveMovesAfterPlanEdit,reviewScheduleRecovery} from './scheduleRecovery.js';
import {createFlexibleWeekPlanner,moveWorkoutDestinations} from './flexibleWeek.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T12:00:00')); });
afterEach(() => vi.useRealTimers());

function fixture(days=['Mon','Wed','Fri']) {
  const state = blankState();
  Object.assign(state.profile, { goal:'Build muscle', experience:'Intermediate', daysPerWeek:days.length,
    availableDays:days, sessionMinutes:60, equipment:['full gym'],
    environment:'Commercial gym', priorities:['Balanced'], onboardingComplete:true });
  state.program = buildProgram(state.profile);
  state.program.trainingBlock.startDate = '2026-11-16';
  state.program.rotationStartDate = '2026-11-16';
  return deserializeState(state);
}

function reschedule(state) {
  const proposal = proposeFlexibleWeek(state, { mode:'available', dateScope:'current-week',
    availableDates:['2026-11-17','2026-11-19','2026-11-21'] });
  expect(proposal.status).toBe('ready');
  const result = applyFlexibleWeek(state, proposal);
  expect(result.status).toBe('applied');
  return result.state;
}

it('keeps the remaining moved workouts available after completing the first and reloading', () => {
  let state = reschedule(fixture());
  for (const date of ['2026-11-17','2026-11-19','2026-11-21']) {
    vi.setSystemTime(new Date(`${date}T12:00:00`));
    state = deserializeState(serializeState(state), { strict:true });
    expect(temporaryScheduleReview(state).unresolved).toEqual([]);
    const template = plannedWorkoutForDate(state, date);
    expect(template).toBeTruthy();
    state.selectedDate = date;
    state.activeWorkout = startWorkout(state, template);
    state.activeWorkout.exercises.forEach(exercise => exercise.sets.forEach(set => {
      set.completed = true; set.weight = 40; set.reps = exercise.repMax || 8;
    }));
    state = normalizeTrainingBlocksState(completeWorkout(state));
    expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  }
  expect(state.workouts).toHaveLength(3);
});

it('keeps accepted dates playable after routine changes to another workout in the same plan', () => {
  const state = reschedule(fixture());
  state.program.days[0].exercises[0].sets[0].weight = 45;
  state.program.version++;
  expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  expect(plannedWorkoutForDate(state, '2026-11-19')).toBeTruthy();
});

it('retains dates saved by older versions before training blocks and program IDs were stored',()=>{
  const state=fixture();
  delete state.program.trainingBlock;
  const moved=reschedule(state);
  for(const record of Object.values(moved.flexibleWeek.sessions)){
    delete record.programId;
    record.blockId=null;
    record.blockWeekNumber=null;
  }
  const fingerprint=flexiblePlanFingerprint(moved);
  const loaded=deserializeState(serializeState(moved),{strict:true});
  expect(flexiblePlanFingerprint(loaded)).not.toBe(fingerprint);
  expect(temporaryScheduleReview(loaded).unresolved).toEqual([]);
  for(const record of Object.values(loaded.flexibleWeek.sessions)){
    expect(plannedWorkoutForDate(loaded,record.scheduledDate).logicalSessionId).toBe(record.id);
  }
});

it.each([
  ['plan version', state => { state.program.version++; }],
  ['workout name', state => { state.program.days[1].name='Updated workout name'; }],
  ['working weight', state => { state.program.days[1].exercises[0].sets[0].weight=50; }],
  ['rep target', state => { state.program.days[1].exercises[0].repMax++; }],
  ['set count', state => { state.program.days[1].exercises[0].sets.pop(); }],
  ['exercise note', state => { state.program.days[1].exercises[0].notes='Updated reminder'; }],
  ['duration estimate', state => { state.program.days[1].estimatedMinutes=999; }],
  ['block progress', state => { state.program.trainingBlock.currentWeek++; }],
])('retains moved dates across %s changes, completion, and reload', (label, mutate) => {
  let state=reschedule(fixture());
  const ids=Object.keys(state.flexibleWeek.sessions);
  mutate(state);
  state=deserializeState(serializeState(state),{strict:true});
  expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  state.selectedDate='2026-11-17';
  state.activeWorkout=startWorkout(state,plannedWorkoutForDate(state,'2026-11-17'));
  state.activeWorkout.exercises[0].sets[0].completed=true;
  state=deserializeState(serializeState(completeWorkout(state)),{strict:true});
  expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  expect(plannedWorkoutForDate(state,'2026-11-19').logicalSessionId).toBe(ids[1]);
  expect(plannedWorkoutForDate(state,'2026-11-21').logicalSessionId).toBe(ids[2]);
  expect(state.workouts[0].logicalSessionId).toBe(ids[0]);
});

const patterns=[['Mon','Thu'],['Mon','Wed','Fri'],['Mon','Tue','Thu','Sat'],
  ['Mon','Tue','Wed','Thu','Fri'],['Mon','Tue','Wed','Thu','Fri','Sat']];
for(const days of patterns) {
  it.each([0,1,2,3,4,5,6])(`${days.length}-day plan accepts every valid remaining-day combination starting on weekday %i`, offset => {
    const state=fixture(days),today=addCalendarDays('2026-11-16',offset);
    vi.setSystemTime(new Date(`${today}T12:00:00`));
    const dates=remainingPlanWeekDates(today),before=serializeState(state);
    for(let mask=0;mask<2**dates.length;mask++) {
      const availableDates=dates.filter((date,index)=>mask&(1<<index));
      const proposal=proposeFlexibleWeek(state,{mode:'available',dateScope:'current-week',availableDates});
      expect(serializeState(state)).toBe(before);
      if(proposal.status!=='ready') {
        expect(['insufficient-capacity','no-change']).toContain(proposal.status);
        expect(applyFlexibleWeek(state,proposal).status).not.toBe('applied');
        continue;
      }
      const applied=applyFlexibleWeek(state,proposal);
      expect(applied.status).toBe('applied');
      const reloaded=deserializeState(serializeState(applied.state),{strict:true});
      expect(temporaryScheduleReview(reloaded).unresolved).toEqual([]);
      for(const row of proposal.availabilitySchedule) {
        expect(availableDates).toContain(row.toDate);
        const workout=plannedWorkoutForDate(reloaded,row.toDate);
        expect(workout).toBeTruthy();
        expect(flexibleOccurrenceForDate(reloaded,row.toDate,workout.id).logicalSessionId).toBe(row.logicalSessionId);
      }
      const occurrences=flexibleSessions(reloaded).filter(item=>item.scheduledDate>=today && item.status!=='skipped');
      expect(new Set(occurrences.map(item=>item.logicalSessionId)).size).toBe(occurrences.length);
      expect(new Set(occurrences.map(item=>item.scheduledDate)).size).toBe(occurrences.length);
    }
  });
}

it.each([0,1,2,3,4,5,6])('can continue using every accepted individual move from weekday %i', offset => {
  const state=fixture(),today=addCalendarDays('2026-11-16',offset);
  vi.setSystemTime(new Date(`${today}T12:00:00`));
  const sources=flexibleSessions(state).filter(item=>item.originalDate>='2026-11-16'&&item.originalDate<='2026-11-22');
  for(const source of sources)for(let day=0;day<14;day++) {
    const date=addCalendarDays(today,day);
    const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:date});
    if(proposal.status!=='ready')continue;
    let next=applyFlexibleWeek(state,proposal).state;
    next.program.version++;
    next=deserializeState(serializeState(next),{strict:true});
    expect(temporaryScheduleReview(next).unresolved).toEqual([]);
    expect(plannedWorkoutForDate(next,date).logicalSessionId).toBe(source.logicalSessionId);
  }
});

function removeMovedWorkout(state){
  const record=Object.values(state.flexibleWeek.sessions)[0];
  const program={...state.program,source:'manual',userEdited:true,days:state.program.days.filter(day=>day.id!==record.workoutId)};
  const profile={...state.profile,daysPerWeek:program.days.length,availableDays:program.days.map(day=>day.weekday)};
  return {state:deserializeState(serializeState(persistProgramReplacement(state,program,{profile},()=>true)),{strict:true}),record};
}

it('requires a real decision after Edit Plan removes a moved workout, without blocking unrelated moves',()=>{
  const removed=removeMovedWorkout(reschedule(fixture())),state=removed.state;
  expect(temporaryScheduleReview(state).unresolved.map(item=>item.id)).toEqual([removed.record.id]);
  const other=flexibleSessions(state).find(item=>item.scheduledDate==='2026-11-19');
  const planner=createFlexibleWeekPlanner(state);
  expect(planner.moveCandidates().some(item=>item.logicalSessionId===other.logicalSessionId)).toBe(true);
  const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:other.logicalSessionId,toDate:'2026-11-20'});
  expect(proposal.status).toBe('ready');
  const next=applyFlexibleWeek(state,proposal).state;
  expect(plannedWorkoutForDate(next,'2026-11-20').logicalSessionId).toBe(other.logicalSessionId);
  expect(next.flexibleWeek.sessions[removed.record.id]).toEqual(state.flexibleWeek.sessions[removed.record.id]);
  expect(temporaryScheduleReview(next).unresolved.map(item=>item.id)).toEqual([removed.record.id]);
  const resolved=applyScheduleRecovery(next,reviewScheduleRecovery(next,removed.record.id),'remove');
  expect(temporaryScheduleReview(resolved).unresolved).toEqual([]);
  expect(plannedWorkoutForDate(resolved,'2026-11-20').logicalSessionId).toBe(other.logicalSessionId);
});

it('reserves both dates of a genuinely unresolved move instead of silently occupying them',()=>{
  const {state,record}=removeMovedWorkout(reschedule(fixture()));
  const other=flexibleSessions(state).find(item=>item.scheduledDate==='2026-11-19');
  for(const toDate of [record.originalDate,record.scheduledDate]){
    expect(proposeFlexibleWeek(state,{mode:'move',sessionId:other.logicalSessionId,toDate}).status).toBe('conflict');
    expect(moveWorkoutDestinations(state,other.logicalSessionId).find(item=>item.date===toDate).available).toBe(false);
  }
  expect(proposeFlexibleWeek(state,{mode:'move',sessionId:record.id,toDate:'2026-11-20'}).status).toBe('conflict');
});

it.each(['skip','swap'])('allows an unrelated %s while retaining a removed workout for a real decision',mode=>{
  const {state,record}=removeMovedWorkout(reschedule(fixture()));
  const remaining=flexibleSessions(state).filter(item=>['2026-11-19','2026-11-21'].includes(item.scheduledDate));
  const proposal=proposeFlexibleWeek(state,{mode,sessionId:remaining[0].logicalSessionId,otherSessionId:remaining[1].logicalSessionId});
  expect(proposal.status).toBe('ready');
  const next=applyFlexibleWeek(state,proposal).state;
  expect(temporaryScheduleReview(next).unresolved.map(item=>item.id)).toEqual([record.id]);
  expect(next.workouts).toEqual(state.workouts);
});

it('does not warn that accepted moves need review when restoring a compatible plan version',()=>{
  let state=fixture();
  addPlanVersion(state,{id:'same-plan'});
  state=reschedule(state);
  state.program.days[0].exercises[0].sets[0].weight=65;state.program.version++;
  const before=serializeState(state);
  expect(planRestoreImpact(state,'same-plan').flexibleWeekNeedsReview).toBe(0);
  expect(serializeState(state)).toBe(before);
  const restored=restorePlanVersion(state,'same-plan');
  expect(restored.reconciliation.flexibleWeekNeedsReview).toBe(0);
  expect(temporaryScheduleReview(restored.state).unresolved).toEqual([]);
  expect(plannedWorkoutForDate(restored.state,'2026-11-19')).toBeTruthy();
});

it('reports actual unresolved moves when restoring a plan whose workout was removed',()=>{
  let state=fixture();
  const removedId=state.program.days[0].id;
  const without=structuredClone(state);without.program.days=without.program.days.filter(day=>day.id!==removedId);
  addPlanVersion(without,{id:'without-workout'});state.planVersions=without.planVersions;
  state=reschedule(state);
  expect(planRestoreImpact(state,'without-workout').flexibleWeekNeedsReview).toBe(1);
  const restored=restorePlanVersion(state,'without-workout');
  expect(temporaryScheduleReview(restored.state).unresolved.map(item=>item.id)).toEqual([Object.values(state.flexibleWeek.sessions).find(item=>item.workoutId===removedId).id]);
});

it('keeps a real permanent weekday change reviewable instead of guessing a new occurrence identity',()=>{
  const state=reschedule(fixture()),after=structuredClone(state);
  after.program.days[0].weekday='Sun';after.program.version++;
  const next=preserveMovesAfterPlanEdit(state,after);
  expect(temporaryScheduleReview(next).unresolved.map(item=>item.id)).toEqual([Object.values(state.flexibleWeek.sessions)[0].id]);
  expect(plannedWorkoutForDate(next,'2026-11-19')).toBeTruthy();
});

it('respects removing the last exercise from a moved occurrence without review and preserves Undo',()=>{
  let state=reschedule(fixture());vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  const workout=plannedWorkoutForDate(state,'2026-11-17'),id=workout.logicalSessionId,history=structuredClone(state.workouts);
  for(const exercise of workout.exercises)removeExerciseFromOccurrence(state,{planDate:'2026-11-17',workoutId:workout.id,planEntryId:exercise.id});
  state=deserializeState(serializeState(state),{strict:true});
  expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  expect(flexibleSessions(state).find(item=>item.logicalSessionId===id).status).toBe('skipped');
  expect(plannedWorkoutForDate(state,'2026-11-17')).toBeNull();
  expect(plannedWorkoutForDate(state,'2026-11-19')).toBeTruthy();
  expect(state.workouts).toEqual(history);
  restoreOccurrenceOverride(state,{planDate:'2026-11-17',workoutId:workout.id,previousOverride:null});
  expect(temporaryScheduleReview(state).unresolved).toEqual([]);
  expect(plannedWorkoutForDate(state,'2026-11-17').logicalSessionId).toBe(id);
  expect(plannedWorkoutForDate(state,'2026-11-17').exercises).toHaveLength(workout.exercises.length);
});
