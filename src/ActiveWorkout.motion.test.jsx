import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Complete} from './App.jsx';
import {WorkoutMotion} from './WorkoutMotion.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {isoDay, startWorkout, saveState, STORAGE_KEY, deserializeState} from './domain.js';
import {startFreestyleWorkout, addFreestyleExercise} from './freestyleWorkout.js';
import {pairActiveWorkoutExercises} from './supersets.js';

let host, root, current, animations, navigation, liveFinish, reduced;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:00:00'));
  reduced = false; animations = []; navigation = vi.fn(); liveFinish = vi.fn();
  vi.stubGlobal('matchMedia', query => ({matches:query.includes('reduced-motion') && reduced, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const bottom = this.classList.contains('workout-header') ? 61 : 800;
    return {left:0,top:0,right:390,bottom,width:390,height:bottom};
  });
  HTMLElement.prototype.scrollTo = function ({top=0}) {this.scrollTop = top;};
  HTMLElement.prototype.animate = function (frames, timing) {
    const animation = {node:this, frames, timing, cancel:vi.fn()}; animations.push(animation); return animation;
  };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete HTMLElement.prototype.animate;});
function fixture(kind='planned', allDone=false) {
  let state = createReturningUserFixture(0);
  Object.assign(state.profile, {showExerciseImages:false, restTimerEnabled:true, rirEnabled:true});
  state.selectedDate = isoDay();
  if (kind === 'freestyle') {
    state = startFreestyleWorkout(state);
    for (const id of ['barbell-bench-press','push-up','plank']) state = addFreestyleExercise(state,id);
  } else state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.startedAt = Date.now() - 185000;
  state.activeWorkout.exercises = state.activeWorkout.exercises.slice(0,3);
  state.activeWorkout.exercises.forEach((exercise, i) => {
    exercise.sets = exercise.sets.slice(0,1);
    Object.assign(exercise.sets[0], {weight:52.5,reps:12,rir:2,completed:allDone || i===0});
  });
  state.activeWorkout.rest = {startedAt:Date.now(),endsAt:Date.now()+60000,duration:60};
  return state;
}
function mount(initial) {
  function Harness() {
    const [state,setState] = useState(initial), [page,setPage] = useState('workout'), live = useRef(null);
    current = state;
    const update = fn => setState(previous => fn(structuredClone(previous)));
    const navigate = next => {navigation(next); setPage(next);};
    return <WorkoutMotion kind="completion" identity={page}>{page==='workout'
      ? <ActiveWorkout state={state} update={update} setPage={navigate} setDetail={()=>{}} onLiveFinish={event=>{live.current=event;liveFinish(event);}}/>
      : page==='complete' ? <Complete state={state} update={update} setPage={navigate} setDetail={()=>{}} liveFinish={live.current}/>
      : <p>Today</p>}</WorkoutMotion>;
  }
  act(() => root.render(<Harness/>));
}
const find = name => [...host.querySelectorAll('button')].find(node => node.textContent===name || node.getAttribute('aria-label')===name);
const click = name => act(() => find(name).click());
const advance = ms => act(() => vi.advanceTimersByTime(ms));

function pairedWorkout() {
  const state = fixture();
  const workout = state.activeWorkout;
  workout.rest = null;
  const [a, b] = workout.exercises;
  for (const entry of [a, b]) {
    entry.restSeconds = 75;
    entry.sets[0].completed = false;
    entry.sets.push({...entry.sets[0], id:entry.sets[0].id+'-round-2'});
  }
  expect(pairActiveWorkoutExercises(workout.exercises, a.id, b.id, 'pair')).toBe(true);
  return state;
}

it('logs A1 and A2 durably and animates both handoffs without restarting round rest', () => {
  const state = pairedWorkout();
  state.profile.restTimerAutoStart = true;
  mount(state);
  const header = host.querySelector('.workout-header');
  click('Log set 1');
  expect(current.activeWorkout.exerciseIndex).toBe(1);
  expect(deserializeState(localStorage.getItem(STORAGE_KEY)).activeWorkout.exercises[0].sets[0].completed).toBe(true);
  expect(current.activeWorkout.rest).toBeNull();
  expect(animations[1].frames[0].transform).toBe('translateX(10px)');
  expect(document.querySelector('.workout-motion-paint[inert]')).toBeTruthy();
  click('Log set 1');
  expect(current.activeWorkout.exercises[1].sets[0].completed).toBe(false);
  advance(180);
  click('Log set 1');
  expect(current.activeWorkout.exerciseIndex).toBe(0);
  const rest = {seconds:75, endsAt:Date.now()+75000};
  expect(current.activeWorkout.rest).toEqual(rest);
  expect(deserializeState(localStorage.getItem(STORAGE_KEY)).activeWorkout.rest).toEqual(rest);
  expect(animations[3].frames[0].transform).toBe('translateX(-10px)');
  expect(host.querySelector('.workout-header')).toBe(header);
  expect(host.querySelector('[role="status"]').textContent).toMatch(/Set logged\. Next:/);
  advance(180);
  expect(document.querySelector('.workout-motion-paint')).toBeNull();
  expect(current.activeWorkout.rest).toEqual(rest);
});

it('skips motion for an automatic superset handoff with reduced motion', () => {
  reduced = true;
  mount(pairedWorkout());
  click('Log set 1');
  expect(current.activeWorkout.exerciseIndex).toBe(1);
  expect(current.activeWorkout.exercises[0].sets[0].completed).toBe(true);
  expect(animations).toHaveLength(0);
});

it('a failed superset save keeps the same exercise and retries without a phantom handoff', () => {
  const state = pairedWorkout();
  expect(saveState(state)).toBe(true);
  mount(state);
  const write = Storage.prototype.setItem;
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key,value) {
    if (key === STORAGE_KEY) throw new DOMException('Full','QuotaExceededError');
    return write.call(this,key,value);
  });
  click('Log set 1');
  expect(current.activeWorkout.exerciseIndex).toBe(0);
  expect(current.activeWorkout.exercises[0].sets[0].completed).toBe(false);
  expect(host.querySelector('[role="alert"]').textContent).toMatch(/Could not save/);
  expect(animations).toHaveLength(0);
  failure.mockRestore();
  click('Log set 1');
  expect(current.activeWorkout.exerciseIndex).toBe(1);
});

it.each(['planned','freestyle'])('%s: acknowledges then crossfades one exercise unit without animating the header or finishing', kind => {
  const state = fixture(kind), id = state.activeWorkout.id; mount(state);
  const header = host.querySelector('.workout-header'), completed = structuredClone(current.activeWorkout.exercises[0]);
  click('NEXT EXERCISE →');
  expect(find('Exercise complete')).toBeTruthy(); advance(199);
  expect(current.activeWorkout.exerciseIndex).toBe(0); expect(animations).toHaveLength(0);
  advance(1);
  expect(current.activeWorkout.exerciseIndex).toBe(1); expect(current.activeWorkout.id).toBe(id);
  expect(current.activeWorkout.exercises[0]).toEqual({...completed,startedAt:completed.startedAt||Date.now()}); expect(current.activeWorkout.rest).toEqual(state.activeWorkout.rest);
  expect(current.activeWorkout.exercises[1].startedAt).toBe(Date.now());
  expect(host.querySelector('.workout-header')).toBe(header);
  expect(animations).toHaveLength(2); expect(animations.every(a=>a.timing.duration===180)).toBe(true);
  expect(animations[0].frames.at(-1).transform).toBe('translateX(-5px)');
  expect(animations[1].node.classList.contains('exercise-panel')).toBe(true);
  expect(animations[1].frames[0].transform).toBe('translateX(5px)');
  expect(document.querySelector('.workout-motion-paint').hasAttribute('inert')).toBe(true);
  expect(document.querySelector('.workout-motion-paint').style.top).toBe('61px');
  expect(document.querySelector('.workout-motion-paint .workout-screen')).not.toBeNull();
  expect(navigation).not.toHaveBeenCalled(); advance(180);
  expect(document.querySelector('.workout-motion-paint')).toBeNull();
});
it('reveals the next exercise at the top after the skip sheet restores scroll', () => {
  const state = fixture();
  state.activeWorkout.exercises[0].sets[0].completed = false;
  const scroller = document.scrollingElement || document.documentElement;
  const previous = scroller.scrollTop;
  const offset = 440;
  vi.stubGlobal('scrollY', offset);
  window.scrollTo.mockImplementation((_left, top) => { scroller.scrollTop = top; });
  try {
    mount(state);
    scroller.scrollTop = offset;
    click('NEXT EXERCISE →');
    const skip = [...document.querySelectorAll('.workout-confirm button')]
      .find(button => button.textContent === 'SKIP INCOMPLETE SET');
    act(() => skip.click());
    expect(current.activeWorkout.exerciseIndex).toBe(1);
    advance(32);
    expect(scroller.scrollTop).toBe(0);
    expect(document.activeElement).toBe(host.querySelector('.exercise-heading h1'));
  } finally { scroller.scrollTop = previous; }
});
it('final exercise stays active; timer rerenders do not replay exercise motion or remount inputs', () => {
  const state = fixture('planned',true); state.activeWorkout.exerciseIndex=2; mount(state);
  expect(find('NEXT EXERCISE →')).toBeUndefined(); expect(find('FINISH WORKOUT')).toBeTruthy();
  const input = host.querySelector('input'); advance(3000);
  expect(host.querySelector('input')).toBe(input); expect(animations).toHaveLength(0);
  expect(current.activeWorkout).not.toBeNull(); expect(current.workouts).toHaveLength(0);
});
it.each(['planned','freestyle'])('%s: saves before success, ignores a second Finish and leaves no active/rest UI in either transition layer', kind => {
  mount(fixture(kind,true)); const button = find('Finish');
  act(() => {button.click(); button.click();});
  expect(current.activeWorkout).toBeNull(); expect(current.workouts).toHaveLength(1);
  expect(navigation).toHaveBeenCalledExactlyOnceWith('complete'); expect(liveFinish).toHaveBeenCalledOnce();
  const stored = deserializeState(localStorage.getItem(STORAGE_KEY));
  expect(stored.workouts[0].id).toBe(current.workouts[0].id);
  expect(stored.workouts[0].exercises[0].sets[0]).toMatchObject({weight:52.5,reps:12,rir:2,completed:true});
  expect(document.querySelector('.rest-timer')).toBeNull();
  expect(animations).toHaveLength(2); expect(animations.every(a=>a.timing.duration===200)).toBe(true);
  expect(animations[1].node.classList.contains('complete-screen')).toBe(true);
  expect(animations[1].frames[0]).toEqual({opacity:0});
  advance(200); expect(document.querySelector('.workout-motion-paint')).toBeNull();
  const screen = host.querySelector('.complete-screen'); animations=[]; click('About right');
  expect(host.querySelector('.complete-screen')).toBe(screen); expect(animations).toHaveLength(0);
});
it('failed completion keeps all live data and scroll, never announces success, and can retry once storage recovers', () => {
  const state=fixture('planned',true); expect(saveState(state)).toBe(true);
  const saved=localStorage.getItem(STORAGE_KEY); mount(state); host.querySelector('main').scrollTop=460;
  const write=Storage.prototype.setItem;
  const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key===STORAGE_KEY)throw new DOMException('Full','QuotaExceededError');return write.call(this,key,value);});
  click('Finish');
  expect(host.querySelector('.complete-screen')).toBeNull(); expect(current.activeWorkout).toEqual(state.activeWorkout);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(saved); expect(host.querySelector('main').scrollTop).toBe(460);
  expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  expect(navigation).not.toHaveBeenCalled(); expect(liveFinish).not.toHaveBeenCalled(); expect(animations).toHaveLength(0);
  failure.mockRestore(); click('Finish'); expect(current.workouts).toHaveLength(1);
});
it('reduced motion retains the acknowledgement and uses short fades without directional motion', () => {
  reduced=true; mount(fixture()); click('NEXT EXERCISE →');
  expect(find('Exercise complete')).toBeTruthy(); advance(200);
  expect(current.activeWorkout.exerciseIndex).toBe(1); expect(animations).toHaveLength(1);
  expect(animations[0].timing.duration).toBe(80); expect(animations[0].frames).toEqual([{opacity:0},{opacity:1}]);
  advance(80); expect(document.querySelector('.workout-motion-paint')).toBeNull();
});
it('Back during acknowledgement cancels the pending exercise change', () => {
  mount(fixture()); click('NEXT EXERCISE →'); click('Back to Today'); advance(1000);
  expect(current.activeWorkout.exerciseIndex).toBe(0); expect(current.workouts).toHaveLength(0);
  expect(navigation).toHaveBeenCalledExactlyOnceWith('today'); expect(animations).toHaveLength(0);
});
