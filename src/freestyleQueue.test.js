import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {serializeState,deserializeState} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise,doFreestyleExerciseNow,undoFreestyleAddition} from './freestyleWorkout.js';
import {canRemoveUpNext,removeUpNext,undoUpNextRemoval} from './upNextRemoval.js';
import {reorderUpNext,upNextMoveRequest} from './upNextReorder.js';
const seed=()=>['barbell-bench-press','dumbbell-bench-press','plank','barbell-row'].reduce((s,id)=>addFreestyleExercise(s,id),startFreestyleWorkout(createReturningUserFixture(0)));
it('Do now parks partially logged work next, preserving values, identity, rest, clock and other order',()=>{
 const state=seed(),a=state.activeWorkout,[first,second,third,fourth]=a.exercises;
 first.sets.push({...first.sets[0],id:'pending',weight:72.5,reps:9,touched:true});first.sets[0].completed=true;first.notes='keep';a.rest={seconds:90,endsAt:Date.now()+50000,exerciseInstanceId:first.id};
 const result=doFreestyleExerciseNow(state,{sessionId:a.id,instanceId:third.id,requestId:'now'}),next=result.activeWorkout;
 expect(next.exercises.map(e=>e.id)).toEqual([third.id,first.id,second.id,fourth.id]);expect(next.exerciseIndex).toBe(0);expect(next.id).toBe(a.id);expect(next.startedAt).toBe(a.startedAt);expect(next.rest).toEqual(a.rest);expect(next.exercises[1].sets).toEqual(first.sets);expect(next.exercises[1].notes).toBe('keep');expect(canRemoveUpNext(next,first.id)).toBe(false);
 expect(doFreestyleExerciseNow(result,{sessionId:a.id,instanceId:third.id,requestId:'now'})).toBe(result);
 const restored=deserializeState(serializeState(result),{strict:true});expect(restored.activeWorkout.exercises.map(e=>e.id)).toEqual(next.exercises.map(e=>e.id));expect(restored.activeWorkout.rest).toEqual(next.rest);
});
it('explicit repetition survives reload; ambiguous selection and stale actions never select an arbitrary instance',()=>{
 const state=seed(),id=state.activeWorkout.id,next=addFreestyleExercise(state,'plank',{allowDuplicate:true,requestId:'repeat',sessionId:id});
 expect(addFreestyleExercise(next,'plank',{allowDuplicate:true,requestId:'repeat',sessionId:id})).toBe(next);
 expect(deserializeState(serializeState(next),{strict:true}).activeWorkout.exercises.filter(e=>e.exerciseId==='plank')).toHaveLength(2);
 expect(()=>doFreestyleExerciseNow(next,{sessionId:id,exerciseId:'plank'})).toThrow('Choose');expect(doFreestyleExerciseNow({...next,activeWorkout:null},{sessionId:id,exerciseId:'plank'}).activeWorkout).toBeNull();
});
it('exact addition Undo preserves later data and refuses to remove work; first-add Undo has a valid empty index',()=>{
 const empty=startFreestyleWorkout(createReturningUserFixture(0)),state=addFreestyleExercise(empty,'plank',{requestId:'one'}),entry=state.activeWorkout.exercises[0],record={sessionId:state.activeWorkout.id,requestId:'one',ids:[entry.id]};
 expect(undoFreestyleAddition(state,record).activeWorkout).toMatchObject({exercises:[],exerciseIndex:0});
 const later=addFreestyleExercise(state,'barbell-row');later.activeWorkout.exercises[1].sets[0].reps=14;
 expect(undoFreestyleAddition(later,record).activeWorkout.exercises[0].sets[0].reps).toBe(14);
 entry.sets[0].touched=true;expect(undoFreestyleAddition(state,record)).toBe(state);
});
it('reorder, Remove, Undo and append retain session identity and never mutate the plan',()=>{
 const state=seed(),plan=deserializeState(serializeState(state),{strict:true}).program,a=state.activeWorkout,request=upNextMoveRequest(a,a.exercises[2].id,-1);
 let next=reorderUpNext(state,request);const removed=removeUpNext(next,a.exercises[1].id);next=undoUpNextRemoval(removed.state,removed.undo);next=addFreestyleExercise(next,'plank',{allowDuplicate:true,requestId:'second-plank'});
 const loaded=deserializeState(serializeState(next),{strict:true});expect(loaded.activeWorkout.id).toBe(a.id);expect(loaded.activeWorkout.exercises.map(e=>e.id)).toEqual(next.activeWorkout.exercises.map(e=>e.id));expect(loaded.program).toEqual(plan);
});
