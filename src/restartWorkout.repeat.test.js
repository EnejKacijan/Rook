import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {repeatedRestartFixture} from './restartWorkout.fixture.js';
import {restartActiveWorkout,activeWorkoutCanRestart,serializeState,deserializeState,workoutSetSummary,startWorkout,resumeCompletedWorkout,completeWorkout} from './domain.js';
import {cancelRepeatedWorkout} from './useWorkoutToday.js';
import {reorderUpNext,upNextMoveRequest} from './upNextReorder.js';
import {removeUpNext} from './upNextRemoval.js';
import {createReturningUserFixture} from './demoFixture.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
it('repeated history supplies starting numbers, never current exercise progress',()=>{
  const state=repeatedRestartFixture(),active=state.activeWorkout;
  for(const list of [state.todayAdaptation.workout.exercises,active.exercises,active.restartSnapshot.exercises])
    for(const entry of list){expect(entry.startedAt).toBeUndefined();expect(entry.completedAt).toBeUndefined();expect(entry.sets.every(s=>!s.completed&&!s.completedAt&&!s.touched)).toBe(true);}
  expect(active.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[165,11],[165,11],[100,11]]);
  expect(workoutSetSummary(active)).toMatchObject({completed:0,planned:14});
  expect(activeWorkoutCanRestart(active)).toBe(false);
});

it('repeated restart restores prepared instance order after reorder/remove/replace/add and keeps its history/source',()=>{
  let state=repeatedRestartFixture();const initial=structuredClone(state),baseline=initial.activeWorkout.restartSnapshot;
  state=reorderUpNext(state,upNextMoveRequest(state.activeWorkout,state.activeWorkout.exercises[4].id,-1));
  state=removeUpNext(state,state.activeWorkout.exercises[5].id).state;
  state.activeWorkout.exercises[0].exerciseId='hack-squat';
  state.activeWorkout.exercises.push({...structuredClone(state.activeWorkout.exercises[1]),id:'added-same-exercise'});
  state.activeWorkout.exercises[1].startedAt=Date.now();state.activeWorkout.exercises[2].startedAt=Date.now();
  Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:200,reps:7,rir:0,completed:true,touched:true,completedAt:Date.now()});
  state.activeWorkout.exerciseIndex=2;state.activeWorkout.rest={endsAt:Date.now()+90000};state.activeWorkout.handledSupersetRestRounds=['round-1'];
  const next=restartActiveWorkout(state);
  expect(next.activeWorkout.exercises).toEqual(baseline.exercises);expect(next.activeWorkout.exerciseIndex).toBe(0);
  expect(next.activeWorkout.rest).toBeNull();expect(next.activeWorkout.handledSupersetRestRounds).toEqual([]);
  expect(next.activeWorkout.removedUpNextExercises).toBeUndefined();expect(workoutSetSummary(next.activeWorkout).completed).toBe(0);
  expect(next.todayAdaptation).toEqual(initial.todayAdaptation);expect(next.workouts).toEqual(initial.workouts);expect(next.program).toEqual(initial.program);
  expect(state.activeWorkout.restartSnapshot).toEqual(baseline);
});

it('start and restart keep per-side/timed/segmented prescriptions but remove nested execution and carry-forward state',()=>{
  const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
  template.exercises=template.exercises.slice(0,3);
  const dirty={startedAt:1,completedAt:2,completed:true,skipped:true,parked:true,partialProgress:true,lastActiveAt:3,performedSetCount:2};
  for(const e of template.exercises){Object.assign(e,dirty);Object.assign(e.sets[0],{touched:true,completedAt:2,weightEntryMode:'manual',repsEntryMode:'auto',sideRepsEntryMode:{left:'manual'},weightSourceSetId:'old',repsSourceSetId:'old'});}
  template.exercises[0].loggingMode='per_side';template.exercises[0].sets[0].sides={left:{reps:12,completed:true},right:{reps:10,touched:true}};
  template.exercises[1].exerciseId='plank';template.exercises[1].repMin=45;template.exercises[1].repMax=60;template.exercises[1].sets[0].durationSeconds=45;
  Object.assign(template.exercises[2].sets[0],{setType:'drop',segments:[{id:'prepared-drop',kind:'drop',order:1,weight:12.5,reps:8,rir:1,completed:true,touched:true}]});
  const source=structuredClone(template);state.activeWorkout=startWorkout(state,template);expect(template).toEqual(source);
  const baseline=structuredClone(state.activeWorkout.restartSnapshot);
  for(const e of state.activeWorkout.exercises){expect(e.startedAt).toBeUndefined();expect(e.completedAt).toBeUndefined();expect(e.completed).toBe(false);expect(e.skipped).toBe(false);expect(e.parked).toBeUndefined();expect(e.performedSetCount).toBeUndefined();expect(e.sets[0].touched).toBeUndefined();expect(e.sets[0].weightSourceSetId).toBeUndefined();expect(e.sets[0].sideRepsEntryMode).toBeUndefined();}
  expect(baseline.exercises[0].sets[0].sides).toEqual({left:{reps:12},right:{reps:10}});
  expect(baseline.exercises[1].sets[0].durationSeconds).toBe(45);
  expect(baseline.exercises[2].sets[0].segments[0]).toMatchObject({id:'prepared-drop',weight:12.5,reps:8,rir:1,completed:false});
  for(const e of state.activeWorkout.exercises)Object.assign(e,dirty);
  state.activeWorkout.exercises[0].sets[0].sides.left.reps=99;state.activeWorkout.exercises[1].sets[0].durationSeconds=500;state.activeWorkout.exercises[2].sets[0].segments[0].completed=true;
  expect(restartActiveWorkout(state).activeWorkout.exercises).toEqual(baseline.exercises);
});

it('legacy warm-up execution is cleared in both stage-owned and top-level checklists',()=>{
  const state=repeatedRestartFixture(),active=state.activeWorkout;
  const dirty={completed:true,skipped:true,completedAt:1,touched:true};
  const warmup=active.restartSnapshot.warmup;
  expect(warmup.stages.length).toBeGreaterThan(0);
  for(const group of [warmup,...warmup.stages]){
    Object.assign(group,dirty);
    for(const item of [...group.general||[],...group.movementPreparation||[],...(group.rampUpSets||[]).flatMap(e=>e.sets)])Object.assign(item,dirty);
  }
  active.warmup=structuredClone(warmup);
  const next=restartActiveWorkout(state).activeWorkout;
  expect(next.warmup).not.toEqual(warmup);
  for(const group of [next.warmup,...next.warmup.stages]){
    expect(group.completed).toBe(false);expect(group.skipped).toBe(false);expect(group.completedAt).toBeUndefined();
    for(const item of [...group.general||[],...group.movementPreparation||[],...(group.rampUpSets||[]).flatMap(e=>e.sets)]){expect(item.completed).toBe(false);expect(item.completedAt).toBeUndefined();expect(item.touched).toBeUndefined();}
  }
  expect(activeWorkoutCanRestart(next)).toBe(false);
});

it('resuming an empty completion retains pending input until Restart, whose new baseline has no inherited execution',()=>{
  let state=repeatedRestartFixture();const entry=state.activeWorkout.exercises[1];entry.startedAt=Date.now();Object.assign(entry.sets[0],{weight:95,touched:true});
  state=completeWorkout(state);const ended=state.workouts.at(-1);
  state=resumeCompletedWorkout(state,ended.id);
  expect(state.activeWorkout.exercises[1].startedAt).toBeTruthy();expect(state.activeWorkout.exercises[1].sets[0].weight).toBe(95);
  const next=restartActiveWorkout(state);
  expect(next.activeWorkout.exercises[1].startedAt).toBeUndefined();expect(next.activeWorkout.exercises[1].sets[0]).toMatchObject({weight:95,completed:false});
  expect(next.activeWorkout.exercises[1].sets[0].touched).toBeUndefined();expect(next.workoutCorrections).toEqual(state.workoutCorrections);
});

it('remaining superset-rest bookkeeping alone makes a workout restartable',()=>{
  const state=repeatedRestartFixture();state.activeWorkout.handledSupersetRestRounds=['old-round'];
  expect(activeWorkoutCanRestart(state.activeWorkout)).toBe(true);expect(restartActiveWorkout(state).activeWorkout.handledSupersetRestRounds).toEqual([]);
});

it('repairs an already saved contaminated restart baseline even if the header already shows zero sets',()=>{
  const state=deserializeState(serializeState(repeatedRestartFixture({legacySnapshot:true})),{strict:true}),before=structuredClone(state);
  expect(workoutSetSummary(state.activeWorkout).completed).toBe(0);
  expect(activeWorkoutCanRestart(state.activeWorkout)).toBe(true);
  const next=restartActiveWorkout(state,Date.now()),active=next.activeWorkout;
  expect(state).toEqual(before);
  expect(active.exercises.every(e=>!e.startedAt&&!e.completedAt)).toBe(true);
  expect(active.restartSnapshot.exercises.every(e=>!e.startedAt&&!e.completedAt)).toBe(true);
  expect(active.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[165,11],[165,11],[100,11]]);
  for(const key of ['id','source','repeatedFromWorkoutId','logicalSessionId','sourcePlanSlotId','adjustment'])expect(active[key]).toEqual(before.activeWorkout[key]);
  expect(active.source).toBe('repeat');expect(next.workouts).toEqual(before.workouts);expect(next.program).toEqual(before.program);expect(next.todayAdaptation).toEqual(before.todayAdaptation);
  const reloaded=deserializeState(serializeState(next),{strict:true});
  expect(reloaded.activeWorkout.exercises).toEqual(active.exercises);expect(activeWorkoutCanRestart(reloaded.activeWorkout)).toBe(false);
  expect(restartActiveWorkout(next,Date.now()+5000)).toBe(next);
  const cancelled=cancelRepeatedWorkout(reloaded,{persist:()=>true});expect(cancelled.activeWorkout).toBeNull();expect(cancelled.todayAdaptation).toBeNull();expect(cancelled.workouts).toEqual(before.workouts);
});
