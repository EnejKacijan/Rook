import {expect, it} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout, refreshWorkoutWarmup, serializeState, deserializeState, workoutSetSummary} from './domain.js';
import {changeWarmup, warmupProgress} from './warmupSession.js';

export function fixture() {
  const state = createReturningUserFixture(0);
  Object.assign(state.profile, {recommendedWarmupsEnabled:true, rampUpSetsEnabled:true, showExerciseImages:false, restTimerEnabled:true, rirEnabled:true});
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  const active = state.activeWorkout;
  active.startedAt = Date.now() - 180000;
  Object.assign(active.exercises[0].sets[0], {weight:52.5, reps:12, rir:2, completed:true});
  active.rest = {startedAt:Date.now(), endsAt:Date.now()+600000, duration:600};
  return deserializeState(serializeState(state), {strict:true});
}
function change(state, action) {
  return changeWarmup(state, {sessionId:state.activeWorkout.id, stageId:state.activeWorkout.warmup.stages[0].id, ...action});
}
const status = state => warmupProgress(state.activeWorkout.warmup.stages[0]);
const roundtrip = state => deserializeState(serializeState(state), {strict:true});

it.each(['none','partial','all'])('%s: exit is truthful, persists, and cannot affect working data or timers', mode => {
  const before=fixture();let state=before;
  const steps=status(state).steps;
  for(const {key} of mode==='all'?steps:mode==='partial'?steps.slice(0,1):[]) state=change(state,{stepKey:key});
  expect(status(state).outcome).toBe('pending');
  const checks=status(state).steps.map(s=>s.item.completed);
  state=change(state,{exit:true});
  expect(status(state).outcome).toBe({none:'skipped',partial:'partial',all:'complete'}[mode]);
  expect(status(state).steps.map(s=>s.item.completed)).toEqual(checks);
  const {warmup,updatedAt,...afterActive}=state.activeWorkout;
  const {warmup:oldWarmup,updatedAt:oldUpdated,...beforeActive}=before.activeWorkout;
  expect(afterActive).toEqual(beforeActive);expect(state.program).toBe(before.program);
  expect(workoutSetSummary(state.activeWorkout)).toEqual(workoutSetSummary(before.activeWorkout));
  expect(roundtrip(state).activeWorkout.warmup).toEqual(warmup);
  expect(change(state,{exit:true})).toBe(state);
});
it('corrections and out-of-order taps preserve skips until all checked; final check needs explicit Continue',()=>{
  let state=fixture();const keys=status(state).steps.map(s=>s.key);
  state=change(state,{exit:true});
  state=change(state,{stepKey:keys.at(-1)});expect(status(state).outcome).toBe('partial');
  state=change(state,{stepKey:keys.at(-1)});expect(status(state).outcome).toBe('skipped');
  for(const stepKey of keys)state=change(state,{stepKey});
  expect(status(state)).toMatchObject({all:true,outcome:'pending',action:'Continue to workout'});
  state=change(state,{exit:true});expect(status(state).outcome).toBe('complete');
  state=change(state,{stepKey:keys[0]});expect(status(state).outcome).toBe('pending');
  expect(status(state).action).toBe('Skip remaining');
});
it('legacy false completion and zero applicable steps never imply success',()=>{
  const state=fixture(),stage=state.activeWorkout.warmup.stages[0];stage.completed=true;
  expect(status(state).outcome).toBe('pending');
  stage.general=[];stage.movementPreparation=[];stage.rampUpSets=[];
  expect(status(state)).toMatchObject({total:0,all:false,outcome:'pending'});
  expect(change(state,{exit:true})).toBe(state);
});
it('staged ramp progress survives JSON reload and refresh even when the old top-level copy was stale',()=>{
  const state=fixture(),stage=state.activeWorkout.warmup.stages[0];
  stage.rampUpSets[0].sets[0].completed=true;
  expect(state.activeWorkout.warmup.rampUpSets[0].sets[0].completed).toBe(false);
  const reloaded=roundtrip(state);refreshWorkoutWarmup(reloaded.activeWorkout,reloaded.profile,reloaded.program);
  expect(reloaded.activeWorkout.warmup.stages[0].rampUpSets[0].sets[0].completed).toBe(true);
});
it('qualified identity ignores stale sessions/stages and synchronizes separate history copies',()=>{
  const before=fixture(),key=status(before).steps.at(-1).key;
  expect(changeWarmup(before,{sessionId:'stale',stageId:before.activeWorkout.warmup.stages[0].id,stepKey:key})).toBe(before);
  expect(change(before,{stepKey:'missing'})).toBe(before);
  const state=change(before,{stepKey:key});
  expect(state.activeWorkout.warmup.rampUpSets[0].sets[0].completed).toBe(true);
  expect(before.activeWorkout.warmup.rampUpSets[0].sets[0].completed).toBe(false);
});
