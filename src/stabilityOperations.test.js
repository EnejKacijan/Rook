import {describe,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {deserializeState,serializeState,buildProgram} from './domain.js';
import {persistProgramReplacement} from './planReplacement.js';
import {prepareCompletedWorkoutDeletion,deleteCompletedWorkout} from './deleteCompletedWorkout.js';
import {updatePerSideReps,carryPerSideSet,normalizeAdvancedLoggingState,historySetDescriptor} from './advancedLogging.js';
import {exercisePerformance} from './performanceInsights.js';
const fixture=()=>deserializeState(createReturningUserFixture(2));
describe('safe plan replacement',()=>{
  it('preserves history, photo references, corrections and profile; saves before publish',()=>{
    const state=fixture();state.workouts[0].photoId='photo';state.workoutCorrections=[{id:'correction'}];state.profile.avoid='No jumping';
    const original=structuredClone(state),program=buildProgram(state.profile),save=vi.fn(()=>true);
    const next=persistProgramReplacement(state,program,{source:'local'},save);
    expect(save).toHaveBeenCalledWith(next);expect(state).toEqual(original);
    expect(next.workouts).toEqual(original.workouts);expect(next.workoutCorrections).toEqual(original.workoutCorrections);expect(next.profile).toEqual(original.profile);
    expect(next.planVersions.slice(0,-1)).toEqual(original.planVersions);
    expect(deserializeState(serializeState(next)).program.id).toBe(program.id);
  });
  it('retains original state on storage failure',()=>{const state=fixture(),original=structuredClone(state);expect(()=>persistProgramReplacement(state,buildProgram(state.profile),{},()=>false)).toThrow(/couldn’t save/);expect(state).toEqual(original);});
  it.each(['activeWorkout','activeOptionalSession'])('blocks %s',key=>{const state=fixture();state[key]={id:'active'};const save=vi.fn();expect(()=>persistProgramReplacement(state,state.program,{},save)).toThrow(/active workout/);expect(save).not.toHaveBeenCalled();});
});
describe('per-side suggestions',()=>{
  const exercise=()=>({loggingMode:'per_side',sets:[{id:'a',rir:0,completed:true,sides:{left:{reps:10},right:{reps:8}}},{id:'b',completed:false},{id:'c',completed:false}]});
  it('carries asymmetry and explicit RIR zero without completion credit',()=>{const e=exercise();carryPerSideSet(e,0);expect(e.sets[1]).toMatchObject({sides:{left:{reps:10},right:{reps:8}},rir:0,reps:8,completed:false});expect(e.sets[2].sides).toBeUndefined();});
  it('preserves independently edited future sides including intentional empty values',()=>{const e=exercise();updatePerSideReps(e.sets[1],'right',null);carryPerSideSet(e,0);expect(e.sets[1].sides).toEqual({left:{reps:10},right:{reps:null}});});
  it('preserves edited future RIR and existing legacy sides',()=>{const e=exercise();Object.assign(e.sets[1],{rir:3,rirEntryMode:'manual',sides:{left:{reps:12},right:{reps:11}}});carryPerSideSet(e,0);expect(e.sets[1]).toMatchObject({rir:3,sides:{left:{reps:12},right:{reps:11}}});});
  it('survives normalization/reload and leaves factual history output asymmetric',()=>{const e=exercise();updatePerSideReps(e.sets[1],'right',7);const state=JSON.parse(JSON.stringify({activeWorkout:{exercises:[e]}}));normalizeAdvancedLoggingState(state);carryPerSideSet(state.activeWorkout.exercises[0],0);expect(state.activeWorkout.exercises[0].sets[1].sides.right.reps).toBe(7);expect(historySetDescriptor(e,e.sets[0])).toBe('L 10 · R 8');});
});
describe('completed session deletion',()=>{
  it('removes only the session, recomputes performance from remaining factual history, preserves plan',()=>{
    const state=fixture();state.workouts=[state.workouts[0]];const original=structuredClone(state),id=state.workouts[0].exercises[0].exerciseId;
    const next=prepareCompletedWorkoutDeletion(state,state.workouts[0].id);
    expect(next.workouts).toEqual([]);expect(next.program).toEqual(state.program);expect(next.planVersions).toEqual(state.planVersions);expect(state).toEqual(original);
    expect(exercisePerformance(next.workouts,id).setCount).toBe(0);
    expect(deserializeState(serializeState(next)).workouts).toEqual([]);
  });
  it('includes only attached photos in the recoverable delete transaction',async()=>{
    const state=fixture(),workout=state.workouts[0];workout.photoId='one';const photos=[{id:'one',workoutId:workout.id},{id:'other',workoutId:'other-workout'}],commit=vi.fn(async()=>{});
    const storage={getItem:()=>null};await deleteCompletedWorkout(state,workout.id,{readPhotos:async()=>photos,commit,storage});
    expect(commit.mock.calls[0][0].photos).toEqual([photos[1]]);expect(state.workouts).toHaveLength(8);
  });
  it('does not commit on photo read failure or stale state',async()=>{
    const state=fixture(),commit=vi.fn(),storage={getItem:()=>null};
    await expect(deleteCompletedWorkout(state,state.workouts[0].id,{readPhotos:async()=>{throw Error('read failed');},commit,storage})).rejects.toThrow('read failed');
    await expect(deleteCompletedWorkout(state,state.workouts[0].id,{readPhotos:async()=>[],commit,storage,isCurrent:()=>false})).rejects.toThrow('data changed');expect(commit).not.toHaveBeenCalled();
  });
  it('never overwrites a pending recovery journal',async()=>{const state=fixture(),commit=vi.fn();await expect(deleteCompletedWorkout(state,state.workouts[0].id,{commit,storage:{getItem:()=>'{pending}'}})).rejects.toMatchObject({code:'rollback-failed'});expect(commit).not.toHaveBeenCalled();});
});
