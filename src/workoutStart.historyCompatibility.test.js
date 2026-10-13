import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import {freestylePreviousSets} from './freestyleWorkout.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(mode='normal'){
 const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
 template.exercises=[{...template.exercises[0],exerciseId:'one-arm-dumbbell-row',loggingMode:mode,repMin:9,repMax:9,sets:[{id:'prescription-set',weight:20,reps:9}]}];
 state.workouts=[{id:'prior-workout',completedAt:'2026-10-12T12:00:00Z',exercises:[{...structuredClone(template.exercises[0]),loggingMode:'per_side',sets:[{id:'prior-set',weight:30,reps:6,completed:true,sides:{left:{reps:8},right:{reps:6}}}]}]}];
 return {state,template};
}
it('does not silently prefill normal logging from an incompatible per-side history context',()=>{
 const {state,template}=fixture(),before=structuredClone(state);
 const active=startWorkout(state,template),exercise=active.exercises[0];
 expect(exercise.sets[0]).toMatchObject({weight:20,reps:9,completed:false,rir:null});
 expect(freestylePreviousSets({...state,activeWorkout:active},exercise)).toEqual([]);expect(state).toEqual(before);
});
it('preserves ordinary compatible startup prefill and its target/history identities',()=>{
 const {state,template}=fixture();state.workouts[0].exercises[0].loggingMode='normal';delete state.workouts[0].exercises[0].sets[0].sides;
 const before=structuredClone(state),active=startWorkout(state,template),exercise=active.exercises[0];
 expect(exercise.sets[0]).toMatchObject({weight:30,reps:6,weightProvenance:'history',completed:false,rir:null});
 expect(exercise).toMatchObject({repMin:9,repMax:9});expect(exercise.sets[0].id).not.toBe('prior-set');expect(state).toEqual(before);
});
it.each(['measure','loadRequirement'])('does not prefill a custom exercise whose %s context changed',field=>{
 const {state,template}=fixture();const current=template.exercises[0],prior=state.workouts[0].exercises[0];
 current.exerciseId=prior.exerciseId='custom-history-safety';current.loggingMode=prior.loggingMode='normal';
 current[field]=field==='measure'?'reps':'required';prior[field]=field==='measure'?'seconds':'none';
 const active=startWorkout(state,template);expect(active.exercises[0].sets[0]).toMatchObject({weight:20,reps:9,completed:false});
});
it('retains explicit bodyweight null and compatible added-load startup representation',()=>{
 const {state,template}=fixture();const current=template.exercises[0],prior=state.workouts[0].exercises[0];
 current.exerciseId=prior.exerciseId='pull-up';current.loggingMode=prior.loggingMode='normal';current.sets[0].weight=null;delete prior.sets[0].sides;
 prior.sets[0].weight=10;expect(startWorkout(state,template).exercises[0].sets[0].weight).toBe(10);
 prior.sets[0].weight=null;expect(startWorkout(state,template).exercises[0].sets[0]).toMatchObject({weight:null,reps:6});
});
