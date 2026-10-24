import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

let root,host,current,save,animations,reduced;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  reduced=false;animations=[];sessionStorage.clear();
  vi.stubGlobal('matchMedia',()=>({get matches(){return reduced;},addEventListener(){},removeEventListener(){}}));
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:function(frames,options){
    animations.push({node:this,frames,options});return {cancel:vi.fn(),finished:new Promise(()=>{}),addEventListener(){},removeEventListener(){}};
  }});
  save=vi.spyOn(domain,'saveState').mockReturnValue(true);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();delete HTMLElement.prototype.animate;sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(){
  const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
  Object.assign(state.profile,{rirEnabled:false,showExerciseImages:false,restTimerEnabled:true,restTimerAutoStart:true,restTimerSeconds:90});
  template.exercises=template.exercises.slice(0,1);template.exercises[0].exerciseId='barbell-bench-press';
  state.workouts=[{id:'previous',completedAt:'2026-10-22T12:00:00Z',exercises:[{exerciseId:'barbell-bench-press',sets:[{weight:20,reps:8,completed:true}]}]}];
  state.activeWorkout=domain.startWorkout(state,template);
  state.activeWorkout.exercises[0].sets=state.activeWorkout.exercises[0].sets.slice(0,2);
  state.activeWorkout.exercises[0].sets.forEach((set,i)=>Object.assign(set,{weight:i?25:22.5,reps:7,completed:false}));
  return state;
}
function mount(initial=fixture()){
  function Harness(){const[state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}}/>;}
  act(()=>root.render(<Harness/>));
}
const click=label=>act(()=>host.querySelector(`[aria-label="${label}"]`).click());
const advance=()=>act(()=>vi.advanceTimersByTime(800));
const pulses=()=>animations.filter(({node,options})=>node.classList.contains('active-performance-pr')&&options.duration===550);
const badge=()=>host.querySelector('.active-performance-pr-trigger');

it('only a successfully persisted fresh log earns one inline acknowledgement; later bests update without replay',()=>{
  mount();const before=structuredClone(current);expect(badge()).toBeNull();
  click('Log set 1');
  expect(save).toHaveBeenCalledOnce();expect(current.activeWorkout.exercises[0].sets[0].completed).toBe(true);
  expect(badge().getAttribute('aria-label')).toBe('View weight best, +2.5 kg');expect(pulses()).toHaveLength(1);
  expect(current.activeWorkout.rest).toMatchObject({seconds:90,endsAt:Date.now()+90000});
  expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
  advance();click('Log set 2');expect(badge().textContent).toContain('+2.5 kg');expect(pulses()).toHaveLength(1);
  advance();click('Undo logged set 2');expect(badge().textContent).toContain('+2.5 kg');
  click('Log set 2');expect(pulses()).toHaveLength(1);
});
it('a failed save produces no record, no acknowledgement and no logged state, and retry remains possible',()=>{
  mount();const before=structuredClone(current);save.mockReturnValue(false);click('Log set 1');
  expect(current).toEqual(before);expect(badge()).toBeNull();expect(pulses()).toHaveLength(0);
  expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  save.mockReturnValue(true);click('Log set 1');expect(badge()).not.toBeNull();expect(pulses()).toHaveLength(1);
});
it('a resumed record, an edit to a logged set, and a reload after unchecking never replay the acknowledgement',()=>{
  const initial=fixture();initial.activeWorkout.exercises[0].sets[0].completed=true;mount(initial);
  expect(badge()).not.toBeNull();expect(pulses()).toHaveLength(0);
  click('Increase Weight in kg for set 1');expect(badge()).not.toBeNull();expect(pulses()).toHaveLength(0);
  click('Undo logged set 1');expect(badge()).toBeNull();
  const stored=structuredClone(current);act(()=>root.render(null));mount(stored);click('Log set 1');expect(pulses()).toHaveLength(0);
  advance();click('Log set 2');expect(pulses()).toHaveLength(0);
});
it('reduced motion keeps the truthful static label and consumes the one-time acknowledgement',()=>{
  reduced=true;mount();click('Log set 1');expect(badge().textContent).toContain('Weight best');expect(pulses()).toHaveLength(0);
  advance();reduced=false;click('Log set 2');expect(pulses()).toHaveLength(0);
});
it('prepared values alone never create a badge, and a same-weight rep improvement uses plain rep feedback',()=>{
  const initial=fixture();initial.activeWorkout.exercises[0].sets[0].weight=20;initial.activeWorkout.exercises[0].sets[0].reps=8;mount(initial);
  click('Increase Reps for set 1');expect(badge()).toBeNull();expect(pulses()).toHaveLength(0);
  click('Log set 1');expect(badge().getAttribute('aria-label')).toBe('View rep best, +1 rep');expect(pulses()).toHaveLength(1);
});
