import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,saveState} from './domain.js';
import {workoutElapsedSeconds} from './workoutTiming.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,page;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));saveState.mockReset().mockReturnValue(true);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.getAnimations=()=>[];HTMLElement.prototype.scrollTo=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);page=vi.fn();});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function mount(legacy=false){const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.startedAt=Date.now()-4*3600000;s.activeWorkout.lastMeaningfulWorkoutActivityAt=legacy?null:Date.now()-200*60000;Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,completedAt:legacy?null:Date.now()-200*60000,weight:30,reps:8});function Harness(){const [value,setValue]=useState(s);current=value;return <ActiveWorkout state={value} update={fn=>setValue(previous=>fn(structuredClone(previous)))} setPage={page} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));return structuredClone(current);}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text||b.getAttribute('aria-label')===text);
const click=text=>act(()=>button(text).click());
const type=(label,value)=>act(()=>{const input=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
it('opens recovery without a write, leaves all sets intact, and does not allow an edit to erase the gap',()=>{
  const before=mount();expect(document.querySelector('.workout-recovery-sheet h1').textContent).toBe('Still training?');expect(host.querySelector('.workout-header').textContent).toContain('Finish or continue');expect(saveState).not.toHaveBeenCalled();
  const plus=host.querySelector('[aria-label="Increase Weight in kg for set 2"]');act(()=>plus.click());expect(current).toEqual(before);expect(saveState).not.toHaveBeenCalled();
  click('Continue workout');expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(workoutElapsedSeconds(current.activeWorkout)).toBe(2400);expect(current.workouts).toEqual(before.workouts);expect(document.querySelector('.workout-recovery-sheet')).toBeNull();expect(saveState).toHaveBeenCalledOnce();
});
it('finishes with one click and uses saved activity timing without opening a form',()=>{
  const before=mount();expect(document.querySelector('.workout-recovery-sheet input')).toBeNull();click('Finish workout');
  expect(current.activeWorkout).toBeNull();expect(current.workouts.at(-1).durationSeconds).toBe(2400);expect(current.workouts.at(-1).endedAt).toBe(before.activeWorkout.lastMeaningfulWorkoutActivityAt);expect(page).toHaveBeenCalledWith('complete');expect(saveState).toHaveBeenCalledOnce();
});
it('keeps the optional duration and session intact after a failed finish, then retries without a second timestamp field',()=>{
  const before=mount();act(()=>document.querySelector('.workout-recovery-adjust summary').click());type('Workout duration in minutes','41');expect(document.querySelector('input[type="datetime-local"]')).toBeNull();saveState.mockReturnValue(false);click('Finish workout');
  expect(current.activeWorkout).toEqual(before.activeWorkout);expect(document.querySelector('[aria-label="Workout duration in minutes"]').value).toBe('41');expect(document.querySelector('.workout-recovery-sheet').textContent).toContain('Could not save');expect(page).not.toHaveBeenCalled();
  saveState.mockReturnValue(true);click('Finish workout');expect(current.activeWorkout).toBeNull();expect(current.workouts.at(-1).durationSeconds).toBe(2460);expect(current.workouts.at(-1).endedAt).toBe(before.activeWorkout.lastMeaningfulWorkoutActivityAt+60000);expect(page).toHaveBeenCalledWith('complete');
});
it('discards an invalid optional duration and its error when adjustment is closed',()=>{
  mount();act(()=>document.querySelector('.workout-recovery-adjust summary').click());type('Workout duration in minutes','9999');click('Finish workout');expect(document.querySelector('.workout-recovery-sheet [role=alert]').textContent).toContain('time available');
  act(()=>document.querySelector('.workout-recovery-adjust summary').click());expect(document.querySelector('.workout-recovery-sheet [role=alert]')).toBeNull();click('Finish workout');expect(current.workouts.at(-1).durationSeconds).toBe(2400);
});
it('requires an explicit trained duration for legacy sessions with no reliable activity evidence',()=>{
  mount(true);click('Continue workout');expect(document.querySelector('.workout-recovery-sheet [role=alert]').textContent).toContain('time you already trained');type('Workout duration in minutes','35');click('Continue workout');expect(workoutElapsedSeconds(current.activeWorkout)).toBe(2100);
});
it('asks only legacy sessions for a duration before finishing, without inventing an overnight duration',()=>{
  const before=mount(true);click('Finish workout');expect(current.activeWorkout).toEqual(before.activeWorkout);expect(document.querySelector('.workout-recovery-sheet [role=alert]').textContent).toContain('minutes you trained');type('Workout duration in minutes','35');click('Finish workout');expect(current.activeWorkout).toBeNull();expect(current.workouts.at(-1).durationSeconds).toBe(2100);expect(current.workouts.at(-1).workoutDateKey).toBe(before.activeWorkout.workoutDateKey);
});
