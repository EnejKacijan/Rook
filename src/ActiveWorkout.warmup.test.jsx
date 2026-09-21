import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout, saveState, deserializeState, serializeState, STORAGE_KEY} from './domain.js';
import {warmupProgress} from './warmupSession.js';

let host, root, current, reduced, animations;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();reduced=false;animations=[];
  vi.stubGlobal('matchMedia',query=>({matches:query.includes('reduced-motion')&&reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(cb,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({top:200,bottom:500,height:300,width:390,left:0,right:390});
  HTMLElement.prototype.animate=function(frames,timing){const a={node:this,frames,timing,cancel:vi.fn()};animations.push(a);return a;};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete HTMLElement.prototype.animate;});
function fixture(){
  const s=createReturningUserFixture(0);Object.assign(s.profile,{recommendedWarmupsEnabled:true,rampUpSetsEnabled:true,showExerciseImages:false,rirEnabled:true,restTimerEnabled:true});
  s.activeWorkout=startWorkout(s,s.program.days[0]);
  Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,weight:52.5,reps:12,rir:2});
  s.activeWorkout.rest={startedAt:Date.now(),endsAt:Date.now()+600000,duration:600};
  return deserializeState(serializeState(s),{strict:true});
}
function mount(initial=fixture()){
  function Harness(){const[s,set]=useState(initial);current=s;return <ActiveWorkout state={s} update={fn=>set(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}
  act(()=>root.render(<Harness key={Math.random()}/>));
}
const node=q=>host.querySelector(q), rows=()=>[...host.querySelectorAll('.warmup-check-row')];
const tap=target=>act(()=> (typeof target==='string'?node(target):target).click());
const progress=()=>warmupProgress(current.activeWorkout.warmup.stages[0]);
function settle(){act(()=>{for(const a of animations)a.onfinish?.();});animations=[];}

it('whole rows toggle once, final check stays open, one shared collapse retains a reviewable summary',()=>{
  mount();const before=structuredClone(current),header=node('.workout-header'),rest=node('.rest-timer');
  tap('.workout-warmup-toggle');settle();
  expect(node('.warmup-skip')).toBeNull();expect(node('.warmup-exit').textContent).toBe('Skip warm-up');
  tap(rows().at(-1).querySelector('span'));expect(progress().done).toBe(1);
  expect(node('.warmup-exit').textContent).toBe('Skip remaining');
  tap(rows().at(-1).querySelector('i'));expect(progress().done).toBe(0);
  for(const row of rows())tap(row);
  expect(node('.workout-warmup-toggle').getAttribute('aria-expanded')).toBe('true');
  expect(node('.warmup-exit').textContent).toBe('Continue to workout');expect(progress().outcome).toBe('pending');
  const checks=progress().steps.map(s=>s.item.completed);tap('.warmup-exit');
  expect(progress().outcome).toBe('complete');expect(node('.warmup-summary-check')).not.toBeNull();
  expect(animations.filter(a=>a.timing.duration===200)).toHaveLength(1);
  expect(animations.every(a=>a.node.classList.contains('rook-disclosure'))).toBe(true);
  expect(document.activeElement).toBe(node('.workout-warmup-toggle'));settle();
  expect(node('.warmup-details')).toBeNull();expect(node('.workout-warmup-toggle').textContent).toBe('✓Warm-up complete');
  const stored=localStorage.getItem(STORAGE_KEY);tap('.workout-warmup-toggle');settle();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);expect(progress().steps.map(s=>s.item.completed)).toEqual(checks);
  expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);expect(current.activeWorkout.rest).toEqual(before.activeWorkout.rest);
  expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(current.program).toEqual(before.program);
  expect(node('.workout-header')).toBe(header);expect(node('.rest-timer')).toBe(rest);
  tap(rows()[0]);expect(node('.warmup-summary-check')).toBeNull();expect(progress().outcome).toBe('pending');
});
it.each(['none','partial','all'])('%s: exit/reload/reopen preserves checks and summary',kind=>{
  mount();tap('.workout-warmup-toggle');settle();
  for(const row of kind==='all'?rows():kind==='partial'?rows().slice(0,1):[])tap(row);
  const before=progress().steps.map(s=>s.item.completed);tap('.warmup-exit');settle();
  const outcome=progress().outcome,stored=deserializeState(localStorage.getItem(STORAGE_KEY));mount(stored);
  expect(progress().outcome).toBe(outcome);expect(Boolean(node('.warmup-summary-check'))).toBe(kind==='all');
  if(kind==='partial')expect(node('.workout-warmup-toggle').textContent).toContain('Remaining steps skipped');
  tap('.workout-warmup-toggle');settle();expect(rows().map(r=>r.getAttribute('aria-checked')==='true')).toEqual(before);
});
it('chevron alone never declares an exit, and rapid row taps do not lose/duplicate toggles',()=>{
  mount();tap('.workout-warmup-toggle');settle();const row=rows()[0];
  act(()=>{for(let i=0;i<11;i++)row.click();});expect(progress().done).toBe(1);
  const stored=localStorage.getItem(STORAGE_KEY);tap('.workout-warmup-toggle');settle();
  expect(progress().outcome).toBe('pending');expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
  expect(node('.workout-warmup-toggle').textContent).not.toContain('skipped');
});
it.each(['check','exit'])('failed %s keeps live work, checks and panel unchanged; same action retries',action=>{
  mount();expect(saveState(current)).toBe(true);tap('.workout-warmup-toggle');settle();
  const before=structuredClone(current),stored=localStorage.getItem(STORAGE_KEY),write=Storage.prototype.setItem;
  const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v){if(k===STORAGE_KEY)throw new DOMException('Full','QuotaExceededError');return write.call(this,k,v);});
  const target=action==='check'?rows()[0]:node('.warmup-exit');tap(target);
  expect(current).toEqual(before);expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
  expect(node('.workout-warmup-toggle').getAttribute('aria-expanded')).toBe('true');
  expect(node('[role="alert"]').textContent).toContain('Try again');expect(animations).toHaveLength(0);
  fail.mockRestore();tap(target);expect(node('[role="alert"]')).toBeNull();
  expect(action==='check'?progress().done:progress().outcome).toBe(action==='check'?1:'skipped');
});
it('a pending raw decimal input commits through the existing capture handler without remount or lost RIR',()=>{
  mount();const input=node('.set-row:not(.set-done) input[aria-label^="Weight"]');expect(input).not.toBeNull();
  act(()=>input.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'62,5');input.dispatchEvent(new Event('input',{bubbles:true}));});
  tap('.workout-warmup-toggle');settle();tap(rows()[0]);
  expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(62.5);
  expect(node('.set-row:not(.set-done) input[aria-label^="Weight"]')).toBe(input);
  expect(current.activeWorkout.exercises[0].sets[0].rir).toBe(2);
  expect(deserializeState(localStorage.getItem(STORAGE_KEY)).activeWorkout.exercises[0].sets[1].weight).toBe(62.5);
});
it('reduced motion closes immediately without a success pause; empty prescription renders nothing',()=>{
  reduced=true;mount();tap('.workout-warmup-toggle');tap('.warmup-exit');
  expect(node('.warmup-details')).toBeNull();expect(animations).toHaveLength(0);
  const empty=fixture();Object.assign(empty.activeWorkout.warmup.stages[0],{general:[],movementPreparation:[],rampUpSets:[],completed:true});mount(empty);
  expect(node('.workout-warmup')).toBeNull();
});
it('custom absolute loads and instructions keep their prescription when working weights exist',()=>{
  const state=fixture(),sets=state.activeWorkout.warmup.stages[0].rampUpSets[0].sets;
  sets.splice(0,sets.length,{id:'absolute',weight:42.5,loadPercent:null,reps:6},{id:'instruction',weight:null,loadPercent:null,loadInstruction:'Comfortable load',reps:12});
  mount(state);tap('.workout-warmup-toggle');settle();
  expect(rows().map(row=>row.textContent)).toContain('42.5 kg × 6✓');
  expect(rows().map(row=>row.textContent)).toContain('Comfortable load × 12✓');
});
