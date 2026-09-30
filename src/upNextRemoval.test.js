import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState,completeWorkout} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {canRemoveUpNext,hasMeaningfulExerciseProgress,removeUpNext,undoUpNextRemoval,canRemoveCurrentExercise,removeCurrentExercise,canUndoCurrentExerciseRemoval,undoCurrentExerciseRemoval} from './upNextRemoval.js';
const make=()=>{const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);return s;};
it.each([false,true])('removes only future work, preserving current values, timer, plan and persistence (RIR %s)',rir=>{
 const s=make();s.profile.rirEnabled=rir;const a=s.activeWorkout,id=a.exercises[1].id;
 a.rest={endsAt:Date.now()+60000,exerciseId:a.exercises[0].id};a.exercises[0].sets[0].completed=true;
 a.exercises[0].sets[1].weight=137.5;a.exercises[0].sets[1].touched=true;
 a.exercises[1].personalNote='Keep this exact note';a.exercises[1].sourceOccurrenceIds=['source-a'];
 const before=structuredClone(s),r=removeUpNext(s,id);
 expect(s).toEqual(before);expect(r.state.program).toEqual(s.program);expect(r.state.workouts).toEqual(s.workouts);
 expect(r.state.activeWorkout).toMatchObject({id:a.id,startedAt:a.startedAt,exerciseIndex:a.exerciseIndex,rest:a.rest});
 expect(r.state.activeWorkout.exercises[0]).toEqual(a.exercises[0]);
 const restored=undoUpNextRemoval(r.state,r.undo);expect(restored.activeWorkout.exercises).toEqual(a.exercises);
 const reloaded=deserializeState(serializeState(r.state));expect(reloaded.activeWorkout.exercises.some(e=>e.id===id)).toBe(false);expect(reloaded.activeWorkout.id).toBe(a.id);
});
it.each(['completed','completedAt','touched','side','segment','current','superset','warmup'])('rejects meaningful or locked work: %s',kind=>{
 const s=make(),a=s.activeWorkout,e=a.exercises[1];
 if(kind==='current')a.exerciseIndex=1;else if(kind==='superset')e.supersetId='pair';
 else if(kind==='side')e.sets[0].sides={left:{completed:true}};
 else if(kind==='segment')e.sets[0].segments=[{touched:true}];
 else if(kind==='warmup')a.warmup={stages:[{exerciseInstanceId:e.id,completed:true}]};
 else e.sets[0][kind]=true;
 expect(canRemoveUpNext(a,e.id)).toBe(false);expect(removeUpNext(s,e.id)).toEqual({state:s,undo:null});
});
it('does not treat a visited exercise as entered work, while preserving side and segment drafts',()=>{
 const s=make(),e=s.activeWorkout.exercises[1];e.startedAt=Date.now();
 expect(hasMeaningfulExerciseProgress(s.activeWorkout,e.id)).toBe(false);
 expect(canRemoveUpNext(s.activeWorkout,e.id)).toBe(true);
 e.sets[0].sides={left:{reps:5}};
 expect(hasMeaningfulExerciseProgress(s.activeWorkout,e.id)).toBe(true);
 delete e.sets[0].sides;e.sets[0].segments=[{weight:12.5,reps:null}];
 expect(hasMeaningfulExerciseProgress(s.activeWorkout,e.id)).toBe(true);
});
it('freestyle last Up Next removal keeps the active workout and exact undo, with no duplicate restore',()=>{
 let s=startFreestyleWorkout(createReturningUserFixture(0));s=addFreestyleExercise(s,'push-up');s=addFreestyleExercise(s,'pull-up');
 const before=structuredClone(s),r=removeUpNext(s,s.activeWorkout.exercises[1].id);
 expect(r.state.activeWorkout.exercises).toHaveLength(1);expect(r.state.activeWorkout.id).toBe(before.activeWorkout.id);
 const restored=undoUpNextRemoval(r.state,r.undo);expect(restored.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
 expect(undoUpNextRemoval(restored,r.undo)).toBe(restored);
});
it('invalidates undo after navigation/order changes but retains later current-set work',()=>{
 const s=make(),r=removeUpNext(s,s.activeWorkout.exercises[2].id);
 r.state.activeWorkout.exercises[0].sets[0].completed=true;
 expect(undoUpNextRemoval(r.state,r.undo).activeWorkout.exercises[0].sets[0].completed).toBe(true);
 r.state.activeWorkout.exerciseIndex=1;expect(undoUpNextRemoval(r.state,r.undo)).toBe(r.state);
});
it('preserves temporary and combined source linkage; removed work cannot falsely resolve both sources',()=>{
 const s=make(),a=s.activeWorkout;
 a.adjustment={schemaVersion:1,mode:'combine',id:'combined',sourceSessions:[{logicalSessionId:'one'},{logicalSessionId:'two'}],workout:{}};
 a.originalPlannedWorkout={name:'Original'};s.todayAdaptation=structuredClone(a.adjustment);
 const r=removeUpNext(s,a.exercises[1].id);
 expect(r.state.activeWorkout.adjustment).toEqual(a.adjustment);expect(r.state.todayAdaptation).toEqual(s.todayAdaptation);
 expect(r.state.activeWorkout.originalPlannedWorkout).toEqual(a.originalPlannedWorkout);
 r.state.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>set.completed=true));
 const completed=completeWorkout(r.state);expect(completed.workouts.at(-1).combinedSourcesResolved).toBe(false);
 expect(completed.workouts.at(-1).removedUpNextExercises[0].id).toBe(a.exercises[1].id);
});
it('removes the untouched current session exercise, selects the next, reloads, and undoes without changing the plan',()=>{
 const s=make(),before=structuredClone(s),id=s.activeWorkout.exercises[0].id,nextId=s.activeWorkout.exercises[1].id;
 const result=removeCurrentExercise(s,id);
 expect(s).toEqual(before);expect(result.state.program).toEqual(before.program);
 expect(result.state.activeWorkout.exercises[0].id).toBe(nextId);
 expect(result.state.activeWorkout.exerciseIndex).toBe(0);
 expect(result.state.activeWorkout.removedUpNextExercises.map(e=>e.id)).toContain(id);
 const reloaded=deserializeState(serializeState(result.state),{strict:true});
 expect(reloaded.activeWorkout.exercises[0].id).toBe(nextId);
 expect(canUndoCurrentExerciseRemoval(reloaded,result.undo)).toBe(true);
 const restored=undoCurrentExerciseRemoval(reloaded,result.undo);
 expect(restored.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
 expect(restored.activeWorkout.exercises[restored.activeWorkout.exerciseIndex].id).toBe(id);
 expect(restored.activeWorkout.removedUpNextExercises).toBeUndefined();
 expect(undoCurrentExerciseRemoval(restored,result.undo)).toBe(restored);
});
it.each(['touched','completed','side','segment','warmup','superset','last'])('protects current %s from session removal',kind=>{
 const s=make(),active=s.activeWorkout,current=active.exercises[0];
 if(kind==='side')current.sets[0].sides={left:{reps:7}};
 else if(kind==='segment')current.sets[0].segments=[{reps:4}];
 else if(kind==='warmup')active.warmup={stages:[{exerciseInstanceId:current.id,completed:true}]};
 else if(kind==='superset')current.supersetId='pair';
 else if(kind==='last')active.exercises=[current];
 else current.sets[0][kind]=true;
 expect(canRemoveCurrentExercise(active,current.id)).toBe(false);
 expect(removeCurrentExercise(s,current.id)).toEqual({state:s,undo:null});
});
it('invalidates current-removal Undo if the selected exercise or queue changes',()=>{
 const s=make(),removed=removeCurrentExercise(s,s.activeWorkout.exercises[0].id);
 removed.state.activeWorkout.exerciseIndex=1;
 expect(canUndoCurrentExerciseRemoval(removed.state,removed.undo)).toBe(false);
 expect(undoCurrentExerciseRemoval(removed.state,removed.undo)).toBe(removed.state);
});
