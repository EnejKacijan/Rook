// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,exerciseName,serializeState,deserializeState} from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let host,root,current,change,observers,scroll,navigate;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  useAnimationClock();observers=[];scroll=vi.fn();navigate=vi.fn();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('IntersectionObserver',class{constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}disconnect(){}});
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){const top=this.matches('h1')?120:0;return {top,bottom:top+58,height:58,width:390,left:0,right:390};});
  HTMLElement.prototype.scrollTo=scroll;HTMLElement.prototype.getAnimations=()=>[];
  document.documentElement.scrollTop=500;host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();document.documentElement.scrollTop=0;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function sample(){const s=createReturningUserFixture(0);s.profile.showExerciseImages=false;s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exercises=s.activeWorkout.exercises.slice(0,3);s.activeWorkout.exercises[0].sets.forEach(set=>set.completed=true);return s;}
function mount(initial){function Harness(){const[state,setState]=useState(initial);current=state;change=fn=>setState(previous=>fn(structuredClone(previous)));return <ActiveWorkout state={state} update={change} setPage={navigate} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));}
const compact=()=>host.querySelector('.logger-exercise-context-button');
const click=text=>act(()=>[...host.querySelectorAll('button')].find(n=>n.textContent.trim()===text).click());
const advance=()=>act(()=>vi.advanceTimersByTime(300));
const show=()=>act(()=>{const io=observers.at(-1);io.callback([{target:io.target,isIntersecting:false,boundingClientRect:{bottom:20},rootBounds:{top:58}}]);});
const expectCanonical=()=>expect(compact().textContent).toBe(exerciseName(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex]));

it('Next and Previous derive their compact name from the live current entry, without stale identity',()=>{
  mount(sample());show();expectCanonical();click('NEXT EXERCISE →');advance();
  expect(current.activeWorkout.exerciseIndex).toBe(1);expectCanonical();show();click('← PREVIOUS EXERCISE');advance();
  expect(current.activeWorkout.exerciseIndex).toBe(0);expectCanonical();
});
it('browsing Up Next keeps current identity; only its canonical open action changes it',()=>{
  mount(sample());show();const before=structuredClone(current);expectCanonical();expect(current).toEqual(before);
  act(()=>host.querySelector('.swipe-up-next-body button').click());advance();expect(current.activeWorkout.exerciseIndex).toBe(1);expectCanonical();
});
it('a canonical replacement of the same session entry updates name and visibility',()=>{
  mount(sample());show();const id=current.activeWorkout.exercises[0].id;
  act(()=>change(s=>{s.activeWorkout.exercises[0].exerciseId='pull-up';return s;}));
  expect(current.activeWorkout.exercises[0].id).toBe(id);expect(compact().textContent).toBe(exerciseName({exerciseId:'pull-up'}));
  expect(compact().disabled).toBe(true);show();expectCanonical();
});
it('restored active-session index and title appear correctly after reload',()=>{
  const initial=sample();initial.activeWorkout.exerciseIndex=2;
  mount(deserializeState(serializeState(initial),{strict:true}));show();expectCanonical();expect(current.activeWorkout.exerciseIndex).toBe(2);
});
it('compact scroll shortcut cannot commit or resolve a pending numeric draft, finish, or change session/rest data',()=>{
  const initial=sample();initial.activeWorkout.exerciseIndex=1;mount(initial);show();
  const input=host.querySelector('[data-workout-draft]');
  act(()=>input.focus());
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'53,');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(input.value).toBe('53,');
  const before=structuredClone(current);
  act(()=>compact().dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1})));
  expect(current).toEqual(before);expect(input.value).toBe('53,');expect(scroll).toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
});
it('Finish confirmation keeps context beneath the normal inert background and never duplicates it in the sheet',()=>{
  mount(sample());show();click('Finish');advance();
  const screen=host.querySelector('[data-active-workout]');expect(screen.inert).toBe(true);
  expect(document.querySelector('.workout-confirm')).not.toBeNull();
  expect(document.querySelector('.workout-confirm .logger-exercise-context')).toBeNull();
  expect(document.querySelectorAll('.logger-exercise-context')).toHaveLength(1);
});
