import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SheetHeader,PlanEditor,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {saveWorkoutTemplate} from './savedWorkouts.js';
import {planWorkoutChoices,resolvePlanWorkout} from './planWorkoutTemplates.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,mutate,persist,started;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);started=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=node=>act(()=>node.click());
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
function mount(initial=createReturningUserFixture(0),props={}){
  function Harness(){
    const [state,setState]=useState(initial);current=state;
    mutate=fn=>act(()=>setState(previous=>fn(structuredClone(previous))));
    return <SavedWorkouts state={state} update={fn=>setState(previous=>fn(previous))} close={()=>{}} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer} onStarted={started} {...props}/>;
  }
  act(()=>root.render(<Harness/>));
}
const logged=()=>{const state=createReturningUserFixture(4);return {state,workout:state.workouts.at(-1)};};
const backButton=()=>host.querySelector('button[aria-label="Back"], .detail-header-back');

it('Back from an edited review of a logged workout leaves instead of opening the empty workout library',()=>{
  const {state,workout}=logged();const close=vi.fn();
  mount(state,{source:workout,close});
  click(button('Edit workout'));
  click(button('REVIEW WORKOUT'));
  expect(button('SAVE WORKOUT')).toBeTruthy();
  click(backButton());
  expect(close).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('No workouts yet');
  expect(host.querySelector('input[placeholder="Search workouts"]')).toBeNull();
  expect(current.savedWorkoutTemplates||[]).toHaveLength(0);
});
