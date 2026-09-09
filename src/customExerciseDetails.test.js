import { expect, it, vi } from 'vitest';
import { createCustomExercise, rememberExerciseAlias, resolveRememberedExercise, saveCustomExerciseDetails } from './customExercises.js';
function fixture(){const state={customExercises:[],exerciseAliases:[],workouts:[{id:'history',exercises:[]}],program:{days:[]}};const exercise=createCustomExercise(state,{name:'Gym Press',equipment:['machines'],primaryMuscle:'chest'}).exercise;const alias=rememberExerciseAlias(state,'Old gym name',exercise.id).alias;return {state,exercise,alias};}
it('stages details and alias add/remove without mutating the source; cancellation needs no rollback',()=>{
 const {state,exercise,alias}=fixture(),before=structuredClone(state);
 const result=saveCustomExerciseDetails(state,exercise.id,{name:'New Gym Press'},{added:['New gym name'],removed:[alias.id]});
 expect(state).toEqual(before);expect(result.status).toBe('saved');expect(resolveRememberedExercise(state,'New gym name')).toBeNull();
});
it('one save commits details, removals and normalized import aliases together',()=>{
 const {state,exercise,alias}=fixture(),persist=vi.fn(()=>true);
 const result=saveCustomExerciseDetails(state,exercise.id,{name:'New Gym Press',notes:'Seat 4'},{added:['New   gym name'],removed:[alias.id],persist});
 expect(persist).toHaveBeenCalledExactlyOnceWith(result.state);expect(result.exercise.name).toBe('New Gym Press');expect(result.exercise.notes).toBe('Seat 4');
 expect(resolveRememberedExercise(result.state,' NEW gym NAME ')).toMatchObject({exerciseId:exercise.id});expect(resolveRememberedExercise(result.state,'Old gym name')).toBeNull();expect(result.state.workouts).toEqual(state.workouts);
});
for(const persist of [()=>false,()=>{throw Error('quota');}])it('failed save retains the complete original state and permits retry',()=>{
 const {state,exercise,alias}=fixture(),before=structuredClone(state),options={added:['New gym name'],removed:[alias.id]};
 expect(saveCustomExerciseDetails(state,exercise.id,{name:'New Gym Press'},{...options,persist})).toEqual({status:'persistence-failed',state});expect(state).toEqual(before);
 expect(saveCustomExerciseDetails(state,exercise.id,{name:'New Gym Press'},{...options,persist:()=>true}).status).toBe('saved');
});
it('revalidates alias conflicts without committing details or removals',()=>{
 const {state,exercise,alias}=fixture();const other=createCustomExercise(state,{name:'Other Press',equipment:['machines'],primaryMuscle:'chest'}).exercise;rememberExerciseAlias(state,'Taken',other.id);
 const before=structuredClone(state),persist=vi.fn();const result=saveCustomExerciseDetails(state,exercise.id,{name:'New Gym Press'},{added:['Taken'],removed:[alias.id],persist});
 expect(result.status).toBe('conflict');expect(persist).not.toHaveBeenCalled();expect(state).toEqual(before);
});
