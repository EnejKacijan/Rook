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
