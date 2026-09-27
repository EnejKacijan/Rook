import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Complete} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkout, deserializeState, saveState, startWorkout} from './domain.js';
import {startFreestyleWorkout, addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutPhoto} from './workoutPhotos.js';

vi.mock('./domain.js', async original => ({...await original(), saveState: vi.fn(() => true)}));
vi.mock('./workoutPhotos.js', async original => ({...await original(), saveWorkoutPhoto: vi.fn(), getWorkoutPhoto: vi.fn(async () => null)}));
let root, host, current, mutate, live;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({matches:true, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  saveState.mockReset().mockReturnValue(true);
  saveWorkoutPhoto.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root?.unmount());host?.remove();localStorage.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(kind='planned', partial=false) {
  let state=deserializeState(createReturningUserFixture(0));
  Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false});state.selectedDate='2026-09-21';
  if(kind==='freestyle') {
    state=addFreestyleExercise(startFreestyleWorkout(state),'barbell-bench-press');
    state=addFreestyleExercise(state,'pull-up');
  } else state.activeWorkout=startWorkout(state,state.program.days[0]);
  state.activeWorkout.exerciseIndex=1; state.activeWorkout.startedAt-=185000;
  state.activeWorkout.exercises.forEach((e,i)=>e.sets.forEach((set,j)=>Object.assign(set,{weight:e.loadRequirement==='none'?null:52.5,reps:12,rir:2,completed:!partial||i===0&&j===0})));
  return state;
}
function mount(initial, page='workout') {
  function Harness() {
    const [state,setState]=useState(initial),[screen,setScreen]=useState(page),context=useRef(null);
    current=state;live=context;
    mutate=fn=>setState(previous=>fn(structuredClone(previous)));
    const navigate=next=>{if(next!=='complete')context.current=null;setScreen(next);};
    return screen==='workout'
      ? <ActiveWorkout state={state} update={mutate} setPage={navigate} setDetail={()=>{}} onLiveFinish={value=>{context.current=value;}}/>
      : screen==='complete' ? <Complete state={state} update={mutate} setPage={navigate} setDetail={()=>{}} liveFinish={context.current}/>
      : <p>Today</p>;
  }
  act(()=>root.render(<Harness/>));
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=text=>act(()=>button(text).click());
function finish(partial) {click('Finish');if(partial)click('FINISH ANYWAY');}

it.each([['planned',false],['planned',true],['freestyle',false],['freestyle',true]])('%s finish (partial %s) → continue → more work → finish stores one final session', (kind,partial)=>{
  const initial=fixture(kind,partial),active=structuredClone(initial.activeWorkout);
  mount(initial);finish(partial);expect(current.workouts).toHaveLength(1);
  expect(button('CONTINUE WORKOUT')).toBeDefined();
  const target=button('CONTINUE WORKOUT');act(()=>{target.click();target.click();});
  expect(current.workouts).toHaveLength(0);expect(current.activeWorkout).toEqual(active);
  expect(document.activeElement).toBe(host.querySelector('.exercise-heading h1'));
  expect(saveState).toHaveBeenCalledTimes(2);expect(saveState.mock.calls.at(-1)[0].activeWorkout.id).toBe(active.id);
  act(()=>mutate(s=>{s.activeWorkout.exercises[1].sets[0].completed=true;s.activeWorkout.exercises[1].sets[0].reps=13;return s;}));
  finish(current.activeWorkout.exercises.some(e=>e.sets.some(s=>!s.completed)));expect(current.workouts).toHaveLength(1);
  expect(current.workouts[0].exercises[1].sets[0].reps).toBe(13);
  expect(current.activeWorkout).toBeNull();
});
it('last raw numeric edit is committed before finish and restored as the pending value',()=>{
  mount(fixture('planned',true));
  const input=host.querySelector('.exercise-detail input[data-workout-draft]')||host.querySelector('input[data-workout-draft]');
  act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'72.5');input.dispatchEvent(new Event('input',{bubbles:true}));});
  finish(true);click('CONTINUE WORKOUT');
  expect(current.activeWorkout.exercises[1].sets[0].weight).toBe(72.5);
  expect(current.activeWorkout.exercises[1].sets[0].completed).toBe(false);
});
it('ordinary rerenders and elapsed time do not expire Continue, and completion notes/feedback survive',()=>{
  mount(fixture());finish(false);act(()=>vi.advanceTimersByTime(60000));
  const note=host.querySelector('textarea');
  act(()=>{note.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'  Keep this note  ');note.dispatchEvent(new Event('input',{bubbles:true}));});
  click('About right');act(()=>mutate(s=>({...s,ai:{available:true}})));
  click('CONTINUE WORKOUT');
  expect(current.activeWorkout.sessionNote).toBe('Keep this note');
  expect(current.activeWorkout.sessionFeedback).toBe('about_right');
  expect(Date.now()-current.activeWorkout.startedAt).toBe(245000);
});
it('failed durable Continue leaves the completed record intact and allows a safe retry',()=>{
  mount(fixture());finish(false);const completed=structuredClone(current);
  saveState.mockReturnValueOnce(false);click('CONTINUE WORKOUT');
  expect(current).toEqual(completed);expect(host.querySelector('.complete-screen')).not.toBeNull();
  expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  click('CONTINUE WORKOUT');expect(current.activeWorkout).not.toBeNull();expect(current.workouts).toHaveLength(0);
});
it('failed Finish never publishes a continuation context or successful completion',()=>{
  mount(fixture());saveState.mockReturnValueOnce(false);finish(false);
  expect(current.activeWorkout).not.toBeNull();expect(current.workouts).toHaveLength(0);expect(live.current).toBeNull();
  expect(button('CONTINUE WORKOUT')).toBeUndefined();
});
it.each([true,false])('a pending photo cannot race Continue; success %s invalidates only after saving',async success=>{
  mount(fixture());finish(false);
  let resolve,reject;saveWorkoutPhoto.mockImplementation(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));
  const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new File(['photo'],'photo.png',{type:'image/png'})]});
  act(()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  expect(button('CONTINUE WORKOUT').disabled).toBe(true);click('CONTINUE WORKOUT');expect(current.activeWorkout).toBeNull();
  await act(async()=>{if(success)resolve({id:'photo-owned-by-completion'});else reject(Error('Photo write failed'));});
  if(success){expect(button('CONTINUE WORKOUT')).toBeUndefined();expect(current.workouts[0].photoId).toBe('photo-owned-by-completion');}
  else{expect(button('CONTINUE WORKOUT').disabled).toBe(false);click('CONTINUE WORKOUT');expect(current.activeWorkout).not.toBeNull();}
});
it.each(['active','corrected','deleted'])('invalidates the immediate context after %s state changes',kind=>{
  mount(fixture());finish(false);
  act(()=>mutate(s=>{if(kind==='active')s.activeWorkout={...fixture().activeWorkout,id:'new-session'};if(kind==='corrected')s.workouts[0].correctionRevision=1;if(kind==='deleted')s.workouts=[];return s;}));
  expect(button('CONTINUE WORKOUT')).toBeUndefined();expect(live.current.reversal).toBeNull();
  if(kind==='active'){
    expect(current.activeWorkout.id).toBe('new-session');
    act(()=>mutate(s=>({...s,activeWorkout:null})));
    expect(button('CONTINUE WORKOUT')).toBeUndefined();
  }
});
it('leaving completion releases the snapshot; historical/reloaded completion has no Continue',()=>{
  mount(fixture());finish(false);click('DONE');expect(live.current).toBeNull();
  const completed=completeWorkout(fixture());act(()=>root.unmount());root=createRoot(host);
  mount(completed,'complete');expect(button('CONTINUE WORKOUT')).toBeUndefined();
  expect(button('DONE')).toBeDefined();
});
