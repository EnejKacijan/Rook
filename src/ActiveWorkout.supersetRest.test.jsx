// @vitest-environment jsdom
import React, { act, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveWorkout } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { deserializeState, serializeState, startWorkout } from './domain.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current, change;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.getAnimations = () => [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture({ enabled = false, autoStart = true, seconds = null, member = 1, pairRest = 75 } = {}) {
  const state = createReturningUserFixture(0);
  Object.assign(state.profile, {
    showExerciseImages: false, recommendedWarmupsEnabled: false, rampUpSetsEnabled: false,
    restTimerEnabled: enabled, restTimerAutoStart: autoStart, restTimerSeconds: seconds,
  });
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.exercises = state.activeWorkout.exercises.slice(0, 2);
  state.activeWorkout.exercises.forEach(exercise => {
    exercise.supersetId = 'test-pair';
    exercise.restSeconds = pairRest;
    exercise.sets = exercise.sets.slice(0, 2);
    exercise.sets.forEach(set => Object.assign(set, { weight: 40, reps: 12, completed: false }));
  });
  if (member === 1) {
    Object.assign(state.activeWorkout.exercises[0].sets[0], { completed: true, completedAt: Date.now() - 5000 });
  }
  state.activeWorkout.exerciseIndex = member;
  state.activeWorkout.rest = null;
  return state;
}
function mount(initial) {
  function Harness() {
    const [state, setState] = useState(initial);
    current = state;
    change = fn => setState(previous => fn(structuredClone(previous)));
    return <ActiveWorkout state={state} update={change} setPage={() => {}} setDetail={() => {}} />;
  }
  act(() => root.render(<StrictMode><Harness /></StrictMode>));
}
const hint = () => host.querySelector('.superset-next-step');
const log = () => act(() => host.querySelector('[aria-label="Log set 1"]').click());

it('disabled rest timer hides the rest instruction, including after a serialized reload', () => {
  mount(deserializeState(serializeState(fixture()), { strict: true }));
  expect(hint()).toBeNull();
  expect(host.textContent).not.toContain('Rest after both');
  expect(host.querySelector('.rest-timer')).toBeNull();
  expect(current.profile.restTimerEnabled).toBe(false);
  expect(current.activeWorkout.exercises[0].sets[0].completed).toBe(true);
});
it('disabled rest timer preserves the next-exercise instruction within the pair', () => {
  mount(fixture({ member: 0 }));
  expect(hint().textContent).toMatch(/^Next: /);
  expect(host.textContent).not.toContain('Rest after both');
});
it.each([true, false])('enabled rest timer retains the instruction with auto-start %s', autoStart => {
  mount(fixture({ enabled: true, autoStart }));
  expect(hint().textContent).toBe('Rest after both · 1:15');
});
it('the displayed duration follows the configured rest override', () => {
  mount(fixture({ enabled: true, seconds: 90 }));
  expect(hint().textContent).toBe('Rest after both · 1:30');
  log();
  expect(current.activeWorkout.rest).toMatchObject({ seconds: 90, endsAt: Date.now() + 90000 });
});
it('a pair without a rest duration shows no rest instruction', () => {
  mount(fixture({ enabled: true, pairRest: 0 }));
  expect(hint()).toBeNull();
});
it('changing the preference updates the hint immediately without changing the session or history', () => {
  mount(fixture({ enabled: true }));
  const before = structuredClone(current);
  act(() => change(state => { state.profile.restTimerEnabled = false; return state; }));
  expect(hint()).toBeNull();
  expect(current.activeWorkout).toEqual(before.activeWorkout);
  expect(current.program).toEqual(before.program);
  expect(current.workouts).toEqual(before.workouts);
  act(() => change(state => { state.profile.restTimerEnabled = true; return state; }));
  expect(hint().textContent).toBe('Rest after both · 1:15');
  expect(current.activeWorkout).toEqual(before.activeWorkout);
});
it('finishing a pair round with rest disabled still advances to the partner without creating a timer', () => {
  mount(fixture());
  const before = structuredClone(current);
  log();
  expect(current.activeWorkout.exerciseIndex).toBe(0);
  expect(current.activeWorkout.exercises[1].sets[0].completed).toBe(true);
  expect(current.activeWorkout.rest).toBeNull();
  expect(current.activeWorkout.id).toBe(before.activeWorkout.id);
  expect(current.program).toEqual(before.program);
  expect(current.workouts).toEqual(before.workouts);
  expect(hint().textContent).toMatch(/^Next: /);
});
it.each([true, false])('finishing a pair round preserves enabled timer behavior with auto-start %s', autoStart => {
  mount(fixture({ enabled: true, autoStart }));
  log();
  expect(current.activeWorkout.rest).toEqual(autoStart
    ? { seconds: 75, endsAt: Date.now() + 75000 }
    : { seconds: 75, pending: true });
  expect(current.activeWorkout.exerciseIndex).toBe(0);
});

it.each([true,false])('a new superset round replaces previous rest only when its second member completes (%s auto)',autoStart=>{
  const state=fixture({enabled:true,autoStart,member:0});
  state.activeWorkout.exercises.push(structuredClone(state.program.days[0].exercises[2]));
  state.activeWorkout.exercises.forEach(exercise=>Object.assign(exercise.sets[0],{completed:true,completedAt:Date.now()-10000}));
  state.activeWorkout.rest=autoStart?{seconds:20,endsAt:Date.now()+15000}:{seconds:20,pending:true};
  const previous=structuredClone(state.activeWorkout.rest);mount(state);
  act(()=>host.querySelector('[aria-label="Log set 2"]').click());
  expect(current.activeWorkout.exerciseIndex).toBe(1);expect(current.activeWorkout.rest).toEqual(previous);
  act(()=>vi.advanceTimersByTime(1000));act(()=>host.querySelector('[aria-label="Log set 2"]').click());
  expect(current.activeWorkout.rest).toEqual(autoStart?{seconds:75,endsAt:Date.now()+75000}:{seconds:75,pending:true});
  expect(current.activeWorkout.exercises.slice(0,2).every(exercise=>exercise.sets.every(set=>set.completed))).toBe(true);
});
it('an expired previous rest cannot prevent the next completed superset round from starting its rest',()=>{
  const state=fixture({enabled:true});state.activeWorkout.rest={seconds:75,endsAt:Date.now()-1000};mount(state);log();
  expect(current.activeWorkout.rest).toEqual({seconds:75,endsAt:Date.now()+75000});
});

it.each([true,false])('the final superset round removes rest instead of offering another break (%s auto)',autoStart=>{
 const state=fixture({enabled:true,autoStart,member:0});state.activeWorkout.exercises.forEach(exercise=>Object.assign(exercise.sets[0],{completed:true,completedAt:Date.now()-10000}));
 state.activeWorkout.rest=autoStart?{seconds:75,endsAt:Date.now()+60000}:{seconds:75,pending:true};mount(state);
 act(()=>host.querySelector('[aria-label="Log set 2"]').click());expect(current.activeWorkout.rest).not.toBeNull();
 act(()=>vi.advanceTimersByTime(1000));act(()=>host.querySelector('[aria-label="Log set 2"]').click());
 expect(current.activeWorkout.exercises.every(exercise=>exercise.sets.every(set=>set.completed))).toBe(true);expect(current.activeWorkout.rest).toBeNull();expect(host.querySelector('.rest-timer')).toBeNull();expect(hint()).toBeNull();
});
