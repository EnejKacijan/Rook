import React, {act, StrictMode, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Complete} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkout, isoDay, startWorkout} from './domain.js';
import {addFreestyleExercise, startFreestyleWorkout} from './freestyleWorkout.js';

vi.mock('./workoutPhotos.js', async original => ({...await original(),
  saveWorkoutPhoto: vi.fn(async () => ({id:'scroll-test-photo'})),
  getWorkoutPhoto: vi.fn(async () => ({blob:new Blob(['test'], {type:'image/png'})})),
}));
let root, host, current, mutate, top, scrollWrites, layoutPositions;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({matches:false, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scroll-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  top = 640; scrollWrites = []; layoutPositions = [];
  Object.defineProperty(document, 'scrollingElement', {configurable:true, get:()=>document.documentElement});
  vi.spyOn(document.documentElement, 'scrollTop', 'get').mockImplementation(() => top);
  vi.spyOn(document.documentElement, 'scrollTop', 'set').mockImplementation(value => {top=value;scrollWrites.push(value);});
  host = document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(() => {act(() => root?.unmount());host?.remove();localStorage.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete document.scrollingElement;});

function fixture(kind='planned', partial=false) {
  let state=createReturningUserFixture(0);
  Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false});state.selectedDate=isoDay();
  if(kind==='freestyle')state=addFreestyleExercise(startFreestyleWorkout(state),'barbell-bench-press');
  else state.activeWorkout=startWorkout(state,state.program.days[0]);
  state.activeWorkout.startedAt=Date.now()-185000;
  state.activeWorkout.exercises.forEach(e=>e.sets.forEach((set,i)=>Object.assign(set,{weight:52.5,reps:12,completed:!partial||i===0})));
  return state;
}
function mount(initial, {page='workout',liveFinish=null,strict=false}={}) {
  function Harness() {
    const [state,setState]=useState(initial),[screen,setScreen]=useState(page),live=useRef(liveFinish);
    current=state;mutate=fn=>setState(previous=>fn(structuredClone(previous)));
    useLayoutEffect(()=>{if(screen==='complete')layoutPositions.push(top);});
    return screen==='workout'
      ? <ActiveWorkout state={state} update={mutate} setPage={setScreen} setDetail={()=>{}} onLiveFinish={value=>{live.current=value;}}/>
      : screen==='complete' ? <Complete state={state} update={mutate} setPage={setScreen} setDetail={()=>{}} liveFinish={live.current}/> : <p>Today</p>;
  }
  act(()=>root.render(strict?<StrictMode><Harness/></StrictMode>:<Harness/>));
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=text=>act(()=>button(text).click());

it.each(['planned','freestyle'])('resets the actual document before the completion layout boundary after %s finish',kind=>{
  mount(fixture(kind));expect(top).toBe(640);click('Finish');
  expect(host.querySelector('.complete-screen')).not.toBeNull();expect(current.activeWorkout).toBeNull();
  expect(top).toBe(0);expect(layoutPositions).toEqual([0]);expect(scrollWrites).toEqual([0]);
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it('keeps the active position on cancel, and resets only after confirmed early finish',()=>{
  mount(fixture('planned',true));click('Finish');expect(scrollWrites).toEqual([]);
  click('KEEP TRAINING');act(()=>vi.advanceTimersByTime(220));expect(top).toBe(640);expect(current.activeWorkout).not.toBeNull();
  click('Finish');click('FINISH ANYWAY');expect(scrollWrites).toEqual([0]);expect(layoutPositions).toEqual([0]);
});
it('Back navigation does not reset or finish the active session',()=>{
  mount(fixture());const id=current.activeWorkout.id;
  act(()=>host.querySelector('[aria-label="Back to Today"]').click());
  expect(top).toBe(640);expect(scrollWrites).toEqual([]);expect(current.activeWorkout.id).toBe(id);expect(current.workouts).toHaveLength(0);
});
it.each(['missing','already-presented','different-session'])('does not treat %s completion as a new successful finish',kind=>{
  const active=fixture(),state=completeWorkout(active);
  const liveFinish=kind==='missing'?null:{startedAt:kind==='different-session'?0:state.workouts.at(-1).startedAt,presented:kind==='already-presented',priorWorkouts:[]};
  mount(state,{page:'complete',liveFinish});expect(top).toBe(640);expect(scrollWrites).toEqual([]);
});
it('StrictMode resets once and later note, feedback, photo and log updates retain scroll and DOM identity',async()=>{
  const state=completeWorkout(fixture());
  mount(state,{page:'complete',strict:true,liveFinish:{startedAt:state.workouts.at(-1).startedAt,presented:false,priorWorkouts:[]}});
  expect(scrollWrites).toEqual([0]);const screen=host.querySelector('.complete-screen'),note=host.querySelector('textarea');
  top=275;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'Kept my position');note.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(current.workouts.at(-1).sessionNote).toBe('Kept my position');expect(top).toBe(275);
  click('About right');expect(current.workouts.at(-1).sessionFeedback).toBe('about_right');expect(top).toBe(275);
  const photo=host.querySelector('input[type=file]');Object.defineProperty(photo,'files',{value:[new File(['photo'],'test.png',{type:'image/png'})]});
  await act(async()=>photo.dispatchEvent(new Event('change',{bubbles:true})));
  expect(current.workouts.at(-1).photoId).toBe('scroll-test-photo');expect(top).toBe(275);
  const log=host.querySelector('.session-log-trigger');act(()=>log.click());expect(top).toBe(275);
  act(()=>mutate(s=>({...s})));act(()=>vi.advanceTimersByTime(1));
  expect(top).toBe(275);expect(scrollWrites).toEqual([0]);expect(host.querySelector('.complete-screen')).toBe(screen);expect(host.querySelector('textarea')).toBe(note);
});
