// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,UpNextExerciseOptions} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
let host,root,current;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const make=()=>{const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exercises=s.activeWorkout.exercises.slice(0,5);s.activeWorkout.exercises[0].sets[0].completed=true;return s;};
function mount(initial){function Harness(){const[state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));}
const handle=id=>host.querySelector(`[data-exercise-id="${id}"]`);
const key=(id,key)=>act(()=>handle(id).dispatchEvent(new KeyboardEvent('keydown',{key,altKey:true,bubbles:true,cancelable:true})));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
it.each([false,true])('keyboard reorder commits the current raw weight once without remounting and persists queue (RIR %s)',rir=>{
 const s=make();s.profile.rirEnabled=rir;const before=structuredClone(s);mount(s);
 const [a,b,c,d,e]=s.activeWorkout.exercises.map(e=>e.id),input=host.querySelector('[aria-label="Weight in kg for set 2"]');
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'142,5');input.dispatchEvent(new Event('input',{bubbles:true}));});
 key(c,'ArrowUp');expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual([a,c,b,d,e]);
 expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(142.5);expect(host.querySelector('[aria-label="Weight in kg for set 2"]')).toBe(input);
 expect(current.program).toEqual(before.program);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
 expect(deserializeState(serializeState(current),{strict:true}).activeWorkout.exercises.map(e=>e.id)).toEqual([a,c,b,d,e]);
});
it('the next exercise follows the new queue, with the current exercise pinned',()=>{
 const s=make();s.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:50,reps:8,completed:true}));mount(s);
 const [a,b,c]=s.activeWorkout.exercises.map(e=>e.id);expect(handle(a)).toBeNull();key(c,'ArrowUp');
 act(()=>button('NEXT EXERCISE →').click());act(()=>vi.advanceTimersByTime(1000));expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(c);
 expect(current.activeWorkout.exercises.find(e=>e.id===a).sets.every(set=>set.completed)).toBe(true);expect(current.activeWorkout.exercises.find(e=>e.id===b)).toBeTruthy();
});
it('logged future exercises stay locked, but a visit leaves the handle available; handle tap never opens an exercise',()=>{
 const s=make();s.activeWorkout.exercises[2].startedAt=Date.now();s.activeWorkout.exercises[3].sets[0].completed=true;mount(s);
 expect(handle(s.activeWorkout.exercises[2].id)).not.toBeNull();expect(handle(s.activeWorkout.exercises[3].id)).toBeNull();
 act(()=>root.unmount());root=createRoot(host);const plain=make();mount(plain);
 act(()=>handle(plain.activeWorkout.exercises[1].id).click());expect(current.activeWorkout.exerciseIndex).toBe(0);
});
it('the contextual sheet offers Move up/down for only its named instance',()=>{
 const s=make(),move=vi.fn(()=>true),exercise=s.activeWorkout.exercises[2];act(()=>root.render(<UpNextExerciseOptions workout={s.activeWorkout} request={{sessionId:s.activeWorkout.id,exerciseId:exercise.id}} onMoveUpNext={move} close={()=>{}}/>));
 const buttons=[...host.querySelectorAll('.up-next-options-sheet .list-row')];expect(buttons).toHaveLength(3);
 act(()=>buttons[1].click());expect(move).toHaveBeenCalledExactlyOnceWith(exercise.id,1);
});
it('opening A, leaving with Previous, and revisiting never locks its queue reorder handle',()=>{
 const s=make();mount(s);const [currentId,visitedId,nextId]=s.activeWorkout.exercises.map(e=>e.id);
 for(let visit=0;visit<2;visit++){
  act(()=>host.querySelectorAll('.up-next-main')[0].click());act(()=>vi.advanceTimersByTime(1000));
  expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(visitedId);
  expect(current.activeWorkout.exercises.find(e=>e.id===visitedId).startedAt).toBeGreaterThan(0);
  act(()=>button('← PREVIOUS EXERCISE').click());act(()=>vi.advanceTimersByTime(1000));
  expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(currentId);
  expect(handle(visitedId)).not.toBeNull();
 }
 const restored=deserializeState(serializeState(current),{strict:true});
 act(()=>root.unmount());root=createRoot(host);mount(restored);
 expect(handle(visitedId)).not.toBeNull();
 key(visitedId,'ArrowDown');
 expect(current.activeWorkout.exercises.map(e=>e.id).slice(0,3)).toEqual([currentId,nextId,visitedId]);
});
it('a persisted value on a visited exercise still blocks reordering after Previous',()=>{
 const s=make();mount(s);const visitedId=s.activeWorkout.exercises[1].id;
 act(()=>host.querySelectorAll('.up-next-main')[0].click());act(()=>vi.advanceTimersByTime(1000));
 const increase=[...host.querySelectorAll('button')].find(item=>/Increase reps for set 1/i.test(item.getAttribute('aria-label')||''));
 expect(increase).toBeTruthy();act(()=>increase.click());
 expect(current.activeWorkout.exercises.find(entry=>entry.id===visitedId).sets[0].touched).toBe(true);
 act(()=>button('← PREVIOUS EXERCISE').click());act(()=>vi.advanceTimersByTime(1000));
 expect(handle(visitedId)).toBeNull();
});
it('Next past an untouched exercise does not turn its visit into logged progress',()=>{
 const s=make();mount(s);const [firstId,visitedId]=s.activeWorkout.exercises.map(e=>e.id);
 act(()=>host.querySelectorAll('.up-next-main')[0].click());act(()=>vi.advanceTimersByTime(1000));
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(visitedId);
 act(()=>button('NEXT EXERCISE →').click());
 act(()=>[...document.querySelectorAll('.workout-confirm-actions button')].find(item=>item.textContent.trim()==='SKIP INCOMPLETE SETS').click());act(()=>vi.advanceTimersByTime(1000));
 expect(current.activeWorkout.exerciseIndex).toBe(2);
 act(()=>button('← PREVIOUS EXERCISE').click());act(()=>vi.advanceTimersByTime(1000));
 act(()=>button('← PREVIOUS EXERCISE').click());act(()=>vi.advanceTimersByTime(1000));
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(firstId);
 expect(handle(visitedId)).not.toBeNull();
});
it('an uncommitted edit restored to its original value does not lock the visited exercise',()=>{
 const s=make();mount(s);const visitedId=s.activeWorkout.exercises[1].id;
 act(()=>host.querySelectorAll('.up-next-main')[0].click());act(()=>vi.advanceTimersByTime(1000));
 const input=host.querySelector('[aria-label="Reps for set 1"]'),original=String(s.activeWorkout.exercises[1].sets[0].reps);
 const edit=value=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 act(()=>input.focus());edit(String(Number(original)+1));edit(original);
 act(()=>button('← PREVIOUS EXERCISE').click());act(()=>vi.advanceTimersByTime(1000));
 expect(current.activeWorkout.exercises.find(entry=>entry.id===visitedId).sets[0].touched).toBeFalsy();
 expect(handle(visitedId)).not.toBeNull();
});
