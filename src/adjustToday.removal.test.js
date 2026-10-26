import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {blankState,buildProgram,serializeState,deserializeState,adaptedTemplateForToday,startWorkout} from './domain.js';
import {createManualTodayPreparation,removeTodayAdjustmentExercise,restoreTodayAdjustmentExercise,editTodayAdjustmentTargets,applyTodayAdjustment} from './adjustToday.js';
import {validateSupersetExercises} from './supersets.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){
  const state=blankState();Object.assign(state.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',availableDays:['Sun','Tue','Thu'],daysPerWeek:3,sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced']});
  state.program=buildProgram(state.profile);state.selectedDate='2026-10-25';return deserializeState(state);
}
it('removes the exact draft entry and keeps targets, plan and history intact through apply/reload/start',()=>{
  const state=fixture(),before=serializeState(state),proposal=createManualTodayPreparation(state),[remove,keep]=proposal.workout.exercises;
  const target={sets:2,repMin:11,repMax:13,restSeconds:75,targetRir:3};
  const edited=editTodayAdjustmentTargets(proposal,keep.id,target,state),next=removeTodayAdjustmentExercise(edited,remove.id,state);
  expect(serializeState(state)).toBe(before);expect(proposal.workout.exercises.some(row=>row.id===remove.id)).toBe(true);
  expect(next.workout.exercises.some(row=>row.id===remove.id)).toBe(false);expect(next.workout.exercises.find(row=>row.id===keep.id)).toMatchObject({repMin:11,repMax:13,restSeconds:75,targetRir:3,sets:expect.any(Array)});
  expect(next.changes).toContainEqual(expect.objectContaining({kind:'manual',entryId:keep.id}));expect(next.changes).toContainEqual(expect.objectContaining({kind:'removed',entryId:remove.id,reason:'Removed for today.'}));
  expect(next.workout.estimatedMinutes).toBeLessThan(edited.workout.estimatedMinutes);
  const applied=applyTodayAdjustment(state,next);expect(applied.status).toBe('applied');
  const restored=deserializeState(serializeState(applied.state),{strict:true});expect(restored.program).toEqual(state.program);expect(restored.workouts).toEqual(state.workouts);
  const active=startWorkout(restored,adaptedTemplateForToday(restored));expect(active.exercises.some(row=>row.id===remove.id)).toBe(false);expect(active.exercises.find(row=>row.id===keep.id).sets).toHaveLength(2);
});
it('cleans orphan supersets, removed warmups and only the removed unresolved replacement',()=>{
  const state=fixture(),proposal=createManualTodayPreparation(state),[first,second,third]=proposal.workout.exercises;
  first.supersetId='pair';second.supersetId='pair';second.sets=structuredClone(first.sets).map((set,index)=>({...set,id:`paired-${index}`}));
  proposal.workout.warmupPlan={mode:'custom',rampUpSets:[{targetExerciseEntryId:first.id},{targetExerciseEntryId:third.id}]};
  proposal.unresolved=[{entryId:first.id},{entryId:third.id}];
  const next=removeTodayAdjustmentExercise(proposal,first.id,state);
  expect(validateSupersetExercises(next.workout.exercises)).toHaveLength(0);expect(next.workout.exercises.find(row=>row.id===second.id).supersetId).toBeUndefined();
  expect(next.workout.warmupPlan.rampUpSets).toEqual([{targetExerciseEntryId:third.id}]);expect(next.unresolved).toEqual([{entryId:third.id}]);expect(applyTodayAdjustment(state,next).status).toBe('invalid');
});
it('keeps at least one entry and safely ignores an absent entry or its late target commit',()=>{
  const state=fixture(),proposal=createManualTodayPreparation(state),entry=proposal.workout.exercises[0];
  expect(removeTodayAdjustmentExercise(proposal,'missing',state)).toBe(proposal);
  const removed=removeTodayAdjustmentExercise(proposal,entry.id,state);
  expect(editTodayAdjustmentTargets(removed,entry.id,{sets:1,repMin:5,repMax:8,restSeconds:60,targetRir:2},state)).toBe(removed);
  const one={...proposal,workout:{...proposal.workout,exercises:[entry]}};expect(removeTodayAdjustmentExercise(one,entry.id,state)).toBe(one);
});

it('Undo restores the removed instance and superset while preserving later edits elsewhere',()=>{
  const state=fixture(),proposal=createManualTodayPreparation(state),[first,second,third]=proposal.workout.exercises;
  first.supersetId='pair';second.supersetId='pair';second.sets=structuredClone(first.sets).map((set,index)=>({...set,id:`partner-${index}`}));
  proposal.unresolved=[{entryId:first.id}];proposal.workout.warmupPlan={mode:'custom',rampUpSets:[{targetExerciseEntryId:first.id}]};
  const removed=removeTodayAdjustmentExercise(proposal,first.id,state);
  const edited=editTodayAdjustmentTargets(removed,third.id,{sets:2,repMin:12,repMax:14,restSeconds:75,targetRir:3},state);
  const restored=restoreTodayAdjustmentExercise(edited,proposal,first.id,state);
  expect(restored.workout.exercises[0]).toEqual(first);expect(restored.workout.exercises[1].supersetId).toBe('pair');expect(validateSupersetExercises(restored.workout.exercises)).toHaveLength(0);
  expect(restored.workout.exercises.find(row=>row.id===third.id)).toMatchObject({repMin:12,repMax:14,restSeconds:75});expect(restored.unresolved).toEqual([{entryId:first.id}]);
  expect(restored.workout.warmupPlan.rampUpSets).toEqual([{targetExerciseEntryId:first.id}]);expect(restored.changes.some(change=>change.kind==='removed'&&change.entryId===first.id)).toBe(false);
  expect(restoreTodayAdjustmentExercise(restored,proposal,first.id,state)).toBe(restored);
});
