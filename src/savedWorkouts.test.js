import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkout,serializeState,deserializeState,startWorkout} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate,useSavedWorkout,deleteWorkoutTemplate,templateUseIssues} from './savedWorkouts.js';
import {createCustomExerciseRecord,customExerciseSnapshot} from './customExercises.js';
const seed=()=>['barbell-bench-press','plank'].reduce((s,id)=>addFreestyleExercise(s,id),startFreestyleWorkout(createReturningUserFixture(0)));
function saved(){const state=seed();return saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'My workout'},{id:'template-one'});}
it('saves full intended structure before finish filters unperformed freestyle exercises; never turns actuals into targets',()=>{
 const state=seed(),a=state.activeWorkout;a.exercises[0].sets[0]={...a.exercises[0].sets[0],completed:true,weight:92.5,reps:12,rir:1,completedAt:Date.now()};a.exercises[0].notes='session-only';
 const completed=completeWorkout(state);expect(completed.workouts.at(-1).exercises).toHaveLength(1);
 const draft=templateDraft(completed.workouts.at(-1),completed);expect(draft.exercises).toHaveLength(2);expect(draft.exercises[0].sets[0]).toMatchObject({weight:null,reps:null,rir:null});
 expect(JSON.stringify(draft)).not.toMatch(/completed|startedAt|durationSeconds|session-only|92.5/);
 const next=saveWorkoutTemplate(completed,{...draft,name:'Upper'},{id:'template'});expect(next.workouts).toEqual(completed.workouts);expect(next.activeWorkout).toBeNull();
});
it('captures prescribed per-set targets before history carry forward, not the subsequently performed values',()=>{
 const state=createReturningUserFixture(0),workout=structuredClone(state.program.days[0]);workout.exercises[0].sets[0].weight=60;workout.exercises[0].sets[0].reps=7;
 state.activeWorkout=startWorkout(state,workout);state.activeWorkout.exercises[0].sets[0].weight=105;state.activeWorkout.exercises[0].sets[0].reps=22;
 const draft=templateDraft(state.activeWorkout,state);expect(draft.exercises[0].sets[0]).toMatchObject({weight:60,reps:7});
});
it('each explicit start has fresh session, exercise, set IDs, preserves template, and never owns a planned occurrence',()=>{
 const state=saved(),templates=structuredClone(state.savedWorkoutTemplates),base={...state,activeWorkout:null};
 const one=useSavedWorkout(base,{templateId:'template-one',revision:1,requestId:'start-one'}),two=useSavedWorkout(base,{templateId:'template-one',revision:1,requestId:'start-two'});
 for(const key of ['id'])expect(one.activeWorkout[key]).not.toBe(two.activeWorkout[key]);
 expect(one.activeWorkout.exercises[0].id).not.toBe(two.activeWorkout.exercises[0].id);expect(one.activeWorkout.exercises[0].sets[0].id).not.toBe(two.activeWorkout.exercises[0].sets[0].id);
 expect(one.activeWorkout.source).toBe('freestyle');expect(one.activeWorkout.sourcePlanSlotId).toBeNull();expect(one.activeWorkout.logicalSessionId).toBeUndefined();expect(one.savedWorkoutTemplates).toEqual(templates);expect(one.program).toEqual(state.program);
});
it('appends all repeated entries atomically after overlap confirmation, idempotently; refuses stale sessions/templates',()=>{
 let state=saved();const draft=templateDraft(state.activeWorkout,state);draft.exercises.push({...structuredClone(draft.exercises[0]),id:'repeat-definition'});state=saveWorkoutTemplate(state,{...draft,name:'Repeat'},{id:'template-repeat'});
 const args={templateId:'template-repeat',revision:1,sessionId:state.activeWorkout.id,requestId:'batch'};
 expect(()=>useSavedWorkout(state,args)).toThrow('Confirm');const next=useSavedWorkout(state,{...args,confirmDuplicates:true});expect(next.activeWorkout.exercises).toHaveLength(5);expect(next.activeWorkout.exercises.slice(0,2)).toEqual(state.activeWorkout.exercises);expect(useSavedWorkout(next,{...args,confirmDuplicates:true})).toBe(next);
 expect(()=>useSavedWorkout({...state,activeWorkout:null},args)).toThrow('ended');expect(()=>useSavedWorkout(state,{...args,revision:2})).toThrow('changed');
 const loaded=deserializeState(serializeState(next),{strict:true});expect(loaded.activeWorkout.exercises.map(e=>e.id)).toEqual(next.activeWorkout.exercises.map(e=>e.id));
});
it('custom definitions and per-side/timed prescriptions stay usable after catalog deletion',()=>{
 const state=seed(),record=createCustomExerciseRecord({name:'My hold',equipment:['bodyweight'],loggingType:'duration',loggingMode:'per_side'});state.customExercises=[record];
 const draft={name:'Hold',exercises:[{id:'hold-definition',exerciseId:record.id,exerciseSource:'custom',importedExercise:customExerciseSnapshot(record),loggingMode:'per_side',measure:'seconds',repMin:35,repMax:45,restSeconds:60,targetRir:null,sets:[{id:'p',reps:35,weight:null,rir:null,sides:{left:{reps:35},right:{reps:35}}}]}]};
 let next=saveWorkoutTemplate(state,draft,{id:'hold'});next={...next,activeWorkout:null,customExercises:[]};expect(templateUseIssues(next,next.savedWorkoutTemplates[0])).toEqual([]);
 next=useSavedWorkout(next,{templateId:'hold',revision:1,requestId:'hold-start'});expect(next.activeWorkout.exercises[0].sets[0].sides).toEqual(draft.exercises[0].sets[0].sides);expect(next.activeWorkout.exercises[0].sets[0].completed).toBe(false);
});
it('rename/edit/delete are template-only and strict loading rejects damaged data without a reset',()=>{
 let state=saved();const session=structuredClone(state.activeWorkout),original=state.savedWorkoutTemplates[0];state=saveWorkoutTemplate(state,{...original,name:'Renamed'},{id:original.id,revision:1});expect(state.activeWorkout).toEqual(session);
 expect(()=>saveWorkoutTemplate(state,original,{id:original.id,revision:1})).toThrow('changed');
 const damaged=structuredClone(state);damaged.savedWorkoutTemplates[0].exercises[0].sets[0].completed=true;expect(()=>deserializeState(serializeState(damaged),{strict:true})).toThrow();
 const next=deleteWorkoutTemplate(state,original.id,2);expect(next.savedWorkoutTemplates).toEqual([]);expect(next.activeWorkout).toEqual(session);
});
it('two finished uses create independent history without resolving a scheduled occurrence or changing the template',()=>{
 let state={...saved(),activeWorkout:null};const templates=structuredClone(state.savedWorkoutTemplates),plan=structuredClone(state.program),originalCount=state.workouts.length,ids=[];
 for(const requestId of ['first-finish','second-finish']){
  state=useSavedWorkout(state,{templateId:'template-one',revision:1,requestId});ids.push(state.activeWorkout.id);
  Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,reps:8,weight:50});state=completeWorkout(state);
  expect(state.activeWorkout).toBeNull();expect(state.savedWorkoutTemplates).toEqual(templates);expect(state.program).toEqual(plan);
 }
 expect(ids[0]).not.toBe(ids[1]);expect(state.workouts).toHaveLength(originalCount+2);
 expect(new Set(state.workouts.slice(-2).map(w=>w.id)).size).toBe(2);
 for(const session of state.workouts.slice(-2)){expect(session.source).toBe('freestyle');expect(session.sourcePlanSlotId).toBeNull();expect(session.logicalSessionId).toBeUndefined();}
});
it('superset groups and advanced prescriptions instantiate freshly on each append without copying execution state',()=>{
 let state=saved(),draft=templateDraft(state.activeWorkout,state);draft.exercises.forEach(e=>{e.supersetId='pair';e.sets[0]={...e.sets[0],setType:'drop',segments:[{id:'segment',weight:20,reps:6,rir:2}]};});
 state=saveWorkoutTemplate(state,{...draft,name:'Paired work'},{id:'pair'});
 for(const requestId of ['pair-one','pair-two'])state=useSavedWorkout(state,{templateId:'pair',revision:1,sessionId:state.activeWorkout.id,requestId,confirmDuplicates:true});
 const [a,b,c,d]=state.activeWorkout.exercises.slice(2);expect(a.supersetId).toBe(b.supersetId);expect(c.supersetId).toBe(d.supersetId);expect(a.supersetId).not.toBe(c.supersetId);
 expect(a.sets[0].segments[0]).toMatchObject({weight:20,reps:6,rir:2,completed:false});expect(a.sets[0].segments[0].id).not.toBe(c.sets[0].segments[0].id);
 const again=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'All groups'},{id:'all-groups'});expect(again.savedWorkoutTemplates.at(-1).exercises).toHaveLength(6);
});
