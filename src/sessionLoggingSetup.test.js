import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkout,startWorkout,serializeState,deserializeState} from './domain.js';
import {loggingModeOf} from './advancedLogging.js';
import {applySavedExerciseLoggingMode,changeSessionLoggingMode,resolveSessionLoggingChoice,sessionLoggingChoice,supportsPerSideLogging} from './sessionLoggingSetup.js';
import {addFreestyleExercise,startFreestyleWorkout} from './freestyleWorkout.js';
import {saveWorkoutTemplate,useSavedWorkout} from './savedWorkouts.js';
import {planWorkoutChoices,startPlanWorkoutExtra} from './planWorkoutTemplates.js';

const make=()=>{
 const state=createReturningUserFixture(0);
 state.activeWorkout=startWorkout(state,state.program.days[0]);
 state.activeWorkout.exercises[0].unilateral=true;
 return state;
};
const requestFor=(state, exercise=state.activeWorkout.exercises[0])=>({
 sessionId:state.activeWorkout.id,exerciseId:exercise.id,expectedExerciseId:exercise.exerciseId,
});
it('changes only the current exercise instance before work and survives reload',()=>{
 const state=make(),active=state.activeWorkout,exercise=active.exercises[0];
 expect(supportsPerSideLogging(exercise)).toBe(true);
 const side=changeSessionLoggingMode(state,requestFor(state),'per_side');
 expect(side.error).toBeNull();expect(side.state.program).toEqual(state.program);
 expect(side.state.workouts).toEqual(state.workouts);
 expect(side.state.activeWorkout.exercises[0].id).toBe(exercise.id);
 expect(side.state.activeWorkout.exercises.slice(1)).toEqual(active.exercises.slice(1));
 expect(loggingModeOf(side.state.activeWorkout.exercises[0])).toBe('per_side');
 expect(side.state.activeWorkout.exercises[0].sets[0].sides).toMatchObject({left:{reps:null},right:{reps:null}});
 const loaded=deserializeState(serializeState(side.state));
 expect(loggingModeOf(loaded.activeWorkout.exercises[0])).toBe('per_side');
 const total=changeSessionLoggingMode(loaded,requestFor(loaded),'normal');
 expect(total.error).toBeNull();expect(loggingModeOf(total.state.activeWorkout.exercises[0])).toBe('normal');
 expect(total.state.activeWorkout.exercises[0].sets[0].sides).toBeUndefined();
});
it.each(['touched','completed','side'])('never reinterprets %s session data',kind=>{
 const state=make(),active=state.activeWorkout,exercise=active.exercises[0];
 exercise.loggingMode='per_side';
 if(kind==='touched'){exercise.sets[0].weight=40;exercise.sets[0].touched=true;}
 if(kind==='completed')exercise.sets[0].completed=true;
 if(kind==='side')exercise.sets[0].sides={left:{reps:8},right:{reps:null}};
 const before=structuredClone(state),result=changeSessionLoggingMode(state,requestFor(state),'normal');
 expect(result.error).toBeNull();
 expect(result.state.activeWorkout.exercises[0]).toEqual(before.activeWorkout.exercises[0]);
 expect(sessionLoggingChoice(result.state.activeWorkout,exercise)).toMatchObject({mode:'normal',futureOnly:true});
 expect(result.state.profile).toBe(state.profile);
 expect(state).toEqual(before);
});

it('explicit per-side capability remains available after Total reps and reload without classifying a bilateral exercise as unilateral',()=>{
 const state=make(),active=state.activeWorkout,e=active.exercises[0];delete e.unilateral;e.exerciseId='dumbbell-rear-delt-fly';e.loggingMode='per_side';
 const before=deserializeState(serializeState(state),{strict:true}),total=changeSessionLoggingMode(state,requestFor(state),'normal');expect(total.error).toBeNull();
 const loaded=deserializeState(serializeState(total.state),{strict:true}),entry=loaded.activeWorkout.exercises[0];expect(supportsPerSideLogging(entry)).toBe(true);expect(entry.unilateral).toBeUndefined();
 const result=changeSessionLoggingMode(loaded,requestFor(loaded),'per_side');expect(result.error).toBeNull();expect(result.state.activeWorkout.exercises[0].id).toBe(e.id);expect(result.state.activeWorkout.exercises[0].sets.map(s=>s.id)).toEqual(e.sets.map(s=>s.id));
 expect(result.state.program).toEqual(before.program);expect(result.state.workouts).toEqual(before.workouts);expect(result.state.activeWorkout.exercises.slice(1)).toEqual(before.activeWorkout.exercises.slice(1));
});
it('does not fabricate per-side eligibility for an ordinary bilateral exercise',()=>{
 const state=make(),e=state.activeWorkout.exercises[0];delete e.unilateral;e.exerciseId='dumbbell-rear-delt-fly';e.loggingMode='normal';expect(supportsPerSideLogging(e)).toBe(false);
 expect(changeSessionLoggingMode(state,requestFor(state),'per_side').error).toMatch(/not available/);
});

it('restores a remembered mode when starting planned, saved, extra-plan and freestyle workouts',()=>{
 const state=createReturningUserFixture(0),day=state.program.days[0],exerciseId='bodyweight-split-squat';
 day.exercises[0].exerciseId=exerciseId;
 state.activeWorkout=startWorkout(state,day);
 const request=requestFor(state);
 const {state:staged,error}=changeSessionLoggingMode(state,request,'per_side');
 expect(error).toBeNull();
 expect(staged.profile.exerciseLoggingPreferences).toEqual({});
 const reloaded=deserializeState(serializeState(staged),{strict:true});
 const remembered=resolveSessionLoggingChoice(reloaded,request,'per_side','save');
 expect(remembered.program).toBe(reloaded.program);
 expect(remembered.workouts).toBe(reloaded.workouts);
 const loaded=deserializeState(serializeState(remembered),{strict:true});
 expect(loaded.profile.exerciseLoggingPreferences).toEqual({[exerciseId]:'per_side'});
 const ready={...loaded,activeWorkout:null};
 const planned=startWorkout(ready,ready.program.days[0]);
 const templateState=saveWorkoutTemplate(ready,{name:'Leg day',exercises:[ready.program.days[0].exercises[0]]},{id:'leg-template'});
 const saved=useSavedWorkout(templateState,{templateId:'leg-template',revision:1,requestId:'saved-start'}).activeWorkout;
 const extra=startPlanWorkoutExtra(ready,{reference:planWorkoutChoices(ready)[0].reference,requestId:'extra-start'}).activeWorkout;
 const freestyle=addFreestyleExercise(startFreestyleWorkout(ready),exerciseId).activeWorkout;
 for(const workout of [planned,saved,extra,freestyle]){
  expect(workout.exercises[0].exerciseId).toBe(exerciseId);
  expect(loggingModeOf(workout.exercises[0])).toBe('per_side');
  expect(workout.exercises[0].sets[0].sides).toEqual({left:{reps:null},right:{reps:null}});
 }
 expect(loggingModeOf(ready.program.days[0].exercises[0])).toBe('normal');
 expect(loggingModeOf(templateState.savedWorkoutTemplates[0].exercises[0])).toBe('normal');
 expect(planned.exercises.slice(1).map(loggingModeOf)).toEqual(ready.program.days[0].exercises.slice(1).map(loggingModeOf));
});

it('rejects stale saves and drops current logging choices from completed history',()=>{
 const state=make(),request=requestFor(state);
 const side=changeSessionLoggingMode(state,request,'per_side').state;
 const total=changeSessionLoggingMode(side,request,'normal').state;
 expect(()=>resolveSessionLoggingChoice(total,request,'per_side','save')).toThrow(/changed/);
 const replaced=structuredClone(side);
 replaced.activeWorkout.exercises[0].exerciseId='bodyweight-split-squat';
 expect(()=>resolveSessionLoggingChoice(replaced,request,'per_side','save')).toThrow(/changed/);
 expect(completeWorkout(side).workouts.at(-1).loggingSetupChoices).toBeUndefined();
});

it('keeps explicit side prescriptions and timed entries when applying a saved Total reps choice',()=>{
 const exerciseId='one-arm-dumbbell-row';
 const profile={exerciseLoggingPreferences:{[exerciseId]:'normal'}};
 const entry={exerciseId,loggingMode:'per_side',sets:[{id:'p',sides:{left:{reps:null},right:{reps:null}}}]};
 expect(applySavedExerciseLoggingMode(profile,entry).sets[0].sides).toBeUndefined();
 const timed={...entry,measure:'seconds'};
 const explicit={...entry,sets:[{id:'p',sides:{left:{reps:10},right:{reps:8}}}]};
 expect(applySavedExerciseLoggingMode(profile,timed)).toBe(timed);
 expect(applySavedExerciseLoggingMode(profile,explicit)).toBe(explicit);
});
