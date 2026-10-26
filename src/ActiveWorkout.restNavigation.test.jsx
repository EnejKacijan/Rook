import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';

let host,root,current;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture({pending=false,incomplete=false}={}){
  const state=createReturningUserFixture(0);Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:true,restTimerAutoStart:true,restTimerSeconds:null,rirEnabled:false,recommendedWarmupsEnabled:false,rampUpSetsEnabled:false});
  state.activeWorkout=startWorkout(state,state.program.days[0]);state.activeWorkout.startedAt=Date.now()-60000;
  state.activeWorkout.exercises=state.activeWorkout.exercises.slice(0,3);
  state.activeWorkout.exercises.forEach((exercise,index)=>{
    exercise.restSeconds=index===0?90:30;exercise.sets=exercise.sets.slice(0,2);
    exercise.sets.forEach((set,setIndex)=>Object.assign(set,{weight:20,reps:8,completed:index===0&&(!incomplete||setIndex===0),...(index===0&&(!incomplete||setIndex===0)?{completedAt:Date.now()-10000}:{})}));
  });
  state.activeWorkout.rest=pending?{pending:true,seconds:90}:{endsAt:Date.now()+60000,seconds:90};return state;
}
function mount(initial){
  function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null);current=state;const update=operation=>setState(previous=>operation(structuredClone(previous)));return <><ActiveWorkout state={state} update={update} setPage={()=>{}} setDetail={setDetail}/>{detail&&<Detail detail={detail} state={state} update={update} setPage={()=>{}} setDetail={setDetail} close={()=>setDetail(null)}/>}</>;}
  act(()=>root.render(<Harness/>));
}
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label||node.getAttribute('aria-label')===label);
const click=label=>act(()=>button(label).click());
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const next=()=>{click('NEXT EXERCISE →');advance(400);};

it('Next and Previous preserve the exact deadline, timer element, logged sets and plan',()=>{
  const state=fixture(),rest=structuredClone(state.activeWorkout.rest),sets=state.activeWorkout.exercises.map(exercise=>structuredClone(exercise.sets));mount(state);
  const timer=host.querySelector('.rest-timer');next();expect(current.activeWorkout.exerciseIndex).toBe(1);expect(current.activeWorkout.rest).toEqual(rest);expect(host.querySelector('.rest-timer')).toBe(timer);
  click('← PREVIOUS EXERCISE');advance(400);expect(current.activeWorkout.exerciseIndex).toBe(0);expect(current.activeWorkout.rest).toEqual(rest);expect(host.querySelector('.rest-timer')).toBe(timer);
  expect(current.activeWorkout.exercises.map(exercise=>exercise.sets)).toEqual(sets);expect(current.program).toEqual(state.program);expect(current.workouts).toEqual(state.workouts);
});
it('jumping to an Up Next row also preserves the original remaining rest',()=>{
  const state=fixture(),rest=structuredClone(state.activeWorkout.rest);mount(state);act(()=>host.querySelectorAll('.swipe-up-next-body')[1].click());advance(400);
  expect(current.activeWorkout.exerciseIndex).toBe(2);expect(current.activeWorkout.rest).toEqual(rest);
});
it('manual START after moving uses the pending rest duration, not the new exercise duration',()=>{
  const state=fixture({pending:true}),rest=structuredClone(state.activeWorkout.rest);mount(state);next();expect(current.activeWorkout.rest).toEqual(rest);expect(host.querySelector('.rest-ready')).not.toBeNull();
  advance(5000);click('START');expect(current.activeWorkout.rest).toEqual({seconds:90,endsAt:Date.now()+90000});
});
it('an incomplete-exercise confirmation and its dismissal do not cancel or pause rest',()=>{
  const state=fixture({incomplete:true}),rest=structuredClone(state.activeWorkout.rest);mount(state);click('NEXT EXERCISE →');advance(5000);expect(current.activeWorkout.rest).toEqual(rest);
  click('RETURN TO EXERCISE');advance(400);expect(current.activeWorkout.exerciseIndex).toBe(0);expect(current.activeWorkout.rest).toEqual(rest);
  click('NEXT EXERCISE →');click('SKIP INCOMPLETE SET');advance(400);expect(current.activeWorkout.exerciseIndex).toBe(1);expect(current.activeWorkout.rest).toEqual(rest);
});
it('reload retains the true deadline instead of granting a fresh rest interval',()=>{
  const state=fixture(),rest=structuredClone(state.activeWorkout.rest);mount(state);next();advance(10000);
  const restored=deserializeState(serializeState(current),{strict:true});expect(restored.activeWorkout.rest).toEqual(rest);
  act(()=>root.render(null));mount(restored);expect(host.querySelector('.rest-timer strong').textContent).toBe('0:50');expect(current.activeWorkout.exerciseIndex).toBe(1);
});
it('expiry on the next exercise completes normally without changing the exercise or sets',()=>{
  const state=fixture();state.activeWorkout.rest={seconds:2,endsAt:Date.now()+2000};mount(state);next();const sets=structuredClone(current.activeWorkout.exercises.map(exercise=>exercise.sets));advance(2000);
  expect(host.querySelector('.rest-complete')).not.toBeNull();expect(current.activeWorkout.exerciseIndex).toBe(1);expect(current.activeWorkout.exercises.map(exercise=>exercise.sets)).toEqual(sets);
  advance(1600);expect(host.querySelector('.rest-timer')).toBeNull();click('← PREVIOUS EXERCISE');advance(400);expect(host.querySelector('.rest-timer')).toBeNull();
});
it('logging a new working set replaces the old rest, while SKIP explicitly cancels it',()=>{
  mount(fixture());next();click('Log set 1');expect(current.activeWorkout.rest).toEqual({seconds:30,endsAt:Date.now()+30000});expect(current.activeWorkout.exercises[1].sets[0].completed).toBe(true);
  click('SKIP');expect(current.activeWorkout.rest).toBeNull();expect(host.querySelector('.rest-timer')).toBeNull();
});

it('creating and removing an unlogged superset keeps the existing session rest',()=>{
  const state=fixture();state.activeWorkout.exerciseIndex=1;const rest=structuredClone(state.activeWorkout.rest);mount(state);
  click('Exercise options');act(()=>[...document.querySelectorAll('.active-exercise-options-sheet button')].find(node=>node.textContent.includes('Create superset')).click());
  act(()=>document.querySelector('.superset-partner-option').click());click('CREATE SUPERSET');expect(current.activeWorkout.rest).toEqual(rest);expect(current.activeWorkout.exercises[1].supersetId).toBeTruthy();
  click('Exercise options');act(()=>[...document.querySelectorAll('.active-exercise-options-sheet button')].find(node=>node.textContent.includes('Manage superset')).click());
  act(()=>document.querySelector('.active-superset-remove').click());expect(current.activeWorkout.rest).toEqual(rest);expect(current.activeWorkout.exercises[1].supersetId).toBeUndefined();expect(current.program).toEqual(state.program);
});

it.each([true,false])('the final set clears previous rest and starts no automatic or manual rest (%s auto)',autoStart=>{
  const state=fixture();state.profile.restTimerAutoStart=autoStart;
  state.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,completedAt:Date.now()-10000})));
  const last=state.activeWorkout.exercises.at(-1);last.sets.at(-1).completed=false;delete last.sets.at(-1).completedAt;state.activeWorkout.exerciseIndex=2;
  if(!autoStart)state.activeWorkout.rest={pending:true,seconds:90};
  mount(state);click('Log set 2');
  expect(current.activeWorkout.rest).toBeNull();expect(last.sets.at(-1).id).toBe(current.activeWorkout.exercises.at(-1).sets.at(-1).id);
  expect(current.activeWorkout.exercises.every(exercise=>exercise.sets.every(set=>set.completed))).toBe(true);expect(host.querySelector('.rest-timer')).toBeNull();
  advance(100000);expect(host.querySelector('.rest-timer')).toBeNull();expect(current.activeWorkout.id).toBe(state.activeWorkout.id);
  expect(current.program).toEqual(state.program);expect(current.workouts).toEqual(state.workouts);
  click('Undo logged set 2');expect(current.activeWorkout.rest).toBeNull();expect(current.activeWorkout.exercises.at(-1).sets.at(-1).completed).toBe(false);
  click('Log set 2');expect(current.activeWorkout.rest).toBeNull();expect(host.querySelector('.rest-timer')).toBeNull();
});

it('the last exercise in the list still gets rest if an earlier set remains unfinished',()=>{
  const state=fixture();state.activeWorkout.exercises[2].sets[0].completed=true;state.activeWorkout.exerciseIndex=2;mount(state);
  click('Log set 2');expect(current.activeWorkout.rest).toEqual({seconds:30,endsAt:Date.now()+30000});expect(host.querySelector('.rest-timer')).not.toBeNull();
  expect(current.activeWorkout.exercises[1].sets.some(set=>!set.completed)).toBe(true);
});

it.each([true,false])('a restored fully logged session hides legacy pending/countdown rest without losing sets (%s pending)',pending=>{
  const state=fixture({pending});state.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,completedAt:Date.now()-10000})));
  mount(deserializeState(serializeState(state),{strict:true}));const sets=structuredClone(current.activeWorkout.exercises.map(exercise=>exercise.sets));
  expect(host.querySelector('.rest-timer')).toBeNull();advance(100000);expect(host.querySelector('.rest-timer')).toBeNull();
  expect(current.activeWorkout.exercises.map(exercise=>exercise.sets)).toEqual(sets);expect(current.activeWorkout.id).toBe(state.activeWorkout.id);
});
