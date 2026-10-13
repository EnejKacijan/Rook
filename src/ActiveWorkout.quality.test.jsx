import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,plannedExerciseSafetyConflicts} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {compileProfileTrainingSafety} from './trainingSafety.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current;
afterEach(()=>{act(()=>root?.unmount());root=null;host?.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('rapid Add Set activations in one millisecond create distinct durable set identities',()=>{
 vi.spyOn(Date,'now').mockReturnValue(1800000000000);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 const state=createReturningUserFixture(0);state.profile.showExerciseImages=false;state.activeWorkout=startWorkout(state,state.program.days[0]);
 const exercise=state.activeWorkout.exercises[0];exercise.sets=exercise.sets.slice(0,2);exercise.sets.forEach(set=>{set.weight=40;set.reps=8;});const before=structuredClone(exercise.sets),program=structuredClone(state.program);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 function Owner(){const [value,setValue]=useState(state);current=value;return <ActiveWorkout state={value} update={fn=>setValue(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}}/>;}
 act(()=>root.render(<Owner/>));const add=[...host.querySelectorAll('button')].find(button=>button.textContent.trim()==='+ ADD SET');expect(add).toBeTruthy();
 act(()=>{add.click();add.click();});const sets=current.activeWorkout.exercises[0].sets;
 expect(sets).toHaveLength(4);expect(new Set(sets.map(set=>set.id)).size).toBe(4);expect(sets.slice(0,2)).toEqual(before);expect(sets.slice(2).every(set=>!set.completed&&set.weight===40&&set.reps===8)).toBe(true);
 const restored=deserializeState(serializeState(current),{strict:true});expect(new Set(restored.activeWorkout.exercises[0].sets.map(set=>set.id)).size).toBe(4);expect(current.program).toEqual(program);
});
it('the pre-start safety conflict list includes custom exercise snapshots',()=>{
 const profile=createReturningUserFixture(0).profile;profile.avoid='Avoid squats';const safety=compileProfileTrainingSafety(profile);
 const entry={id:'custom-entry',exerciseId:'custom-squat',importedExercise:{id:'custom-squat',name:'Custom squat',pattern:'squat',equipment:['bodyweight only'],muscles:['Quads'],bodyweight:true}};
 const program={days:[{id:'custom-day',name:'Custom',weekday:'Mon',exercises:[entry]}]};
 expect(plannedExerciseSafetyConflicts(program,safety)).toMatchObject([{dayId:'custom-day',exerciseEntryId:'custom-entry',exerciseId:'custom-squat'}]);
});
