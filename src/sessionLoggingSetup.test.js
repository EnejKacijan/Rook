import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {loggingModeOf} from './advancedLogging.js';
import {changeSessionLoggingMode,supportsPerSideLogging} from './sessionLoggingSetup.js';

const make=()=>{
 const state=createReturningUserFixture(0);
 state.activeWorkout=startWorkout(state,state.program.days[0]);
 state.activeWorkout.exercises[0].unilateral=true;
 return state;
};
it('changes only the current exercise instance before work and survives reload',()=>{
 const state=make(),active=state.activeWorkout,exercise=active.exercises[0];
 expect(supportsPerSideLogging(exercise)).toBe(true);
 const side=changeSessionLoggingMode(state,active.id,exercise.id,'per_side');
 expect(side.error).toBeNull();expect(side.state.program).toEqual(state.program);
 expect(side.state.workouts).toEqual(state.workouts);
 expect(side.state.activeWorkout.exercises[0].id).toBe(exercise.id);
 expect(side.state.activeWorkout.exercises.slice(1)).toEqual(active.exercises.slice(1));
 expect(loggingModeOf(side.state.activeWorkout.exercises[0])).toBe('per_side');
 expect(side.state.activeWorkout.exercises[0].sets[0].sides).toMatchObject({left:{reps:null},right:{reps:null}});
 const loaded=deserializeState(serializeState(side.state));
 expect(loggingModeOf(loaded.activeWorkout.exercises[0])).toBe('per_side');
 const total=changeSessionLoggingMode(loaded,loaded.activeWorkout.id,exercise.id,'normal');
 expect(total.error).toBeNull();expect(loggingModeOf(total.state.activeWorkout.exercises[0])).toBe('normal');
 expect(total.state.activeWorkout.exercises[0].sets[0].sides).toBeUndefined();
});
it.each(['touched','completed','side'])('never reinterprets %s session data',kind=>{
 const state=make(),active=state.activeWorkout,exercise=active.exercises[0];
 exercise.loggingMode='per_side';
 if(kind==='touched'){exercise.sets[0].weight=40;exercise.sets[0].touched=true;}
 if(kind==='completed')exercise.sets[0].completed=true;
 if(kind==='side')exercise.sets[0].sides={left:{reps:8},right:{reps:null}};
 const before=structuredClone(state),result=changeSessionLoggingMode(state,active.id,exercise.id,'normal');
 expect(result.error).toMatch(/cannot change/i);expect(result.state).toBe(state);expect(state).toEqual(before);
});

it('explicit per-side capability remains available after Total reps and reload without classifying a bilateral exercise as unilateral',()=>{
 const state=make(),active=state.activeWorkout,e=active.exercises[0];delete e.unilateral;e.exerciseId='dumbbell-rear-delt-fly';e.loggingMode='per_side';
 const before=deserializeState(serializeState(state),{strict:true}),total=changeSessionLoggingMode(state,active.id,e.id,'normal');expect(total.error).toBeNull();
 const loaded=deserializeState(serializeState(total.state),{strict:true}),entry=loaded.activeWorkout.exercises[0];expect(supportsPerSideLogging(entry)).toBe(true);expect(entry.unilateral).toBeUndefined();
 const result=changeSessionLoggingMode(loaded,active.id,e.id,'per_side');expect(result.error).toBeNull();expect(result.state.activeWorkout.exercises[0].id).toBe(e.id);expect(result.state.activeWorkout.exercises[0].sets.map(s=>s.id)).toEqual(e.sets.map(s=>s.id));
 expect(result.state.program).toEqual(before.program);expect(result.state.workouts).toEqual(before.workouts);expect(result.state.activeWorkout.exercises.slice(1)).toEqual(before.activeWorkout.exercises.slice(1));
});
it('does not fabricate per-side eligibility for an ordinary bilateral exercise',()=>{
 const state=make(),e=state.activeWorkout.exercises[0];delete e.unilateral;e.exerciseId='dumbbell-rear-delt-fly';e.loggingMode='normal';expect(supportsPerSideLogging(e)).toBe(false);
 expect(changeSessionLoggingMode(state,state.activeWorkout.id,e.id,'per_side').error).toMatch(/not available/);
});
