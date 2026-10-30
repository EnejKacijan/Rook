import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {blankState,buildProgram,firstScheduledDate,serializeState,deserializeState,currentWeekSchedule,plannedWorkoutForDate,startWorkout,completeWorkout} from './domain.js';
import {firstPlanWeekWorkouts,flexibleOccurrenceForDate,flexibleOccurrencesForDate,flexibleSessionById,flexibleSessions,missedFlexibleSessions,moveWorkoutCandidates,proposeFlexibleWeek,applyFlexibleWeek,temporaryScheduleReview,swapWorkoutCandidates} from './flexibleWeek.js';
import {proposeWorkoutToday,applyWorkoutToday} from './useWorkoutToday.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){
  const state=blankState();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.rotationStartDate=firstScheduledDate(state.program);
  state.selectedDate='2026-10-25';return deserializeState(state);
}
const friday=state=>firstPlanWeekWorkouts(state).find(item=>item.originalDate==='2026-10-23');
const move=(state,item=friday(state),toDate='2026-10-25')=>proposeFlexibleWeek(state,{mode:'move',sessionId:item.logicalSessionId,toDate});

it('offers earlier weekdays in a Sunday-created plan without manufacturing missed sessions',()=>{
  const state=fixture();expect(state.program.trainingBlock.startDate).toBe('2026-10-25');expect(state.program.rotationStartDate).toBe('2026-10-26');
  expect(currentWeekSchedule(state)).toHaveLength(0);expect(missedFlexibleSessions(state)).toHaveLength(0);
  const choices=firstPlanWeekWorkouts(state);
  expect(choices.map(item=>item.originalDate)).toEqual(['2026-10-19','2026-10-21','2026-10-23']);
  expect(choices.every(item=>item.status==='planned'&&item.firstPlanWeek)).toBe(true);
  expect(flexibleSessions(state).some(item=>item.originalDate<'2026-10-25')).toBe(false);
  expect(moveWorkoutCandidates(state).filter(item=>item.firstPlanWeek)).toEqual(choices);
});
it('schedules the exact selected prescription on Sunday and survives strict reload',()=>{
  const state=fixture(),item=friday(state),before=serializeState(state),proposal=move(state,item);
  expect(proposal.status).toBe('ready');expect(proposal.changes).toHaveLength(1);expect(proposal.changes[0].blockWeekNumber).toBe(1);
  const result=applyFlexibleWeek(state,proposal);expect(result.status).toBe('applied');expect(serializeState(state)).toBe(before);
  const next=deserializeState(serializeState(result.state),{strict:true}),workout=plannedWorkoutForDate(next,'2026-10-25');
  expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
  expect(workout.logicalSessionId).toBe(item.logicalSessionId);expect(workout.originalScheduledDate).toBe('2026-10-23');
  expect(workout.exercises).toEqual(item.workout.exercises);expect(workout.trainingBlock.blockWeekNumber).toBe(1);
  expect(currentWeekSchedule(next).map(row=>row.scheduledDate)).toEqual(['2026-10-25']);
  expect(firstPlanWeekWorkouts(next).map(row=>row.originalDate)).toEqual(['2026-10-19','2026-10-21']);
  expect(missedFlexibleSessions(next)).toHaveLength(0);expect(temporaryScheduleReview(next).unresolved).toHaveLength(0);
});
it('an accepted opening-week workout remains swappable despite an original date before installation',()=>{
  const state=fixture(),source=friday(state),scheduled=applyFlexibleWeek(state,move(state,source)).state;
  const upcoming=flexibleSessions(scheduled).find(item=>item.scheduledDate==='2026-10-26');
  expect(swapWorkoutCandidates(scheduled,upcoming.logicalSessionId).map(item=>item.logicalSessionId)).toContain(source.logicalSessionId);
  const proposal=proposeFlexibleWeek(scheduled,{mode:'swap',sessionId:upcoming.logicalSessionId,otherSessionId:source.logicalSessionId});expect(proposal.status,proposal.error).toBe('ready');
  const next=deserializeState(serializeState(applyFlexibleWeek(scheduled,proposal).state),{strict:true});
  expect(flexibleSessionById(next,source.logicalSessionId)).toMatchObject({originalDate:'2026-10-23',scheduledDate:'2026-10-26'});
  expect(flexibleSessionById(next,upcoming.logicalSessionId).scheduledDate).toBe('2026-10-25');expect(next.program).toEqual(scheduled.program);expect(next.workouts).toEqual(scheduled.workouts);
});
it('retains occurrence identity, week-one credit, and logged sets when starting and finishing',()=>{
  const state=fixture(),item=friday(state);let next=applyFlexibleWeek(state,move(state,item)).state;
  const template=plannedWorkoutForDate(next,'2026-10-25');next.activeWorkout=startWorkout(next,template);
  expect(next.activeWorkout.trainingBlock.blockWorkoutId).toBe(item.workout.trainingBlock.blockWorkoutId);
  expect(next.activeWorkout.canonicalPlanDate).toBe('2026-10-25');
  next.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,weight:20,reps:8})));
  next=deserializeState(serializeState(next),{strict:true});
  const sets=next.activeWorkout.exercises.flatMap(exercise=>exercise.sets);expect(sets.every(set=>set.completed)).toBe(true);
  next=completeWorkout(next);expect(next.workouts).toHaveLength(1);
  expect(next.workouts[0].logicalSessionId).toBe(item.logicalSessionId);expect(next.workouts[0].originalScheduledDate).toBe('2026-10-23');
  expect(next.workouts[0].trainingBlock.blockWeekNumber).toBe(1);
  expect(move(next,item,'2026-10-29').status).toBe('conflict');expect(missedFlexibleSessions(next)).toHaveLength(0);
});
it('supports the calendar Use this workout today path with one durable save',()=>{
  const state=fixture(),item=friday(state),persist=vi.fn(()=>true),proposal=proposeWorkoutToday(state,{sessionId:item.logicalSessionId});
  expect(proposal.status).toBe('ready');const next=applyWorkoutToday(state,proposal,{persist});
  expect(persist).toHaveBeenCalledOnce();expect(plannedWorkoutForDate(next,'2026-10-25').logicalSessionId).toBe(item.logicalSessionId);
  expect(next.program).toEqual(state.program);
});
it('can move a chosen first-week workout again and recover its real missed destination',()=>{
  const state=fixture(),item=friday(state);let next=applyFlexibleWeek(state,move(state,item,'2026-10-27')).state;
  expect(move(next,item,'2026-10-29').status).toBe('ready');
  vi.setSystemTime(new Date('2026-10-29T12:00:00'));
  expect(firstPlanWeekWorkouts(next)).toHaveLength(0);
  expect(missedFlexibleSessions(next).some(row=>row.logicalSessionId===item.logicalSessionId)).toBe(true);
  const recovered=applyFlexibleWeek(next,move(next,item,'2026-10-29'));
  expect(recovered.status).toBe('applied');expect(plannedWorkoutForDate(recovered.state,'2026-10-29').logicalSessionId).toBe(item.logicalSessionId);
});
it('rejects skipping an unscheduled choice, past destinations, collisions, and stale proposals',()=>{
  const state=fixture(),item=friday(state);
  expect(proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId}).status).toBe('conflict');
  expect(move(state,item,'2026-10-24').status).toBe('conflict');expect(move(state,item,'2026-10-26').status).toBe('conflict');
  const proposal=move(state,item);state.program.days[2].name='Edited workout';expect(applyFlexibleWeek(state,proposal).status).toBe('stale');
});
it('protects active and completed source identities',()=>{
  for(const status of ['active','completed']){
    const state=fixture(),item=friday(state),active=startWorkout(state,{...item.workout,canonicalPlanDate:item.originalDate});
    if(status==='active')state.activeWorkout=active;else state.workouts=[{...active,completedAt:new Date().toISOString(),logicalSessionId:item.logicalSessionId,completed:true}];
    expect(firstPlanWeekWorkouts(state).some(row=>row.logicalSessionId===item.logicalSessionId)).toBe(false);
    expect(move(state,item).status).toBe('conflict');
  }
});
it('never revives choices from an old week, advanced/completed blocks, or future starts',()=>{
  const state=fixture(),item=friday(state);
  for(const patch of [{currentWeek:2},{completed:true},{startDate:'2026-10-26'},{startDate:'2026-10-18'}]){
    const changed=structuredClone(state);Object.assign(changed.program.trainingBlock,patch);expect(firstPlanWeekWorkouts(changed)).toHaveLength(0);
  }
  expect(flexibleSessionById(state,`${item.workoutId}:2026-10-16`)).toBeNull();
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));expect(firstPlanWeekWorkouts(state)).toHaveLength(0);expect(flexibleSessionById(state,item.logicalSessionId)).toBeNull();
});

it('keeps opening-week choices out of the calendar until scheduled, including legacy weekday mappings',()=>{
 for(const legacy of [false,true]){
  const state=fixture();if(legacy)state.program.rotationStartDate=null;
  const before=serializeState(state),cache={weeks:new Map(),materialized:null};
  for(const choice of firstPlanWeekWorkouts(state)){
   expect(flexibleOccurrenceForDate(state,choice.originalDate)).toBeNull();
   expect(flexibleOccurrencesForDate(state,choice.originalDate,cache)).toEqual([]);
   expect(flexibleSessionById(state,choice.logicalSessionId)).toMatchObject({logicalSessionId:choice.logicalSessionId,status:'planned',firstPlanWeek:true});
  }
  expect(missedFlexibleSessions(state)).toHaveLength(0);expect(serializeState(state)).toBe(before);
 }
});
