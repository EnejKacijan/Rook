import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createReturningUserFixture } from './demoFixture.js';
import { createWorkoutDurationEstimator, estimatePersonalWorkoutMinutes, estimateWorkoutMinutes,
  adaptTodayProposal, applyCoachAction, adaptedTemplateForToday, serializeState, deserializeState, startWorkout } from './domain.js';
import { buildTodayAdjustment, editTodayAdjustmentTargets, applyTodayAdjustment, ADJUST_TODAY_MODES } from './adjustToday.js';
import { applyAdjustmentPrescription } from './adjustmentPrescription.js';
import { validateSupersetExercises } from './supersets.js';

beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00'));});
afterEach(() => vi.useRealTimers());
const fixture = () => createReturningUserFixture(0);
function history(state, count=3, factor=0.8) {
  const day=state.program.days[0], base=estimatePersonalWorkoutMinutes(state,day);
  state.workouts=Array.from({length:count},(_,index)=>({...structuredClone(day),id:`past-${index}`,programDayId:day.id,
    completedAt:new Date(Date.now()-(index+1)*7*86400000).toISOString(),status:'completed',durationSeconds:Math.round(base*factor*60),
    exercises:day.exercises.map(exercise=>({...structuredClone(exercise),sets:exercise.sets.map(set=>({...set,completed:true}))}))}));
  return base;
}
it('uses one cold-start model for generated and imported workouts, independent of stale labels',()=>{
  const state=fixture(),day=state.program.days[0];
  const expected=estimateWorkoutMinutes(day,state.profile,state.program);
  const imported={...day,durationPlanningVersion:undefined,estimatedMinutes:999};
  expect(estimatePersonalWorkoutMinutes(state,imported)).toBe(expected);
  expect(createWorkoutDurationEstimator(state,imported).sampleCount).toBe(0);
});
it('learns conservatively from one completion and gains confidence with repeat sessions',()=>{
  const state=fixture(),base=history(state,1),day=state.program.days[0];
  const one=estimatePersonalWorkoutMinutes(state,day);
  expect(one).toBeLessThan(base);expect(one).toBeGreaterThan(base*0.8);
  history(state,4);expect(createWorkoutDurationEstimator(state,day).sampleCount).toBe(4);
  expect(estimatePersonalWorkoutMinutes(state,day)).toBeLessThan(one);
});
it('ignores forgotten Finish, incomplete, missing-duration and unrelated completions',()=>{
  const state=fixture();history(state);const day=state.program.days[0],expected=estimatePersonalWorkoutMinutes(state,day);
  const base=state.workouts[0];
  state.workouts.push({...base,id:'forgot',durationSeconds:7*3600}, {...base,id:'partial',endedEarly:true},
    {...base,id:'missing',durationSeconds:null}, {...base,id:'unrelated',exercises:base.exercises.map((row,index)=>({...row,exerciseId:`different-${index}`}))});
  expect(estimatePersonalWorkoutMinutes(state,day)).toBe(expected);
  expect(createWorkoutDurationEstimator(state,day).sampleCount).toBe(3);
});
it('rejects a relative duration outlier even below the absolute time limit',()=>{
  const state=fixture();history(state,4);const day=state.program.days[0],expected=estimatePersonalWorkoutMinutes(state,day);
  state.workouts.push({...state.workouts[0],id:'outlier',durationSeconds:105*60});
  expect(createWorkoutDurationEstimator(state,day).sampleCount).toBe(4);
  expect(estimatePersonalWorkoutMinutes(state,day)).toBe(expected);
});
it('does not double count a superseded completion',()=>{
  const state=fixture();history(state,1);
  state.workouts.push({...state.workouts[0],id:'resumed',supersedesCompletionId:state.workouts[0].id});
  expect(createWorkoutDurationEstimator(state,state.program.days[0]).sampleCount).toBe(1);
});
it('55 to 45 style reductions preserve every exercise, main work and at least 75% of sets',()=>{
  const state=fixture(),day=state.program.days[0],minutes=estimatePersonalWorkoutMinutes(state,day);
  const action=adaptTodayProposal(state,Math.floor(minutes*0.82));
  expect(action.exerciseIds).toHaveLength(day.exercises.length);
  const total=day.exercises.reduce((sum,row)=>sum+row.sets.length,0);
  expect(action.setTargets.reduce((sum,row)=>sum+row.sets,0)).toBeGreaterThanOrEqual(Math.ceil(total*0.75));
  day.exercises.filter(row=>row.programmingRole==='main').forEach(row=>expect(action.setTargets.find(target=>target.exerciseId===row.exerciseId).sets).toBe(row.sets.length));
});
it('freezes calibration through fitting, Apply and storage reload',()=>{
  const state=fixture();history(state);const action=adaptTodayProposal(state,35);
  applyCoachAction(state,action);
  expect(estimatePersonalWorkoutMinutes(state,adaptedTemplateForToday(state))).toBe(action.estimatedMinutes);
  const restored=deserializeState(serializeState(state));
  expect(estimatePersonalWorkoutMinutes(restored,adaptedTemplateForToday(restored))).toBe(action.estimatedMinutes);
});
it('applies manually reviewed targets only to today and preserves the draft through reload',()=>{
  const state=fixture(),original=structuredClone(state.program),day=state.program.days[0];
  const action=adaptTodayProposal(state,40),row=day.exercises[0];
  action.prescriptionTargets=[{exerciseId:row.exerciseId,sets:4,repMin:7,repMax:11,restSeconds:0,targetRir:3}];
  applyCoachAction(state,action);
  const restored=deserializeState(serializeState(state)),workout=adaptedTemplateForToday(restored);
  const edited=workout.exercises.find(exercise=>exercise.exerciseId===row.exerciseId);
  expect(edited.sets).toHaveLength(4);expect(edited).toMatchObject({repMin:7,repMax:11,restSeconds:0,targetRir:3});
  expect(state.program).toEqual(original);
});
it('target editing preserves already logged set identity and result even beyond the requested count',()=>{
  const state=fixture(),row=structuredClone(state.program.days[0].exercises[0]);
  row.sets[2]={...row.sets[2],completed:true,reps:9,weight:77,completedAt:123};
  const logged=structuredClone(row.sets[2]);
  const edited=applyAdjustmentPrescription(row,{exerciseId:row.exerciseId,sets:1,repMin:6,repMax:8,restSeconds:60,targetRir:2});
  expect(edited.sets).toHaveLength(3);expect(edited.sets[2]).toEqual(logged);
});
it('supports target edits in Adjust Today and does not refit a manual increase',()=>{
  const state=fixture(),result=buildTodayAdjustment(state,{mode:ADJUST_TODAY_MODES.lessTime,minutes:40});
  const proposal=result.proposal,row=proposal.workout.exercises[0];
  const edited=editTodayAdjustmentTargets(proposal,row.id,{exerciseId:row.exerciseId,sets:5,repMin:8,repMax:12,restSeconds:150,targetRir:2},state);
  expect(edited.workout.exercises[0].sets).toHaveLength(5);
  expect(edited.workout.estimatedMinutes).toBeGreaterThan(proposal.workout.estimatedMinutes);
  const applied=applyTodayAdjustment(state,edited);expect(applied.status).toBe('applied');
  expect(validateSupersetExercises(applied.state.todayAdaptation.workout.exercises)).toEqual([]);
});
it('preserves unspecified and per-set rep prescriptions when only sets or rest change',()=>{
  const state=fixture(),row=structuredClone(state.program.days[0].exercises[0]);
  row.repMin=null;row.repMax=null;row.sets.forEach(set=>{set.reps=null;});
  const target={exerciseId:row.exerciseId,sets:4,repMin:null,repMax:null,restSeconds:60,targetRir:null};
  const unspecified=applyAdjustmentPrescription(row,target);
  expect(unspecified.repMin).toBeNull();expect(unspecified.sets.every(set=>set.reps==null)).toBe(true);
  row.repMin=6;row.repMax=10;row.sets.forEach((set,index)=>{set.reps=6+index;});
  const varied=applyAdjustmentPrescription(row,{...target,sets:3,repMin:6,repMax:10});
  expect(varied.sets.map(set=>set.reps)).toEqual([6,7,8]);
});
it('rejects applying an older draft after another program or today adjustment change',()=>{
  const state=fixture(),action=adaptTodayProposal(state,40);
  state.program.version=Number(state.program.version||1)+1;applyCoachAction(state,action);
  expect(state.todayAdaptation).toBeNull();
});
