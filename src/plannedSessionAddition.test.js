import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,completeWorkout,serializeState,deserializeState,restartActiveWorkout,workoutSetSummary,previousExercise,progressionFor,exerciseMeasure,exerciseLoadRequirement,workingSetCanComplete,isSessionAddedExercise} from './domain.js';
import {addWorkoutExercise,doWorkoutExerciseNow,canUndoWorkoutAddition,undoWorkoutAddition,freestyleCatalog} from './freestyleWorkout.js';
import {canRemoveUpNext,removeUpNext,undoUpNextRemoval} from './upNextRemoval.js';
import {templateDraft,saveWorkoutTemplate,useSavedWorkout} from './savedWorkouts.js';
import {createCustomExercise} from './customExercises.js';
import {preparePreviousValues,undoPreviousValues} from './previousValues.js';
import {exercisePerformance} from './performanceInsights.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const extraId='lateral-raise';
function fixture(index=0){
 const state=createReturningUserFixture(0);state.profile.showExerciseImages=false;
 state.program.days[0].exercises=state.program.days[0].exercises.slice(0,3);
 state.activeWorkout=startWorkout(state,state.program.days[0]);state.activeWorkout.exerciseIndex=index;
 state.activeWorkout.exercises[0].sets[0]={...state.activeWorkout.exercises[0].sets[0],weight:42.5,reps:9,rir:2,completed:true};
 state.activeWorkout.rest={endsAt:Date.now()+45000,seconds:90,exerciseInstanceId:state.activeWorkout.exercises[0].id};
 return state;
}
const append=(state,id=extraId,options={})=>addWorkoutExercise(state,id,{requestId:'add-one',sessionId:state.activeWorkout.id,...options});
const reload=state=>deserializeState(serializeState(state),{strict:true});
function expectOwnership(before,after){
 expect(after.program).toEqual(before.program);expect(after.flexibleWeek).toEqual(before.flexibleWeek);expect(after.todayAdaptation).toEqual(before.todayAdaptation);
 const {exercises,updatedAt,queueCommandIds,...session}=after.activeWorkout;
 const {exercises:old,updatedAt:oldTime,queueCommandIds:oldCommands,...original}=before.activeWorkout;
 expect(session).toEqual(original);
}
it.each([0,1,2])('appends one independent session instance at index %s, including the original final exercise',index=>{
 const state=fixture(index),before=structuredClone(state),next=append(state),entry=next.activeWorkout.exercises.at(-1);
 expect(next.activeWorkout.exercises.slice(0,3)).toEqual(before.activeWorkout.exercises);
 expect(next.activeWorkout.exercises.map(e=>e.id)).toEqual([...before.activeWorkout.exercises.map(e=>e.id),entry.id]);
 expect(entry.id).not.toBe(entry.exerciseId);expect(before.program.days.flatMap(d=>d.exercises).some(e=>e.id===entry.id)).toBe(false);
 expect(entry).toMatchObject({exerciseId:extraId,prescriptionSource:'freestyle',repMin:null,repMax:null,targetRir:null,queueAdditionId:'add-one'});
 expect(entry.sets).toHaveLength(1);expect(entry.sets[0]).toMatchObject({weight:null,reps:null,rir:null,completed:false});
 expectOwnership(before,next);expect(state).toEqual(before);
 if(index===2)expect(next.activeWorkout.exercises[index+1]).toBe(entry);
});
it('set totals follow the live queue and exact removal/Undo; logged work remains protected',()=>{
 const state=fixture(),before=workoutSetSummary(state.activeWorkout),next=append(state),entry=next.activeWorkout.exercises.at(-1);
 expect(workoutSetSummary(next.activeWorkout)).toMatchObject({total:before.total+1,completed:before.completed});
 entry.sets.push({...entry.sets[0],id:'extra-set',planned:false,added:true});
 expect(workoutSetSummary(next.activeWorkout)).toMatchObject({total:before.total+2,completed:before.completed,extras:before.extras+1});
 expect(canRemoveUpNext(next.activeWorkout,entry.id)).toBe(true);const removal=removeUpNext(next,entry.id);
 expect(workoutSetSummary(removal.state.activeWorkout)).toEqual(before);
 expect(undoUpNextRemoval(removal.state,removal.undo).activeWorkout.exercises).toEqual(next.activeWorkout.exercises);
 entry.sets[0].touched=true;expect(canRemoveUpNext(next.activeWorkout,entry.id)).toBe(false);
 expect(canRemoveUpNext(next.activeWorkout,next.activeWorkout.exercises[0].id)).toBe(false);
});
it('Do now parks the unfinished current exercise without losing its sets, rest or identity',()=>{
 const state=fixture(1),before=structuredClone(state),[a,b,c]=state.activeWorkout.exercises;
 b.sets[0].reps=13;b.sets[0].touched=true;before.activeWorkout.exercises[1]=structuredClone(b);
 const next=doWorkoutExerciseNow(state,{sessionId:state.activeWorkout.id,requestId:'now',exerciseId:extraId}),[first,added,parked,last]=next.activeWorkout.exercises;
 expect(first).toEqual(a);expect(added.exerciseId).toBe(extraId);expect(parked.id).toBe(b.id);expect(parked.sets).toEqual(b.sets);expect(last).toEqual(c);
 expect(next.activeWorkout.exerciseIndex).toBe(1);expect(next.activeWorkout.rest).toEqual(before.activeWorkout.rest);expect(next.activeWorkout.id).toBe(before.activeWorkout.id);expect(next.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
 expect(next.program).toEqual(before.program);expect(next.activeWorkout.restartSnapshot).toEqual(before.activeWorkout.restartSnapshot);
 expect(doWorkoutExerciseNow(next,{sessionId:state.activeWorkout.id,requestId:'now',exerciseId:extraId})).toBe(next);
});
it('explicit duplicates survive recovery even after Do now moves one before its prescribed counterpart',()=>{
 const state=fixture(),catalogId=state.activeWorkout.exercises[0].exerciseId;
 expect(append(state,catalogId)).toBe(state);
 let next=append(state,catalogId,{allowDuplicate:true}),added=next.activeWorkout.exercises.at(-1);
 next=doWorkoutExerciseNow(next,{sessionId:next.activeWorkout.id,instanceId:added.id,requestId:'now'});
 const loaded=reload(next);expect(loaded.activeWorkout.exercises.filter(e=>e.exerciseId===catalogId)).toHaveLength(2);
 expect(loaded.activeWorkout.exercises.map(e=>e.id)).toEqual(next.activeWorkout.exercises.map(e=>e.id));
 expect(loaded.activeWorkout.exercises.find(e=>e.id===state.activeWorkout.exercises[0].id).sets).toEqual(state.activeWorkout.exercises[0].sets);
 expect(()=>doWorkoutExerciseNow(loaded,{sessionId:loaded.activeWorkout.id,exerciseId:catalogId})).toThrow('Choose');
 expect(loaded.program).toEqual(reload(state).program);
});
it('Saved workouts append an atomic, confirmed, idempotent batch of unique instances',()=>{
 let state=fixture(1);const draft=templateDraft(state.activeWorkout,state);draft.name='Saved strength';draft.exercises=draft.exercises.slice(0,2);
 state=saveWorkoutTemplate(state,draft,{id:'saved-strength'});const before=structuredClone(state);
 const args={templateId:'saved-strength',revision:1,sessionId:state.activeWorkout.id,requestId:'saved-add'};
 expect(()=>useSavedWorkout(state,args)).toThrow('Confirm');let next=useSavedWorkout(state,{...args,confirmDuplicates:true});
 expect(next.activeWorkout.exercises.slice(0,3)).toEqual(before.activeWorkout.exercises);
 expect(next.activeWorkout.exercises.slice(3).map(e=>e.exerciseId)).toEqual(draft.exercises.map(e=>e.exerciseId));
 expect(new Set(next.activeWorkout.exercises.map(e=>e.id)).size).toBe(5);
 expect(next.activeWorkout.exercises.slice(3).every(e=>e.prescriptionSource==='saved-template')).toBe(true);
 expect(useSavedWorkout(next,{...args,confirmDuplicates:true})).toBe(next);expectOwnership(before,next);
 const loaded=reload(next);expect(loaded.activeWorkout.exercises.map(e=>e.id)).toEqual(next.activeWorkout.exercises.map(e=>e.id));expect(loaded.savedWorkoutTemplates).toEqual(next.savedWorkoutTemplates);
 const record={sessionId:next.activeWorkout.id,requestId:args.requestId,ids:next.activeWorkout.exercises.slice(3).map(e=>e.id)};
 expect(undoWorkoutAddition(next,record).activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
 expect(()=>useSavedWorkout(next,{...args,requestId:'stale',sessionId:'other'})).toThrow('ended');
});
it('addition Undo removes only the exact unworked instance and preserves later workout data',()=>{
 const state=append(fixture()),entry=state.activeWorkout.exercises.at(-1),record={sessionId:state.activeWorkout.id,requestId:'add-one',ids:[entry.id]};
 const later=append(state,'plank',{requestId:'later'});later.activeWorkout.exercises[1].sets[0].reps=17;
 expect(canUndoWorkoutAddition(later,record)).toBe(true);const undone=undoWorkoutAddition(later,record);
 expect(undone.activeWorkout.exercises.at(-1).exerciseId).toBe('plank');expect(undone.activeWorkout.exercises[1].sets[0].reps).toBe(17);
 entry.sets[0].touched=true;expect(canUndoWorkoutAddition(state,record)).toBe(false);expect(undoWorkoutAddition(state,record)).toBe(state);
 expect(undoWorkoutAddition({...state,activeWorkout:{...state.activeWorkout,id:'other-session'}},record).activeWorkout.exercises).toEqual(state.activeWorkout.exercises);
});
it('restart restores only the prepared original prescription after additions, reorder and recovery',()=>{
 const state=fixture(1),baseline=structuredClone(state.activeWorkout.restartSnapshot),next=append(state);
 const moved=doWorkoutExerciseNow(next,{sessionId:next.activeWorkout.id,instanceId:next.activeWorkout.exercises.at(-1).id,requestId:'now'});
 const restarted=restartActiveWorkout(reload(moved),Date.now()+60000);
 expect(restarted.activeWorkout.exercises).toEqual(baseline.exercises);expect(restarted.activeWorkout.exerciseIndex).toBe(0);expect(restarted.activeWorkout.rest).toBeNull();
 expect(restarted.activeWorkout.id).toBe(state.activeWorkout.id);expect(restarted.program).toEqual(reload(state).program);
});
it('finished additions share one factual history record, history/PR loads and normal future guidance',()=>{
 const state=append(fixture(),'barbell-bench-press',{allowDuplicate:true}),added=state.activeWorkout.exercises.at(-1),before=structuredClone(state.program);
 Object.assign(added.sets[0],{completed:true,weight:85,reps:8,rir:2});
 const done=completeWorkout(state),record=done.workouts.at(-1);
 expect(done.workouts).toHaveLength(state.workouts.length+1);expect(done.activeWorkout).toBeNull();expect(done.program.days).toEqual(before.days);
 expect(record.exercises.map(e=>e.id)).toEqual(state.activeWorkout.exercises.map(e=>e.id));expect(record.exercises.at(-1).sets).toEqual(added.sets);
 expect(isSessionAddedExercise(record.exercises.at(-1))).toBe(true);expect(record.programDayId).toBe(state.activeWorkout.programDayId);expect(record.sourcePlanSlotId).toBe(state.activeWorkout.sourcePlanSlotId);
 expect(exercisePerformance(done.workouts,added.exerciseId)).toMatchObject({bestWeight:85});
 // Use a catalog exercise absent from the original prescription for unambiguous history lookup.
 const second=append(fixture()),e=second.activeWorkout.exercises.at(-1);Object.assign(e.sets[0],{completed:true,weight:15,reps:12});const completed=completeWorkout(second);
 expect(previousExercise(completed.workouts,e.exerciseId).sets[0].weight).toBe(15);expect(progressionFor(e,completed.workouts,completed.profile)).toBeNull();
 const template={...completed.program.days[0],exercises:[{...e,repMin:8,repMax:12,prescriptionSource:undefined}]};
 expect(startWorkout(completed,template).exercises[0].sets[0].weight).toBe(15);
 expect(reload(done).workouts.at(-1).exercises.at(-1).sets[0]).toMatchObject({weight:85,reps:8,rir:2,completed:true});
});
it.each(['weighted','bodyweight','timed','per-side'])('retains the existing blank targets, logger and reload contract for %s',kind=>{
 let state=fixture(),id=kind==='weighted'?'barbell-bench-press':kind==='bodyweight'?'push-up':'plank';
 if(kind==='per-side')id=createCustomExercise(state,{name:'Owner single-arm press',equipment:['dumbbells'],primaryMuscle:'chest',pattern:'horizontal-push',loggingType:'weight_reps',loggingMode:'per_side'}).exercise.id;
 const next=append(state,id,{allowDuplicate:true}),entry=next.activeWorkout.exercises.at(-1),set=entry.sets[0];
 expect(set.reps).toBeNull();expect(set.weight).toBeNull();expect(set.rir).toBeNull();expect(workingSetCanComplete(entry,set)).toBe(false);
 if(kind==='per-side')expect(set.sides).toEqual({left:{reps:null},right:{reps:null}});
 if(kind==='timed')expect(exerciseMeasure(entry)).toBe('seconds');if(kind==='bodyweight')expect(exerciseLoadRequirement(entry)).toBe('optional');
 expect(reload(next).activeWorkout.exercises.at(-1)).toMatchObject({id:entry.id,exerciseId:id,sets:[{reps:null,weight:null}]});
});
it('session-added previous-value copy/Undo retains independent sides and cannot edit the plan',()=>{
 let state=append(fixture());const entry=state.activeWorkout.exercises.at(-1);entry.loggingMode='per_side';entry.sets[0].sides={left:{reps:null},right:{reps:null}};
 state.activeWorkout.exerciseIndex=3;state.workouts.push({id:'prior',completedAt:'2026-09-20T12:00:00Z',exercises:[{...structuredClone(entry),sets:[{weight:15,reps:8,completed:true,sides:{left:{reps:8},right:{reps:10}}}]}]});
 const before=structuredClone(state),identity={sessionId:state.activeWorkout.id,exerciseId:entry.id,setId:entry.sets[0].id,ordinal:0};
 const copied=preparePreviousValues(state,identity);expect(copied.record).not.toBeNull();expect(copied.state.activeWorkout.exercises[3].sets[0]).toMatchObject({weight:15,sides:{left:{reps:8},right:{reps:10}},completed:false});
 expect(undoPreviousValues(copied.state,copied.record)).toEqual(before);expect(copied.state.program).toEqual(before.program);
});
it('rechecks current equipment/restrictions at append and Saved use; rejects stale sessions',()=>{
 let state=fixture();state=saveWorkoutTemplate(state,templateDraft(state.activeWorkout,state),{id:'restricted-saved'});
 const savedArgs={templateId:'restricted-saved',revision:1,sessionId:state.activeWorkout.id,requestId:'restricted',confirmDuplicates:true};
 state.profile.equipment=['bodyweight'];state.profile.environment='Home';
 expect(freestyleCatalog(state).some(e=>e.id==='barbell-bench-press')).toBe(false);expect(()=>append(state,'barbell-bench-press',{allowDuplicate:true})).toThrow('equipment');
 expect(()=>useSavedWorkout(state,savedArgs)).toThrow('equipment');
 state.profile.avoid='My knee hurts';expect(freestyleCatalog(state)).toEqual([]);expect(()=>append(state,'plank')).toThrow('restrictions');
 expect(()=>useSavedWorkout(state,savedArgs)).toThrow();
 expect(addWorkoutExercise(fixture(),extraId,{sessionId:'gone'}).activeWorkout.exercises).toHaveLength(3);
 expect(addWorkoutExercise({...state,activeWorkout:null},extraId)).toEqual({...state,activeWorkout:null});
});
