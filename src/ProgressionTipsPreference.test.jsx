import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, ActiveWorkoutOptions, Profile} from './App.jsx';
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
    const [state, setState] = useState(initial), [view, setView] = useState(startPage),[detail,setDetail]=useState(null); current = state; page = setView;
    change = operation => setState(previous => operation(structuredClone(previous)));
    return view === 'profile' ? <Profile state={state} update={change} setDetail={() => {}} setPage={setView}/>
      : <><ActiveWorkout state={state} update={change} setDetail={setDetail} setPage={setView}/>{detail?.workoutOptions&&<ActiveWorkoutOptions {...detail} state={state} update={change} workout={state.activeWorkout} close={()=>setDetail(null)}/>}</>;
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
async function settings() {await options();click(button('Progression settings'));await settle();return document.querySelector('.progression-guidance-settings');}
async function mainSettings(){click(host.querySelector('[aria-label="Workout options"]'));click(button('Progression settings'));await settle();}
async function preferences() {act(() => page('profile')); click(host.querySelector('[data-profile-area="preferences"]')); await settle();}
const mode = label => [...document.querySelectorAll('[aria-label="Progression guidance"] [role="radio"]')].find(node=>node.textContent===label);
const toggle = () => mode(current.profile.showProgressionTips === false ? 'Basic' : 'Off');

it.each([true, undefined])('retains advice for new and legacy profiles (flag %s)', flag => {
  const initial = fixture(); if (flag === undefined) delete initial.profile.showProgressionTips;
  mount(initial); expect(blankState().profile.showProgressionTips).toBe(true);
  expect(tip()).not.toBeNull(); expect(tip().textContent).toContain('41');
});
it('opening settings never hides tips or writes defaults and clearly explains global scope',async()=>{
  mount();const before=structuredClone(current);await settings();
  expect(current).toEqual(before);expect(saveState).not.toHaveBeenCalled();expect(tip()).not.toBeNull();
  expect(document.body.textContent).toContain('Applies to this workout and all future workouts.');expect(document.body.textContent).toContain('Profile → Workout preferences');
  click(mode('Basic'));expect(saveState).not.toHaveBeenCalled();click(button('Back to workout'));await settle();expect(tip()).not.toBeNull();expect(current).toEqual(before);
});
it('Off persists only the preference while keeping the workout, history and recommendation engine unchanged',async()=>{
  mount();const before=structuredClone(current),advice=nextWorkoutAdvice(before.activeWorkout.exercises[0],before.workouts,before.profile),progress=selectProgressionRows(before);
  await settings();click(mode('Off'));expect(current.profile.showProgressionTips).toBe(false);expect(tip()).toBeNull();expect(document.querySelector('.progression-guidance-settings')).not.toBeNull();
  expect(current.activeWorkout).toEqual(before.activeWorkout);expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  expect(nextWorkoutAdvice(current.activeWorkout.exercises[0],current.workouts,current.profile)).toEqual(advice);expect(selectProgressionRows(current)).toEqual(progress);
  expect(saveState).toHaveBeenCalledOnce();const restored=deserializeState(serializeState(current),{strict:true});expect(restored.profile.showProgressionTips).toBe(false);
  click(button('Back to workout'));await settle();expect(document.activeElement).toBe(host.querySelector('.workout-options-trigger'));
});
it('allows re-enabling from Workout options even after the entire tip card disappears',async()=>{
  const initial=fixture();initial.profile.showProgressionTips=false;mount(initial);const before=structuredClone(current.activeWorkout);
  expect(tip()).toBeNull();await mainSettings();expect(mode('Off').getAttribute('aria-checked')).toBe('true');click(mode('Basic'));
  expect(current.profile.showProgressionTips).toBe(true);expect(tip()).not.toBeNull();expect(current.activeWorkout).toEqual(before);expect(saveState).toHaveBeenCalledOnce();
  click(button('Back to workout'));await settle();expect(document.querySelector('.progression-guidance-settings')).toBeNull();
});
it('uses the same persisted setting in Profile and resumes the active workout',async()=>{
  const initial=fixture();initial.profile.showProgressionTips=false;mount(initial);const before=structuredClone(current);
  await preferences();expect(mode('Off').getAttribute('aria-checked')).toBe('true');click(toggle());expect(saveState).toHaveBeenCalledOnce();
  expect(current.activeWorkout).toEqual(before.activeWorkout);expect(current.workouts).toEqual(before.workouts);act(()=>page('workout'));expect(tip()).not.toBeNull();
});
it('keeps a raw logger draft mounted through settings, Off, Basic and return',async()=>{
  mount();const input=host.querySelector('[data-workout-field="weight"] input');
  act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'082,50');input.dispatchEvent(new Event('input',{bubbles:true}));});
  const before=structuredClone(current.activeWorkout);await settings();click(mode('Off'));click(mode('Basic'));click(button('Back to workout'));await settle();
  expect(host.querySelector('[data-workout-field="weight"] input')).toBe(input);expect(input.value).toBe('082,50');expect(current.activeWorkout).toEqual(before);expect(saveState).toHaveBeenCalledTimes(2);
});
it('a failed setting write retains the selected mode and is retryable without leaving settings',async()=>{
  mount();const before=structuredClone(current);await settings();saveState.mockReturnValue(false);click(mode('Off'));
  expect(current).toEqual(before);expect(mode('Basic').getAttribute('aria-checked')).toBe('true');expect(document.querySelector('[role="alert"]')).not.toBeNull();
  saveState.mockReturnValue(true);click(mode('Off'));expect(current.profile.showProgressionTips).toBe(false);expect(document.querySelector('.progression-guidance-settings')).not.toBeNull();
});
it('a failed direct Profile write leaves the saved preference unchanged',async()=>{
  mount();await preferences();saveState.mockReturnValue(false);click(toggle());expect(current.profile.showProgressionTips).toBe(true);expect(mode('Basic').getAttribute('aria-checked')).toBe('true');expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('does not write a default for legacy profiles when their already selected Basic is clicked',async()=>{
  const initial=fixture();delete initial.profile.showProgressionTips;mount(initial);await settings();click(mode('Basic'));expect(saveState).not.toHaveBeenCalled();expect(current.profile.showProgressionTips).toBeUndefined();
});
it.each(['profile','session'])('rejects a stale settings sheet after the %s owner changes',async kind=>{
  mount();await settings();act(()=>change(state=>{if(kind==='profile')state.profile.id='different';else state.activeWorkout.id='different';return state;}));
  expect(document.querySelector('.progression-guidance-settings [role="alert"]')).not.toBeNull();expect(mode('Off')).toBeUndefined();expect(saveState).not.toHaveBeenCalled();
});
it('does not add advice to a session that was already ineligible',()=>{const initial=fixture();initial.activeWorkout.source='freestyle';mount(initial);expect(tip()).toBeNull();});

it('a failed progression Apply stays retryable, then one Undo restores the exact eligible set values',()=>{
  mount();const before=structuredClone(current),apply=()=>host.querySelector('.recommendation button[data-workout-replaces]');
  saveState.mockReturnValue(false);click(apply());expect(current).toEqual(before);expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  expect(button('Undo')).toBeUndefined();saveState.mockReturnValue(true);click(apply());
  expect(current.activeWorkout.exercises[0].sets.map(set=>set.weight)).toEqual([41,41]);
  click(button('Undo'));expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
  expect(current.workouts).toEqual(before.workouts);expect(current.program).toEqual(before.program);
});
it('Apply counts and preserves manually adjusted sets while Why stays available without touching training data',()=>{
  const state=fixture();Object.assign(state.activeWorkout.exercises[0].sets[1],{weight:42,weightEntryMode:'manual',weightProvenance:'explicit'});mount(state);
  const before=structuredClone(current),why=host.querySelector('.recommendation summary');
  expect(why.getAttribute('aria-expanded')).toBe('false');click(why);expect(why.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.progression-evidence').textContent).toContain('Two complete sessions');expect(current).toEqual(before);expect(saveState).not.toHaveBeenCalled();
  const apply=host.querySelector('.recommendation button[data-workout-replaces]');expect(apply.getAttribute('aria-label')).toContain('1 remaining set');click(apply);
  expect(current.activeWorkout.exercises[0].sets.map(set=>set.weight)).toEqual([41,42]);
});

it('settings leave the running rest timer and workout start untouched',async()=>{
  const initial=fixture();initial.profile.restTimerEnabled=true;initial.activeWorkout.rest={seconds:90,endsAt:Date.now()+90000};mount(initial);
  const before=structuredClone(current.activeWorkout);await settings();click(mode('Off'));await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});click(button('Back to workout'));await settle();
  expect(current.activeWorkout).toEqual(before);expect(current.activeWorkout.rest.endsAt).toBe(before.rest.endsAt);expect(current.activeWorkout.startedAt).toBe(before.startedAt);
});
