import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {FreestyleExercisePicker} from './FreestyleQueuePicker.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft} from './savedWorkouts.js';

let host,root,animations,reduced,listeners,rerender,current;
const originalAnimate=HTMLElement.prototype.animate;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
  animations=[];listeners=new Set();reduced=false;
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)}));
  HTMLElement.prototype.animate=function(frames,options){const a={target:this,frames,options,cancel:vi.fn()};animations.push(a);return a;};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{
  act(()=>root.unmount());host.remove();
  if(originalAnimate)HTMLElement.prototype.animate=originalAnimate;else delete HTMLElement.prototype.animate;
  vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
});
function mount(populated=false){
  let initial=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank');
  if(populated)initial=saveWorkoutTemplate(initial,{...templateDraft(initial.activeWorkout,initial),name:'Upper routine'},{id:'scope-template'});
  function Harness(){
    const[state,setState]=useState(initial),[,tick]=useState(0);rerender=()=>tick(n=>n+1);current=state;
    return <FreestyleExercisePicker state={state} update={fn=>setState(s=>fn(structuredClone(s)))} close={()=>{}} Header={({onBack})=><header>{onBack&&<button onClick={onBack}>Back</button>}</header>}/>;
  }
  act(()=>root.render(<Harness/>));act(()=>vi.advanceTimersByTime(80));
}
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=node=>act(()=>node.click());
const switchTo=text=>click(button(text));
const type=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});

it.each([false,true])('animates only the incoming retained pane, including the first lazy visit (populated %s)',populated=>{
  mount(populated);const exercises=host.querySelector('.exercise-search-body'),list=exercises.firstElementChild,before=structuredClone(current);
  expect(host.querySelector('.saved-workouts')).toBeNull();expect(animations).toHaveLength(0);
  switchTo('Saved workouts');const saved=host.querySelector('.saved-workouts'),savedList=saved.querySelector('[data-exercise-search-scroll]');
  expect(exercises.hidden).toBe(true);expect(saved.hidden).toBe(false);expect(animations).toHaveLength(1);
  expect(animations[0].target).toBe(savedList);expect(animations[0].frames).toEqual([{opacity:0,transform:'translateX(7px)'},{opacity:1,transform:'translateX(0)'}]);
  expect(animations[0].options).toEqual({duration:150,easing:'cubic-bezier(.2,0,0,1)'});
  switchTo('Exercises');expect(animations[0].cancel).toHaveBeenCalledOnce();expect(animations[1].target).toBe(list);expect(animations[1].frames[0].transform).toBe('translateX(-7px)');
  expect(saved.hidden).toBe(true);expect(exercises.hidden).toBe(false);
  switchTo('Saved workouts');expect(host.querySelector('.saved-workouts')).toBe(saved);expect(animations[2].target).toBe(savedList);
  expect(host.querySelectorAll('.queue-preview-paint')).toHaveLength(0);expect(current).toEqual(before);
});
it('preserves separate queries, scroll positions, focused input identity and retained result nodes',()=>{
  mount(true);const input=host.querySelector('input'),exercises=host.querySelector('.exercise-search-body').firstElementChild;
  act(()=>input.focus());type(input,'bench');act(()=>vi.advanceTimersByTime(400));exercises.scrollTop=123;
  const firstResult=exercises.firstElementChild;
  const focusedSwitch=text=>{const event=new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0});act(()=>button(text).dispatchEvent(event));expect(event.defaultPrevented).toBe(true);switchTo(text);};
  focusedSwitch('Saved workouts');type(input,'upper');const saved=host.querySelector('.saved-workout-list');saved.scrollTop=95;
  focusedSwitch('Exercises');expect(input.value).toBe('bench');expect(exercises.scrollTop).toBe(123);expect(exercises.firstElementChild).toBe(firstResult);
  focusedSwitch('Saved workouts');expect(input.value).toBe('upper');expect(saved.scrollTop).toBe(95);
  expect(host.querySelector('input')).toBe(input);expect(document.activeElement).toBe(input);expect(host.querySelectorAll('input[type=search]')).toHaveLength(1);
});
it('cancels superseded motion, without replay on the same tab, queries, focus or unrelated rerenders',()=>{
  mount();switchTo('Saved workouts');const input=host.querySelector('input');
  switchTo('Saved workouts');type(input,'upper');act(()=>{input.focus();rerender();vi.advanceTimersByTime(1200);});
  expect(animations).toHaveLength(1);
  for(const label of ['Exercises','Saved workouts','Exercises','Saved workouts'])switchTo(label);
  expect(animations).toHaveLength(5);expect(animations.slice(0,-1).every(a=>a.cancel.mock.calls.length===1)).toBe(true);
  expect(host.querySelector('.saved-workouts').hidden).toBe(false);expect(host.querySelector('.exercise-search-body').hidden).toBe(true);
  act(()=>root.render(null));expect(animations.at(-1).cancel).toHaveBeenCalledOnce();expect(listeners.size).toBe(0);
});
it('keeps SavedWorkouts preview/navigation state mounted when unrelated picker state updates',()=>{
  mount(true);switchTo('Saved workouts');click(host.querySelector('.saved-workout-list .list-row'));
  const preview=host.querySelector('.saved-workout-preview');expect(preview).not.toBeNull();
  act(()=>rerender());expect(host.querySelector('.saved-workout-preview')).toBe(preview);expect(animations).toHaveLength(1);
  click(button('Back'));expect(host.querySelector('.saved-workout-list')).not.toBeNull();expect(animations).toHaveLength(1);
});
it('switches immediately with reduced motion and cancels active motion when that preference changes',()=>{
  reduced=true;mount();switchTo('Saved workouts');switchTo('Exercises');expect(animations).toHaveLength(0);
  reduced=false;switchTo('Saved workouts');expect(animations).toHaveLength(1);
  act(()=>{reduced=true;listeners.forEach(fn=>fn());});expect(animations[0].cancel).toHaveBeenCalledOnce();
  switchTo('Exercises');expect(animations).toHaveLength(1);expect(host.querySelector('.exercise-search-body').hidden).toBe(false);
});
it('still switches without Web Animations support',()=>{
  delete HTMLElement.prototype.animate;mount();switchTo('Saved workouts');expect(host.querySelector('.saved-workouts').hidden).toBe(false);
  switchTo('Exercises');expect(host.querySelector('.exercise-search-body').hidden).toBe(false);
});
