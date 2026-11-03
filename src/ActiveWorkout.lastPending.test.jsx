// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';

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
const logAll=exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,weight:set.weight??40,reps:set.reps||8,completedAt:Date.now()}));
function mount(initial){function Harness(){const [state,setState]=useState(initial);current=state;
 const update=operation=>setState(previous=>operation(structuredClone(previous)));
 return <ActiveWorkout state={state} update={update} setPage={()=>{}} setDetail={()=>{}}/>;}
 act(()=>root.render(<Harness/>));}
const primary=()=>host.querySelector('.workout-primary-action > .button:last-child');

it('ends on Finish when every later exercise is already logged',()=>{
 const state=make();state.activeWorkout.exercises.slice(1).forEach(logAll);logAll(state.activeWorkout.exercises[0]);state.activeWorkout.exerciseIndex=0;
 mount(state);
 expect(primary().textContent).toBe('FINISH WORKOUT');
 expect(host.textContent).not.toContain('NEXT EXERCISE');
});

it('skips logged exercises and moves to the next pending one',()=>{
 const state=make();logAll(state.activeWorkout.exercises[0]);logAll(state.activeWorkout.exercises[1]);state.activeWorkout.exerciseIndex=0;
 const third=state.activeWorkout.exercises[2].id;
 mount(state);
 expect(primary().textContent).toBe('NEXT EXERCISE →');
 act(()=>primary().click());act(()=>vi.advanceTimersByTime(1500));
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(third);
});

it('keeps positional Next while the following exercise still has work',()=>{
 const state=make();logAll(state.activeWorkout.exercises[0]);state.activeWorkout.exerciseIndex=0;
 const second=state.activeWorkout.exercises[1].id;
 mount(state);act(()=>primary().click());act(()=>vi.advanceTimersByTime(1500));
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(second);
});
