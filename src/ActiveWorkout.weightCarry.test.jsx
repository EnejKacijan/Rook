import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

let root,host,current,save;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.scrollTo=()=>{};
  save=vi.spyOn(domain,'saveState').mockReturnValue(true);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(flow='repeat',{weights=[15,15,12.5],units='kg'}={}){
  const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
  Object.assign(state.profile,{units,rirEnabled:false,showExerciseImages:false,restTimerEnabled:false});state.profile.increments.barbell=2.5;
  template.exercises=template.exercises.slice(0,1);template.exercises[0].exerciseId='barbell-bench-press';
  template.exercises[0].sets=weights.map((weight,index)=>({...template.exercises[0].sets[0],id:`template-${index}`,weight:null,reps:6}));
  state.workouts=[{id:'last-workout',completedAt:'2026-10-22T12:00:00Z',exercises:[{...structuredClone(template.exercises[0]),sets:weights.map((weight,index)=>({weight,reps:8-index,completed:true}))}]}];
  state.activeWorkout=domain.startWorkout(state,template);
  if(flow==='copy'){
    state.activeWorkout.source='freestyle';state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:null,reps:6,weightProvenance:null}));
  }
  return state;
}
function mount(initial=fixture()){
  function Harness(){const[state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}} onLiveFinish={()=>{}}/>;}
  act(()=>root.render(<Harness/>));
}
const click=node=>act(()=>node.click());
const button=label=>host.querySelector(`[aria-label="${label}"]`);
const input=(number=1)=>button(`Weight in ${current.profile.units} for set ${number}`);
const plus=(number=1)=>button(`Increase Weight in ${current.profile.units} for set ${number}`);
const weights=()=>current.activeWorkout.exercises[0].sets.map(set=>set.weight);
const undo=()=>[...host.querySelectorAll('.workout-weight-undo button')].find(button=>button.textContent==='Undo');
const type=(node,value)=>{act(()=>node.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};
function useHistory(){click(host.querySelector('.freestyle-copy'));}

it.each(['repeat','copy'])('%s: plus changes equal historical loads together, preserves backoff and offers exact Undo',flow=>{
  mount(fixture(flow));if(flow==='copy')useHistory();
  const before=structuredClone(current),first=input();save.mockClear();click(plus());
  expect(weights()).toEqual([17.5,17.5,12.5]);expect(host.textContent).toContain('Updated 2 sets');expect(save).toHaveBeenCalledOnce();
  expect(current.workouts).toEqual(before.workouts);expect(current.program).toEqual(before.program);
  click(undo());expect(weights()).toEqual([15,15,12.5]);expect(input()).toBe(first);
  expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);expect(save).toHaveBeenCalledTimes(2);
});
it.each(['repeat','copy'])('%s: manual decimal entry and minus use the same carry rule',flow=>{
  mount(fixture(flow));if(flow==='copy')useHistory();const original=current.activeWorkout.exercises[0].sets.map(set=>[set.reps,set.rir,set.completed]);
  type(input(),'17,5');act(()=>input().blur());expect(weights()).toEqual([17.5,17.5,12.5]);
  click(button('Decrease Weight in kg for set 1'));expect(weights()).toEqual([15,15,12.5]);
  expect(current.activeWorkout.exercises[0].sets.map(set=>[set.reps,set.rir,set.completed])).toEqual(original);
});
it('a manual re-entry of the same future load persists independent intent through reload',()=>{
  mount(fixture('copy',{weights:[15,15,15]}));useHistory();type(input(2),'15');act(()=>input(2).blur());
  expect(current.activeWorkout.exercises[0].sets[1]).toMatchObject({weight:15,weightEntryMode:'manual',weightProvenance:'explicit'});
  const stored=domain.deserializeState(domain.serializeState(current));act(()=>root.render(null));mount(stored);click(plus());
  expect(weights()).toEqual([17.5,15,15]);expect(undo()).toBeUndefined();
});
it('a pending cleared future input cannot be overwritten when first-set plus settles drafts',()=>{
  mount(fixture('repeat',{weights:[15,15,15]}));type(input(2),'');
  act(()=>plus().dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  click(plus());expect(weights()).toEqual([17.5,15,15]);
});
it('correcting a logged first set leaves the next set unchanged',()=>{
  const state=fixture('repeat',{weights:[15,15]});state.activeWorkout.exercises[0].sets[0].completed=true;mount(state);click(plus());
  expect(weights()).toEqual([17.5,15]);expect(current.activeWorkout.exercises[0].sets[0].completed).toBe(true);expect(undo()).toBeUndefined();
});
it('two equal sets repeat consistently after save/resume',()=>{
  mount(fixture('repeat',{weights:[15,15]}));click(plus());expect(weights()).toEqual([17.5,17.5]);
  const saved=domain.deserializeState(domain.serializeState(current));act(()=>root.render(null));mount(saved);click(plus());
  expect(weights()).toEqual([20,20]);
});
it('pound display changes share the same canonical carry and preserve different loads',()=>{
  mount(fixture('copy',{units:'lb'}));useHistory();click(plus());
  expect(weights()).toEqual([17.5,17.5,12.5]);expect(input().value).toBe(String(domain.displayWeight(17.5,'lb')));
});
it('the Undo expires on later manual input, even re-entering the same number',()=>{
  mount();click(plus());expect(undo()).toBeTruthy();type(input(2),'17.5');expect(undo()).toBeUndefined();act(()=>input(2).blur());
  click(plus());expect(weights()).toEqual([20,17.5,12.5]);
});
it('a failed change publishes no load or success toast and can retry the same step',()=>{
  mount();const before=structuredClone(current);save.mockReturnValue(false);click(plus());
  expect(current).toEqual(before);expect(input().value).toBe('15');expect(undo()).toBeUndefined();expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  save.mockReturnValue(true);click(plus());expect(weights()).toEqual([17.5,17.5,12.5]);
});
