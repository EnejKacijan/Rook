import React,{act,useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,removeFreestyleExercise} from './freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate,useSavedWorkout} from './savedWorkouts.js';

let host,root,current,change,navigate,save;
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const click=node=>act(()=>node.click());
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const dialog=()=>document.querySelector('.freestyle-cancel-confirm');
const screen=()=>host.querySelector('[data-active-workout]');
function seed(count=1){
  let state=startFreestyleWorkout(createReturningUserFixture(0));state.profile.rirEnabled=true;
  for(const id of ['leg-press','hack-squat','plank'].slice(0,count))state=addFreestyleExercise(state,id);
  state.activeWorkout.rest={endsAt:Date.now()+90000,seconds:90};return state;
}
function mount(initial=seed()){
  function Harness(){const[state,setState]=useState(initial);current=state;
    change=fn=>setState(s=>fn(structuredClone(s)));
    return <ActiveWorkout state={state} update={change} setPage={navigate} setDetail={()=>{}}/>;
  }
  act(()=>root.render(<StrictMode><Harness/></StrictMode>));advance(40);
}
const open=()=>{click(button('Cancel workout'));advance(40);};
const type=(input,value)=>act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:320,height:300}]);
  HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);navigate=vi.fn();save=vi.spyOn(domain,'saveState');
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

it.each(['empty','removed'])('%s freestyle cancels immediately using the domain path without confirmation',kind=>{
  let state=seed(kind==='empty'?0:1);
  if(kind==='removed')state=removeFreestyleExercise(state,state.activeWorkout.exercises[0].id);
  mount(state);open();expect(dialog()).toBeNull();expect(current.activeWorkout).toBeNull();
  expect(navigate).toHaveBeenCalledExactlyOnceWith('today');expect(save).toHaveBeenCalledOnce();
  expect(current.program).toEqual(state.program);expect(current.workouts).toEqual(state.workouts);
});
it('opening and KEEP preserve the entire workout, identities, order, rest, scroll and input nodes without a save',()=>{
  mount(seed(3));const before=structuredClone(current),main=screen(),input=main.querySelector('input'),trigger=button('Cancel workout');main.scrollTop=320;
  open();expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
  expect(dialog().getAttribute('role')).toBe('dialog');expect(dialog().getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dialog().getAttribute('aria-labelledby')).textContent).toBe('Cancel workout?');
  expect(document.getElementById(dialog().getAttribute('aria-describedby')).textContent).toContain('unlogged entries');
  expect(document.activeElement).toBe(button('KEEP WORKOUT'));expect(main.inert).toBe(true);
  click(button('KEEP WORKOUT'));advance(40);advance(20);
  expect(dialog()).toBeNull();expect(current).toEqual(before);expect(main.inert).toBe(false);
  expect(document.activeElement).toBe(trigger);expect(screen()).toBe(main);expect(main.scrollTop).toBe(320);expect(main.querySelector('input')).toBe(input);
});
it('explicit cancellation clears only the active freestyle, saves once and creates no history or plan changes',()=>{
  mount(seed(2));const before=structuredClone(current);open();const confirm=button('CANCEL WORKOUT');act(()=>{confirm.click();confirm.click();});
  expect(current).toEqual({...before,activeWorkout:null});expect(save).toHaveBeenCalledOnce();
  expect(domain.loadState().activeWorkout).toBeNull();expect(navigate).toHaveBeenCalledExactlyOnceWith('today');
});
it.each(['142,5',''])('raw draft %s survives opening/KEEP without committing; later ordinary input still commits',raw=>{
  mount();const weight=screen().querySelector('[aria-label="Weight in kg for set 1"]');
  type(weight,raw);const before=structuredClone(current);open();
  expect(current).toEqual(before);expect(weight.value).toBe(raw);expect(save).not.toHaveBeenCalled();
  click(button('KEEP WORKOUT'));advance(40);advance(20);expect(weight.value).toBe(raw);expect(current).toEqual(before);
  type(weight,'62.5');act(()=>weight.blur());expect(current.activeWorkout.exercises[0].sets[0].weight).toBe(62.5);
});
it('weight, reps and RIR entries are retained by KEEP and discarded only by explicit confirmation',()=>{
  const state=seed();Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:72.5,reps:13,rir:2,touched:true});mount(state);
  const before=structuredClone(current);open();click(button('KEEP WORKOUT'));advance(40);advance(20);expect(current).toEqual(before);
  open();expect(current).toEqual(before);click(button('CANCEL WORKOUT'));expect(current).toEqual({...before,activeWorkout:null});
});
it.each(['start','append'])('Saved Workout %s content requires confirmation and leaves the saved template unchanged',mode=>{
  let state=seed(2);state=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'Saved workout'},{id:'cancel-template'});
  state=mode==='start'
    ?useSavedWorkout({...state,activeWorkout:null},{templateId:'cancel-template',revision:1,requestId:'start-cancel-test'})
    :useSavedWorkout(state,{templateId:'cancel-template',revision:1,sessionId:state.activeWorkout.id,requestId:'append-cancel-test',confirmDuplicates:true});
  mount(state);const before=structuredClone(current);open();expect(dialog()).not.toBeNull();expect(current).toEqual(before);
  click(button('CANCEL WORKOUT'));expect(current).toEqual({...before,activeWorkout:null});
});
it('completed sets keep Cancel workout unavailable',()=>{
  const state=seed();Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:60,reps:10,completed:true});mount(state);
  expect(button('Cancel workout')).toBeUndefined();expect(dialog()).toBeNull();
});
it.each(['KEEP WORKOUT','Back','handle','Escape','backdrop'])('%s is a safe dismissal with focus restoration',path=>{
  mount();const before=structuredClone(current),trigger=button('Cancel workout');open();
  if(path==='Back')click(dialog().querySelector('[aria-label="Back"]'));
  else if(path==='handle')click(dialog().querySelector('.modal-drag-handle'));
  else if(path==='Escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  else if(path==='backdrop')click(dialog().parentElement);
  else click(button(path));
  advance(40);advance(20);expect(dialog()).toBeNull();expect(current).toEqual(before);expect(document.activeElement).toBe(trigger);
  expect(save).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
});
it.each(['logged','different-session','different-source'])('stale confirmation fails safely after %s',changeKind=>{
  mount();open();act(()=>change(s=>{
    if(changeKind==='logged')s.activeWorkout.exercises[0].sets[0].completed=true;
    if(changeKind==='different-session')s.activeWorkout.id='replacement-session';
    if(changeKind==='different-source')s.activeWorkout.source='repeat';
    return s;
  }));
  const before=structuredClone(current),confirm=button('CANCEL WORKOUT');
  if(confirm)click(confirm); // A source change can unmount the freestyle actions entirely.
  expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
});
it('failed persistence keeps the workout and confirmation instead of navigating',()=>{
  mount();const before=structuredClone(current);open();save.mockReturnValue(false);click(button('CANCEL WORKOUT'));
  expect(current).toEqual(before);expect(dialog()).not.toBeNull();expect(dialog().querySelector('[role=alert]').textContent).toContain('Could not save');expect(navigate).not.toHaveBeenCalled();
});
it('normal Back only navigates and never opens cancellation or clears the active workout',()=>{
  mount();const before=structuredClone(current);click(screen().querySelector('[aria-label="Back to Today"]'));
  expect(navigate).toHaveBeenCalledExactlyOnceWith('today');expect(current).toEqual(before);expect(dialog()).toBeNull();expect(save).not.toHaveBeenCalled();
});
