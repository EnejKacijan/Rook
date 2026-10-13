import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,copyFreestylePrevious,freestylePreviousSets} from './freestyleWorkout.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesMatch} from './previousValues.js';
import {previousWorkingSetValues} from './freestyleWorkout.js';

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

it('a prescribed exercise uses the same canonical reuse without altering targets, history or other sets',()=>{
 const s=fixture();s.activeWorkout.source='plan';delete s.activeWorkout.exercises[0].prescriptionSource;
 Object.assign(s.activeWorkout.exercises[0],{repMin:6,repMax:9,targetRir:2});const before=structuredClone(s);
 const result=preparePreviousValues(s,identity(s));expect(target(result.state)).toMatchObject({weight:90,reps:7,rir:null,completed:false});
 expect(result.state.workouts).toEqual(before.workouts);expect(result.state.activeWorkout.exercises[0]).toMatchObject({repMin:6,repMax:9,targetRir:2});
 expect(result.state.activeWorkout.exercises[0].sets[1]).toEqual(before.activeWorkout.exercises[0].sets[1]);
 expect(preparePreviousValues(result.state,identity(s))).toEqual({state:result.state,record:null});
});
it('reps-only history preserves a meaningful current load and its provenance',()=>{
 const s=fixture(),prior=s.workouts[0].exercises[0].sets[0];prior.weight=null;const before=structuredClone(target(s));
 const result=preparePreviousValues(s,identity(s));expect(target(result.state)).toMatchObject({weight:55,reps:7,weightEntryMode:before.weightEntryMode,weightSourceSetId:before.weightSourceSetId,weightProvenance:before.weightProvenance});
 expect(undoPreviousValues(result.state,result.record)).toEqual(s);
});
it('empty history fields do not invent reusable numbers or shift the subsequent set ordinal',()=>{
 const s=fixture(),e=s.activeWorkout.exercises[0],prior=s.workouts[0].exercises[0];prior.sets=[{completed:true,weight:null,reps:null},{completed:true,weight:80,reps:8}];
 expect(copyFreestylePrevious(s,e.id,e.sets[0].id,0)).toBe(s);
 expect(copyFreestylePrevious(s,e.id,e.sets[1].id,1).activeWorkout.exercises[0].sets[1]).toMatchObject({weight:80,reps:8});
 expect(copyFreestylePrevious(s,e.id,e.sets[1].id,2)).toBe(s);
});
it('bodyweight zero/null and added load retain their canonical meaning; an absent load stays partial',()=>{
 const s=fixture('pull-up'),prior=s.workouts[0].exercises[0].sets[0];prior.weight=0;
 expect(target(preparePreviousValues(s,identity(s)).state).weight).toBe(0);
 prior.weight=20;expect(target(preparePreviousValues(s,identity(s)).state).weight).toBe(20);
 prior.weight=null;expect(target(preparePreviousValues(s,identity(s)).state).weight).toBeNull();
 delete prior.weight;expect(target(preparePreviousValues(s,identity(s)).state).weight).toBe(55);
});
it('canonical ID/profile/logging guards reject stale actions even when replacement retains instance and set IDs',()=>{
 const s=fixture(),e=s.activeWorkout.exercises[0],id={...identity(s),catalogExerciseId:e.exerciseId,profileId:s.profile.id,loggingMode:'normal'};
 const {state:next,record}=preparePreviousValues(s,id);next.activeWorkout.exercises[0].exerciseId='leg-press';
 expect(preparePreviousValues(next,id)).toEqual({state:next,record:null});expect(undoPreviousValues(next,record)).toBe(next);
 expect(preparePreviousValues({...s,profile:{...s.profile,id:'different'}},id).record).toBeNull();
 e.loggingMode='per_side';expect(preparePreviousValues(s,id).record).toBeNull();
});
it('a partially completed side cannot be overwritten and no historical IDs/timestamps are imported',()=>{
 const s=fixture(),e=s.activeWorkout.exercises[0],prior=s.workouts[0].exercises[0];e.loggingMode=prior.loggingMode='per_side';
 prior.sets[0].sides={left:{reps:7,completed:true,completedAt:1,startedAt:2,id:'old-side',sessionId:'old-session'},right:{reps:9}};
 target(s).sides={left:{reps:5,completed:true},right:{reps:null}};expect(preparePreviousValues(s,identity(s)).record).toBeNull();
 target(s).sides.left.completed=false;const applied=preparePreviousValues(s,identity(s));
 expect(target(applied.state).sides).toEqual({left:{reps:7,completed:false},right:{reps:9}});
 expect(applied.state.workouts).toEqual(s.workouts);
});
it('unconfirmed imported load is not reused but supported reps can still be used',()=>{
 const s=fixture(),e=s.activeWorkout.exercises[0],prior=s.workouts[0].exercises[0].sets[0];prior.importSetType='normal';prior.rawImport={version:2,loadKind:'unknown'};
 expect(previousWorkingSetValues(e,prior)).toEqual({reps:7});expect(target(preparePreviousValues(s,identity(s)).state).weight).toBe(55);
});
