// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import * as domain from './domain.js';

let host,root,current;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
const make=()=>{const state=createReturningUserFixture(0);state.profile.showExerciseImages=false;
 state.activeWorkout=startWorkout(state,state.program.days[0]);state.activeWorkout.exercises=state.activeWorkout.exercises.slice(0,3);return state;};
function mount(initial){function Harness(){const [state,setState]=useState(initial),[detail,setDetail]=useState(null);
 current=state;const update=operation=>setState(previous=>operation(structuredClone(previous)));
 return <><ActiveWorkout state={state} update={update} setPage={()=>{}} setDetail={setDetail}/>
  {detail&&<Detail detail={detail} state={state} update={update} close={()=>setDetail(null)} setDetail={setDetail} setPage={()=>{}}/>}</>;
 }act(()=>root.render(<Harness/>));}
const open=()=>act(()=>host.querySelector('button[aria-label="Exercise options"]').click());
const action=label=>[...host.querySelectorAll('.active-exercise-options-sheet button')].find(button=>button.textContent.trim()===label);

it('moves the current planned exercise to Up Next through its real overflow and preserves the plan',()=>{
 const initial=make(),first=initial.activeWorkout.exercises[0].id,second=initial.activeWorkout.exercises[1].id,plan=structuredClone(initial.program);
 mount(initial);open();expect(action('Move to Up Next')).toBeTruthy();
 act(()=>action('Move to Up Next').click());
 expect(current.activeWorkout.exercises.map(entry=>entry.id).slice(0,2)).toEqual([second,first]);
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(second);
 expect(current.program).toEqual(plan);
 expect(deserializeState(serializeState(current),{strict:true}).activeWorkout.exercises[1].id).toBe(first);
});

it('removes the current session exercise through overflow, then Undo restores it as current',()=>{
 const initial=make(),first=initial.activeWorkout.exercises[0].id,second=initial.activeWorkout.exercises[1].id,plan=structuredClone(initial.program);
 mount(initial);open();act(()=>action('Remove from this workout').click());
 expect(current.activeWorkout.exercises[0].id).toBe(second);
 expect(current.activeWorkout.removedUpNextExercises[0].id).toBe(first);
 expect(current.program).toEqual(plan);
 act(()=>[...host.querySelectorAll('button')].find(button=>button.textContent.trim()==='Undo').click());
 expect(current.activeWorkout.exercises[0].id).toBe(first);
 expect(current.activeWorkout.exerciseIndex).toBe(0);
});

it('does not offer move or removal after the current exercise has meaningful saved values',()=>{
 const initial=make();initial.activeWorkout.exercises[0].sets[0].touched=true;
 mount(initial);open();expect(action('Move to Up Next')).toBeUndefined();
 expect(action('Remove from this workout')).toBeUndefined();
});
it('a failed current-exercise write leaves the session and menu unchanged',()=>{
 const initial=make(),before=structuredClone(initial.activeWorkout);
 vi.spyOn(domain,'saveState').mockReturnValue(false);mount(initial);open();
 act(()=>action('Remove from this workout').click());
 expect(current.activeWorkout).toEqual(before);
 expect(host.querySelector('.active-exercise-options-sheet [role="alert"]')?.textContent).toContain('Could not save');
 expect(action('Remove from this workout')).toBeTruthy();
 expect(host.querySelector('.exercise-remove-undo')).toBeNull();
});
