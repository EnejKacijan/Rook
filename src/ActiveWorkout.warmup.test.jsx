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
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();sessionStorage.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete HTMLElement.prototype.animate;});
function fixture(){
  const s=createReturningUserFixture(0);Object.assign(s.profile,{recommendedWarmupsEnabled:true,rampUpSetsEnabled:true,showExerciseImages:false,rirEnabled:true,restTimerEnabled:true});
  s.activeWorkout=startWorkout(s,s.program.days[0]);
  Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,weight:52.5,reps:12,rir:2});
  s.activeWorkout.rest={startedAt:Date.now(),endsAt:Date.now()+600000,duration:600};
  return deserializeState(serializeState(s),{strict:true});
}
let setCurrent;
// A new session: nothing logged and no rest running yet.
function fresh(){const s=fixture();s.activeWorkout.exercises[0].sets[0].completed=false;s.activeWorkout.rest=null;return s;}
const expanded=()=>node('.workout-warmup-toggle')?.getAttribute('aria-expanded');
const goTo=index=>act(()=>setCurrent(prev=>({...prev,activeWorkout:{...prev.activeWorkout,exerciseIndex:index}})));
function mount(initial=fixture()){
  function Harness(){const[s,set]=useState(initial);current=s;setCurrent=set;return <ActiveWorkout state={s} update={fn=>set(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}
  act(()=>root.render(<Harness key={Math.random()}/>));
}
const node=q=>host.querySelector(q), rows=()=>[...host.querySelectorAll('.warmup-check-row')];
const tap=target=>act(()=> (typeof target==='string'?node(target):target).click());
const progress=()=>warmupProgress(current.activeWorkout.warmup.stages[0]);
function settle(){act(()=>{for(const a of animations)a.onfinish?.();});animations=[];}

it('whole rows toggle once, final check stays open, one shared collapse retains a reviewable summary',()=>{
  mount();const before=structuredClone(current),header=node('.workout-header'),rest=node('.rest-timer');
  tap('.workout-warmup-toggle');settle();
  expect(node('.warmup-skip').getAttribute('aria-label')).toBe('Skip warm-up');expect(node('.warmup-exit').textContent).toBe('Skip warm-up');
  tap(rows().at(-1).querySelector('span'));expect(progress().done).toBe(1);
  expect(node('.warmup-exit').textContent).toBe('Skip remaining');
  tap(rows().at(-1).querySelector('i'));expect(progress().done).toBe(0);
  for(const row of rows())tap(row);
  expect(node('.workout-warmup-toggle').getAttribute('aria-expanded')).toBe('true');expect(node('.warmup-skip')).toBeNull();
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

it('shows the flexible cardio recommendation without changing checks or working sets',()=>{
  mount();const before=structuredClone(current.activeWorkout.exercises);
  tap('.workout-warmup-toggle');settle();
  expect(rows()[0].textContent).toContain('5 min');
  expect(node('.warmup-general-guidance').textContent).toContain("Shorten this if you're already warm");
  expect(node('.warmup-general-guidance').closest('button')).toBeNull();
  expect(node('.warmup-general-guidance').closest('details').open).toBe(false);
  expect(progress().done).toBe(0);
  expect(current.activeWorkout.exercises).toEqual(before);
});

it('keeps the expanded checklist concise while routine guidance stays available on demand',()=>{
  mount();const before=structuredClone(current),save=vi.spyOn(Storage.prototype,'setItem');
  tap('.workout-warmup-toggle');settle();
  expect(node('.warmup-inline-progress').textContent).toBe(`0/${progress().total}`);
  expect(node('.workout-warmup-toggle').getAttribute('aria-label')).toContain(`0 of ${progress().total} warm-up steps complete`);
  expect([...host.querySelectorAll('.warmup-section-label')].map(item=>item.textContent.trim())).toEqual(['Warm-up sets']);
  expect(node('.warmup-exit').classList.contains('text-button')).toBe(true);
  const tips=node('.warmup-tips');expect(tips.open).toBe(false);expect(node('.warmup-count-note').closest('details')).toBe(tips);
  tap('.warmup-tips summary');expect(tips.open).toBe(true);expect(tips.textContent).toContain('Tap each step when done.');
  expect(tips.textContent).toContain("Shorten this if you're already warm");
  tap('.warmup-tips summary');expect(tips.querySelector('summary').getAttribute('aria-expanded')).toBe('false');
  expect(tips.querySelector('.rook-disclosure').hasAttribute('inert')).toBe(true);settle();
  expect(tips.open).toBe(false);expect(current).toEqual(before);expect(save.mock.calls.filter(([key])=>key===STORAGE_KEY)).toEqual([]);
});

it.each(['custom','imported','user','legacy'])('%s instructions and safety messages stay visible outside optional tips',kind=>{
  const state=fixture(),warmup=state.activeWorkout.warmup,general=warmup.stages[0].general[0];
  warmup.safetyMessage='Keep the prescribed movement restriction.';
  general.guidance='Use the specific setup and pause prescribed in this plan.';
  if(kind==='custom'){warmup.source='custom';general.custom=true;}else if(kind==='legacy')warmup.generatorVersion=2;else general.provenance=kind;
  mount(state);tap('.workout-warmup-toggle');settle();
  expect(node('.warmup-safety').textContent).toBe(warmup.safetyMessage);expect(node('.warmup-safety').closest('details')).toBeNull();
  expect(node('.warmup-general-guidance').textContent).toBe(general.guidance);expect(node('.warmup-general-guidance').closest('details')).toBeNull();
});

it('keeps exercise names when warm-up sets prepare multiple movements',()=>{
  const state=fixture(),stage=state.activeWorkout.warmup.stages[0],second=state.activeWorkout.exercises[1];
  const other=structuredClone(stage.rampUpSets[0]);Object.assign(other,{exerciseId:second.exerciseId,exerciseInstanceId:second.id,exerciseIndex:1,exerciseName:'Second movement'});
  other.sets.forEach(set=>set.id+='-second');stage.rampUpSets.push(other);
  mount(state);tap('.workout-warmup-toggle');settle();
  expect([...host.querySelectorAll('.warmup-ramp .warmup-section-label')].map(item=>item.textContent.trim())).toEqual([`${stage.rampUpSets[0].exerciseName} · Warm-up sets`,'Second movement · Warm-up sets']);
});

it('keeps a distinct imported exercise label even for a single matching ramp group',()=>{
  const state=fixture();state.activeWorkout.warmup.stages[0].rampUpSets[0].exerciseName='Specific setup from imported plan';
  mount(state);tap('.workout-warmup-toggle');settle();
  expect(node('.warmup-ramp .warmup-section-label').textContent.trim()).toBe('Specific setup from imported plan · Warm-up sets');
});

it('reload keeps an already-started automatic warm-up prescription and its progress intact',()=>{
  const state=fixture();
  const general=state.activeWorkout.warmup.general[0];
  Object.assign(general,{label:'Easy elliptical',minutes:3,completed:true});
  delete general.guidance;
  Object.assign(state.activeWorkout.warmup.stages[0].general[0],general);
  delete state.activeWorkout.warmup.stages[0].general[0].guidance;
  const saved=structuredClone(state.activeWorkout);
  const restored=deserializeState(serializeState(state),{strict:true});
  expect(restored.activeWorkout).toEqual(saved);
  mount(restored);tap('.workout-warmup-toggle');settle();
  expect(rows()[0].textContent).toContain('Easy elliptical');
  expect(rows()[0].textContent).toContain('3 min');
  expect(rows()[0].getAttribute('aria-checked')).toBe('true');
  expect(node('.warmup-general-guidance')).toBeNull();
});

it('a new workout opens the first warm-up on the first paint, without animation or scrolling',()=>{
  const scroll=vi.fn();Object.assign(HTMLElement.prototype,{scrollBy:scroll,scrollTo:scroll});
  let firstPaint;
  const state=fresh();
  function Probe(){const[s,set]=useState(state);current=s;return <ActiveWorkout state={s} update={fn=>set(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}
  act(()=>root.render(<Probe/>));firstPaint=expanded();
  expect(firstPaint).toBe('true');expect(rows().length).toBe(progress().total);
  expect(node('.warmup-skip').getAttribute('aria-label')).toBe('Skip warm-up');
  expect(animations).toHaveLength(0);expect(scroll).not.toHaveBeenCalled();
  expect(host.querySelector('.rook-disclosure').style.height).toBe('auto');
  act(()=>vi.advanceTimersByTime(500));expect(scroll).not.toHaveBeenCalled();
  delete HTMLElement.prototype.scrollBy;delete HTMLElement.prototype.scrollTo;
});
it('a later warm-up, a finished one and a skipped one start collapsed',()=>{
  const later=fresh(),stage=later.activeWorkout.warmup.stages[0];
  const second=later.activeWorkout.exercises[1];
  later.activeWorkout.warmup.stages.push({...structuredClone(stage),id:'later-stage',exerciseIndex:1,exerciseId:second.exerciseId,exerciseInstanceId:second.id});
  later.activeWorkout.exerciseIndex=1;mount(later);expect(expanded()).toBe('false');
  for(const outcome of ['complete','skipped']){
    const state=fresh(),done=state.activeWorkout.warmup.stages[0];
    if(outcome==='complete'){for(const step of warmupProgress(done).steps)step.item.completed=true;done.completed=true;}else done.skipped=true;
    mount(state);expect(expanded()).toBe('false');expect(node('.warmup-skip')).toBeNull();
  }
});
it('a manual collapse stays collapsed after leaving and returning to the exercise, and after reload',()=>{
  mount(fresh());expect(expanded()).toBe('true');tap('.workout-warmup-toggle');settle();expect(expanded()).toBe('false');
  goTo(1);goTo(0);expect(expanded()).toBe('false');
  mount(deserializeState(serializeState(current)));expect(expanded()).toBe('false');
  tap('.workout-warmup-toggle');settle();goTo(1);goTo(0);expect(expanded()).toBe('true');
});
it('resume restores an open, unfinished warm-up only until working sets start',()=>{
  mount(fresh());tap(rows()[0]);expect(progress().done).toBe(1);
  const stored=deserializeState(localStorage.getItem(STORAGE_KEY));mount(stored);
  expect(expanded()).toBe('true');expect(rows()[0].getAttribute('aria-checked')).toBe('true');
  const started=structuredClone(stored);started.activeWorkout.exercises[0].sets[0].completed=true;
  mount(started);expect(expanded()).toBe('false');
  expect(node('.workout-warmup-toggle').textContent).toContain(`1/${progress().total} done`);
});
it('logging a working set does not collapse the open warm-up under the person',()=>{
  mount(fresh());expect(expanded()).toBe('true');
  act(()=>setCurrent(prev=>{const next=structuredClone(prev);next.activeWorkout.exercises[0].sets[0].completed=true;return next;}));
  expect(expanded()).toBe('true');
});
it('a saved check gets a short emphasis, the counter refreshes and the next step is marked',()=>{
  mount(fresh());const counter=node('.warmup-inline-progress');
  tap(rows()[0]);
  expect(rows()[0].classList.contains('just-checked')).toBe(true);expect(rows()[1].classList.contains('current')).toBe(true);
  expect(node('.warmup-inline-progress')).not.toBe(counter);expect(node('.warmup-inline-progress').classList.contains('just-updated')).toBe(true);
  expect(node('.warmup-inline-progress').textContent).toBe(`1/${progress().total}`);
  act(()=>vi.advanceTimersByTime(800));expect(rows()[0].classList.contains('just-checked')).toBe(false);
  tap(rows()[0]);expect(host.querySelector('.just-checked')).toBeNull();expect(rows()[0].classList.contains('current')).toBe(true);
});
it('the last check keeps the list open with Continue; Continue collapses into a marked summary',()=>{
  mount(fresh());for(const row of rows())tap(row);
  expect(expanded()).toBe('true');expect(node('.warmup-exit').textContent).toBe('Continue to workout');
  expect(node('.warmup-exit').classList.contains('warmup-finish')).toBe(true);
  tap('.warmup-exit');expect(progress().outcome).toBe('complete');expect(expanded()).toBe('false');
  expect(node('.warmup-summary-check').classList.contains('just-completed')).toBe(true);settle();
  expect(node('.workout-warmup-toggle').textContent).toBe('✓Warm-up complete');
  goTo(1);goTo(0);expect(expanded()).toBe('false');
});
it('Skip in the header bar stays reachable while open and keeps checked steps',()=>{
  mount(fresh());tap(rows()[0]);expect(node('.warmup-skip').getAttribute('aria-label')).toBe('Skip remaining');
  const sets=structuredClone(current.activeWorkout.exercises);tap('.warmup-skip');settle();
  expect(progress().outcome).toBe('partial');expect(expanded()).toBe('false');expect(progress().done).toBe(1);
  expect(current.activeWorkout.exercises).toEqual(sets);
  expect(document.activeElement).toBe(node('.workout-warmup-toggle'));
});
it('restarting the workout opens the first warm-up again',()=>{
  mount(fresh());tap('.workout-warmup-toggle');settle();expect(expanded()).toBe('false');
  act(()=>setCurrent(prev=>({...prev,activeWorkout:{...prev.activeWorkout,startedAt:prev.activeWorkout.startedAt+1000}})));
  expect(expanded()).toBe('true');
});
