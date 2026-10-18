import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Profile} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {blankState, deserializeState, saveState, serializeState, startWorkout} from './domain.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {selectProgressionRows} from './progressionOverview.js';

vi.mock('./domain.js', async original => ({...await original(), saveState: vi.fn(() => true)}));
let host, root, current, change, page;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.scrollIntoView = () => {};
  saveState.mockReset().mockReturnValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();});
function fixture() {
  const state = createReturningUserFixture(0);
  Object.assign(state.profile, {showExerciseImages: false, restTimerEnabled: false, increments: {...state.profile.increments, barbell: 1}});
  const exercise = state.program.days[0].exercises[0];
  Object.assign(exercise, {exerciseId: 'barbell-bench-press', repMin: 6, repMax: 8, targetRir: 1, defaultIncrement: 1});
  exercise.sets = exercise.sets.slice(0, 2);
  state.workouts = ['2026-10-01', '2026-10-08'].map((date, i) => ({
    id: `tips-history-${i}`, name: 'Upper A', startedAt: `${date}T12:00:00Z`, completedAt: `${date}T13:00:00Z`, durationSeconds: 3600,
    exercises: [{...structuredClone(exercise), sets: exercise.sets.map(set => ({...set, planned: true, completed: true, weight: 40, reps: 8, rir: 1}))}],
  }));
  state.activeWorkout = startWorkout(state, state.program.days[0]); return state;
}
function mount(initial = fixture(), startPage = 'workout') {
  function Harness() {
    const [state, setState] = useState(initial), [view, setView] = useState(startPage); current = state; page = setView;
    change = operation => setState(previous => operation(structuredClone(previous)));
    return view === 'profile' ? <Profile state={state} update={change} setDetail={() => {}} setPage={setView}/>
      : <ActiveWorkout state={state} update={change} setDetail={() => {}} setPage={setView}/>;
  }
  act(() => root.render(<Harness/>)); return initial;
}
const tip = () => host.querySelector('.recommendation');
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = node => {expect(node).toBeTruthy(); act(() => node.click());};
const settle = async () => act(async () => {await vi.advanceTimersByTimeAsync(250);});
async function options() {
  click(host.querySelector('[aria-label="Progression tip options"]')); await settle();
  return document.querySelector('.progression-tips-options-sheet');
}
async function hide() {await options(); click(button('Hide progression tips')); await settle();}
async function preferences() {act(() => page('profile')); click(host.querySelector('[data-profile-area="preferences"]')); await settle();}
const mode = label => [...host.querySelectorAll('[aria-label="Progression guidance"] [role="radio"]')].find(node=>node.textContent===label);
const toggle = () => mode(current.profile.showProgressionTips === false ? 'Basic' : 'Off');

it.each([true, undefined])('retains advice for new and legacy profiles (flag %s)', flag => {
  const initial = fixture(); if (flag === undefined) delete initial.profile.showProgressionTips;
  mount(initial); expect(blankState().profile.showProgressionTips).toBe(true);
  expect(tip()).not.toBeNull(); expect(tip().textContent).toContain('41');
});
it('hides all proactive tips persistently without changing logging, targets, history, the engine or Progress', async () => {
  const initial = mount(), before = structuredClone(current), progress = selectProgressionRows(before);
  const advice = nextWorkoutAdvice(before.activeWorkout.exercises[0], before.workouts, before.profile);
  await hide(); expect(tip()).toBeNull(); expect(current.profile.showProgressionTips).toBe(false);
  expect(current.activeWorkout).toEqual(before.activeWorkout); expect(current.program).toEqual(before.program); expect(current.workouts).toEqual(before.workouts);
  expect(nextWorkoutAdvice(current.activeWorkout.exercises[0], current.workouts, current.profile)).toEqual(advice);
  expect(selectProgressionRows(current)).toEqual(progress); expect(saveState).toHaveBeenCalledOnce();
  const restored = deserializeState(serializeState(current), {strict: true}); expect(restored.profile.showProgressionTips).toBe(false);
  act(() => root.render(null)); mount(restored); expect(tip()).toBeNull();
  expect(initial.profile.showProgressionTips).toBe(true);
});
it('offers the same persisted switch directly in Workout preferences and can turn cards back on', async () => {
  const initial = fixture(); initial.profile.showProgressionTips = false; mount(initial);
  const before = structuredClone(current); await preferences();
  expect(mode('Off').getAttribute('aria-checked')).toBe('true'); expect(host.textContent).toContain('Your logs and Progress stay unchanged');
  click(toggle()); expect(current.profile.showProgressionTips).toBe(true); expect(saveState).toHaveBeenCalledOnce();
  expect(current.activeWorkout).toEqual(before.activeWorkout); expect(current.workouts).toEqual(before.workouts);
  act(() => page('workout')); expect(tip()).not.toBeNull();
});
it('Undo restores visibility exactly once while preserving the whole workout', async () => {
  mount(); const before = structuredClone(current.activeWorkout); await hide();
  const undo = button('Undo'); expect(undo).toBeTruthy(); click(undo); click(undo);
  expect(current.profile.showProgressionTips).toBe(true); expect(tip()).not.toBeNull(); expect(current.activeWorkout).toEqual(before);
  expect(saveState).toHaveBeenCalledTimes(2);
});
it('opening, cancelling and hiding tips preserves a pending raw logger draft', async () => {
  mount(); const input = host.querySelector('[data-workout-field="weight"] input');
  act(() => {input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '082,50'); input.dispatchEvent(new Event('input', {bubbles: true}));});
  const before = structuredClone(current.activeWorkout);
  const menu = await options(); click(menu.querySelector('[aria-label="Close"]')); await settle();
  expect(input.value).toBe('082,50'); expect(current.activeWorkout).toEqual(before); expect(saveState).not.toHaveBeenCalled();
  await hide(); expect(input.value).toBe('082,50'); expect(current.activeWorkout).toEqual(before);
  click(button('Undo')); expect(input.value).toBe('082,50'); expect(current.activeWorkout).toEqual(before);
});
it('failed hide keeps the visible card and menu retryable; failed Undo does not claim success', async () => {
  mount(); const before = structuredClone(current); await options(); saveState.mockReturnValue(false);
  click(button('Hide progression tips')); expect(tip()).not.toBeNull(); expect(document.querySelector('[role="alert"]')).not.toBeNull(); expect(current).toEqual(before);
  saveState.mockReturnValue(true); click(button('Hide progression tips')); await settle(); expect(tip()).toBeNull();
  saveState.mockReturnValue(false); click(button('Undo')); expect(current.profile.showProgressionTips).toBe(false); expect(button('Undo')).toBeTruthy();
  saveState.mockReturnValue(true); click(button('Undo')); expect(tip()).not.toBeNull();
});
it('a failed settings write leaves the saved preference unchanged', async () => {
  mount(); await preferences(); saveState.mockReturnValue(false); click(toggle());
  expect(current.profile.showProgressionTips).toBe(true); expect(mode('Basic').getAttribute('aria-checked')).toBe('true'); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('does not add advice to a session that was already ineligible', () => {
  const initial = fixture(); initial.activeWorkout.source = 'freestyle'; mount(initial); expect(tip()).toBeNull();
});
it('Undo only restores its preference, retaining other settings changed meanwhile', async () => {
  mount(); await hide();
  act(() => change(state => {state.profile.units = 'lb'; return state;}));
  click(button('Undo')); expect(current.profile.units).toBe('lb'); expect(current.profile.showProgressionTips).toBe(true);
});
it('a profile switch invalidates the old Undo instead of modifying the new owner', async () => {
  mount(); await hide(); const oldUndo = button('Undo');
  act(() => change(state => {state.profile.id = 'other-profile'; return state;}));
  expect(button('Undo')).toBeUndefined(); click(oldUndo);
  expect(current.profile.id).toBe('other-profile'); expect(current.profile.showProgressionTips).toBe(false);
});
