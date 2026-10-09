// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,exerciseName,saveActiveExercisePersonalNote,exercisePersonalNote} from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let host,root,current,change;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  useAnimationClock();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function sample(){
  const state=createReturningUserFixture(0);state.profile.showExerciseImages=false;
  Object.assign(state.program.days[0].exercises[1],{notes:'Controlled pace and pause at the top',personalNote:'Use seat 4, keep the last two sets tidy'});
  state.activeWorkout=startWorkout(state,state.program.days[0]);return state;
}
function mount(initial){function Harness(){const[state,setState]=useState(initial);current=state;change=fn=>setState(previous=>fn(structuredClone(previous)));return <ActiveWorkout state={state} update={change} setPage={()=>{}} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));}
function openNext(){act(()=>host.querySelector('.swipe-up-next-body button').click());act(()=>vi.advanceTimersByTime(300));}
it('A: queue omits personal reminders and plan cues, preserves name/prescription/reorder, and never mutates data',()=>{
  const initial=sample(),before=structuredClone(initial);mount(initial);const queue=host.querySelector('.up-next');
  expect(queue.textContent).not.toContain('Use seat 4');expect(queue.textContent).not.toContain('Controlled pace');
  expect(queue.querySelector('.up-next-personal-note,.up-next-program-note')).toBeNull();
  expect(queue.textContent).toContain(exerciseName(initial.activeWorkout.exercises[1]));
  expect(queue.querySelector('.up-next-prescription')).not.toBeNull();expect(queue.querySelector('[aria-label^="Reorder"]')).not.toBeNull();
  expect(current).toEqual(before);
});
it('B: canonical navigation makes both distinct note types visible when the exercise becomes current',()=>{
  mount(sample());const note=current.activeWorkout.exercises[1].personalNote;openNext();
  expect(current.activeWorkout.exerciseIndex).toBe(1);
  expect(host.querySelector('.exercise-personal-note').textContent).toContain(note);
  expect(host.querySelector('.exercise-program-note').textContent).toBe('Controlled pace and pause at the top');
});
it('C: canonical edit/delete stays intact and never leaks a changed note into the queue',()=>{
  mount(sample());const id=current.activeWorkout.exercises[1].id;
  act(()=>change(state=>{saveActiveExercisePersonalNote(state,id,'New reminder');return state;}));
  expect(host.querySelector('.up-next').textContent).not.toContain('New reminder');openNext();
  expect(host.querySelector('.exercise-personal-note').textContent).toContain('New reminder');
  act(()=>change(state=>{saveActiveExercisePersonalNote(state,id,'');return state;}));
  expect(host.querySelector('.exercise-personal-note')).toBeNull();
  expect(exercisePersonalNote(current.program.days[0].exercises[1])).toBeNull();
  expect(host.querySelector('.exercise-program-note').textContent).toBe('Controlled pace and pause at the top');
});
it('long mixed source cues stay intact on current exercise without being printed in Up Next',()=>{
  const state=sample(),text='Keep control.\n'.repeat(25).trim();state.activeWorkout.exercises[1].notes=text;
  mount(state);expect(host.querySelector('.up-next').textContent).not.toContain('Keep control.');openNext();
  expect(host.querySelector('.exercise-program-note').textContent).toBe(text);
});
