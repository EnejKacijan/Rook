import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,copyFreestylePrevious,freestylePreviousSets} from './freestyleWorkout.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesMatch} from './previousValues.js';

function fixture(id='hack-squat'){
 let state=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),id);
 const exercise=state.activeWorkout.exercises[0];
 Object.assign(exercise.sets[0],{weight:55,reps:10,rir:3,weightEntryMode:'auto',weightSourceSetId:'before-weight',repsEntryMode:'auto',repsSourceSetId:'before-reps',weightProvenance:'carry-forward'});
 exercise.sets.push({...structuredClone(exercise.sets[0]),id:'untouched-next'});
 state.workouts=[{id:'history',completedAt:'2026-09-19T12:00:00Z',exercises:[{...structuredClone(exercise),sets:[{weight:90,reps:7,rir:1,completed:true}]}]}];
 state.activeWorkout.rest={endsAt:Date.now()+90000};
 return state;
}
const identity=state=>({sessionId:state.activeWorkout.id,exerciseId:state.activeWorkout.exercises[0].id,setId:state.activeWorkout.exercises[0].sets[0].id,ordinal:0});
const target=state=>state.activeWorkout.exercises[0].sets[0];
it('retains canonical single-set overwrite, cleared RIR and provenance semantics without copying completion',()=>{
 const state=fixture(),before=structuredClone(state),id=identity(state),result=preparePreviousValues(state,id);
 expect(result.state).toEqual(copyFreestylePrevious(state,id.exerciseId,id.setId,0));expect(state).toEqual(before);
 expect(target(result.state)).toMatchObject({weight:90,reps:7,rir:null,touched:true,completed:false,weightEntryMode:'manual',repsEntryMode:'manual',weightProvenance:'history'});
 expect(target(result.state)).not.toHaveProperty('weightSourceSetId');expect(target(result.state)).not.toHaveProperty('repsSourceSetId');expect(result.state.activeWorkout.exercises[0].sets[1]).toEqual(before.activeWorkout.exercises[0].sets[1]);expect(result.state.activeWorkout.rest).toEqual(state.activeWorkout.rest);
 expect(undoPreviousValues(result.state,result.record)).toEqual(before);
});
it('inverse changes only operation fields, preserving later unrelated rest, notes, other sets and exercises',()=>{
 const state=fixture(),{state:next,record}=preparePreviousValues(state,identity(state));next.activeWorkout.rest.endsAt+=5000;next.activeWorkout.note='New note';next.activeWorkout.exercises[0].sets[1].reps=30;
 expect(canUndoPreviousValues(next,record)).toBe(true);const undo=undoPreviousValues(next,record);expect(target(undo)).toEqual(target(state));expect(undo.activeWorkout.note).toBe('New note');expect(undo.activeWorkout.rest).toEqual(next.activeWorkout.rest);expect(undo.activeWorkout.exercises[0].sets[1].reps).toBe(30);
});
it.each(['weight','reps','rir','completed','sides'])('expires inverse after a later target edit to %s',field=>{
 const state=fixture(),{state:next,record}=preparePreviousValues(state,identity(state));target(next)[field]=field==='completed'?true:field==='sides'?{left:{reps:2}}:99;
 expect(canUndoPreviousValues(next,record)).toBe(false);expect(undoPreviousValues(next,record)).toBe(next);
});
it('rejects ended/replaced sessions and exercise navigation without reverting anything',()=>{
 const state=fixture(),{state:next,record}=preparePreviousValues(state,identity(state));expect(canUndoPreviousValues({...next,activeWorkout:null},record)).toBe(false);
 expect(canUndoPreviousValues({...next,activeWorkout:{...next.activeWorkout,id:'other'}},record)).toBe(false);next.activeWorkout.exerciseIndex=1;expect(undoPreviousValues(next,record)).toBe(next);
});
it('already-matching numbers are a true no-op even if provenance/touched differ',()=>{
 const state=fixture();Object.assign(target(state),{weight:90,reps:7,rir:null,touched:false});expect(previousValuesMatch(target(state),state.workouts[0].exercises[0].sets[0])).toBe(true);
 expect(preparePreviousValues(state,identity(state))).toEqual({state,record:null});target(state).rir=2;expect(previousValuesMatch(target(state),state.workouts[0].exercises[0].sets[0])).toBe(false);
});
it('history selection is latest stored matching exercise, ordinary completed sets only, by filtered ordinal',()=>{
 const state=fixture(),exercise=state.activeWorkout.exercises[0];const prior=state.workouts[0].exercises[0];prior.sets=[{weight:5,reps:5,completed:false},{weight:20,reps:8,completed:true,setType:'drop'},{weight:90,reps:7,completed:true},{weight:95,reps:6,completed:true}];
 expect(freestylePreviousSets(state,exercise)).toHaveLength(2);const copied=copyFreestylePrevious(state,exercise.id,exercise.sets[1].id,1);expect(copied.activeWorkout.exercises[0].sets[1].weight).toBe(95);expect(copied.activeWorkout.exercises[0].sets).toHaveLength(2);
 expect(copyFreestylePrevious(state,exercise.id,exercise.sets[1].id,2)).toBe(state);prior.loggingMode='per_side';expect(freestylePreviousSets(state,exercise)).toEqual([]);
});
it.each(['pull-up','assisted-pull-up','plank'])('%s preserves load/seconds representation and does not import separate distance/duration/mode metadata',id=>{
 const state=fixture(id),prior=state.workouts[0].exercises[0].sets[0];Object.assign(prior,{weight:id==='plank'?null:5,reps:id==='plank'?45:8,distance:1000,durationSeconds:60,bodyweightMode:'assisted'});
 Object.assign(target(state),{distance:200,durationSeconds:10,bodyweightMode:'added'});const result=preparePreviousValues(state,identity(state));expect(target(result.state)).toMatchObject({weight:prior.weight,reps:prior.reps,distance:200,durationSeconds:10,bodyweightMode:'added'});expect(undoPreviousValues(result.state,result.record)).toEqual(state);
});
it('per-side values are copied independently; historical side completion is never imported and Undo restores exact prior sides',()=>{
 const state=fixture(),exercise=state.activeWorkout.exercises[0],prior=state.workouts[0].exercises[0];exercise.loggingMode=prior.loggingMode='per_side';target(state).sides={left:{reps:3},right:{reps:null}};prior.sets[0].sides={left:{reps:7,weight:20,rir:2,completed:true,completedAt:123},right:{reps:9,completed:true}};
 const result=preparePreviousValues(state,identity(state));expect(target(result.state).sides).toEqual({left:{reps:7,weight:20,rir:2},right:{reps:9}});expect(target(result.state).completed).toBe(false);expect(undoPreviousValues(result.state,result.record)).toEqual(state);
});
