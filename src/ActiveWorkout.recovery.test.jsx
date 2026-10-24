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
  const before=mount();expect(document.querySelector('.workout-recovery-sheet h1').textContent).toBe('Still training?');expect(host.querySelector('.workout-header').textContent).toContain('Duration needs review');expect(saveState).not.toHaveBeenCalled();
  const plus=host.querySelector('[aria-label="Increase Weight in kg for set 2"]');act(()=>plus.click());expect(current).toEqual(before);expect(saveState).not.toHaveBeenCalled();
  click('Continue workout');expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(workoutElapsedSeconds(current.activeWorkout)).toBe(2400);expect(current.workouts).toEqual(before.workouts);expect(document.querySelector('.workout-recovery-sheet')).toBeNull();expect(saveState).toHaveBeenCalledOnce();
});
it('keeps the recovery inputs and session intact after a failed finish, then saves the reviewed duration on retry',()=>{
  const before=mount();click('Review and finish');type('Workout end','2026-10-24T08:45:00');type('Reviewed workout duration in minutes','45');saveState.mockReturnValue(false);click('Finish workout');
  expect(current.activeWorkout).toEqual(before.activeWorkout);expect(document.querySelector('[aria-label="Reviewed workout duration in minutes"]').value).toBe('45');expect(document.querySelector('.workout-recovery-sheet').textContent).toContain('Could not save');expect(page).not.toHaveBeenCalled();
  saveState.mockReturnValue(true);click('Finish workout');expect(current.activeWorkout).toBeNull();expect(current.workouts.at(-1).durationSeconds).toBe(2700);expect(current.workouts.at(-1).completedAt).toBe(new Date('2026-10-24T08:45:00').toISOString());expect(page).toHaveBeenCalledWith('complete');
});
it('requires an explicit trained duration for legacy sessions with no reliable activity evidence',()=>{
  mount(true);click('Continue workout');expect(document.querySelector('.workout-recovery-sheet [role=alert]').textContent).toContain('time you already trained');type('Time already trained in minutes','35');click('Continue workout');expect(workoutElapsedSeconds(current.activeWorkout)).toBe(2100);
});
