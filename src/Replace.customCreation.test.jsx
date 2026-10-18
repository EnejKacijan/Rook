import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Detail, ModalLayer} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {deserializeState, saveState, serializeState, startWorkout} from './domain.js';

vi.mock('./domain.js', async original => ({...await original(), saveState: vi.fn(() => true)}));
let host, root, current, change, closed;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.scrollIntoView = () => {};
  saveState.mockReset().mockReturnValue(true); closed = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();});
function mount({freestyle = false, restricted = false} = {}) {
  const initial = createReturningUserFixture(0); initial.profile.showExerciseImages = false;
  initial.activeWorkout = startWorkout(initial, initial.program.days[0]);
  initial.activeWorkout.exerciseIndex = 1;
  Object.assign(initial.activeWorkout.exercises[0].sets[0], {completed: true, weight: 40, reps: 8});
  if (freestyle) {initial.activeWorkout.source = 'freestyle'; initial.program = null;}
  if (restricted) initial.profile.avoid = 'avoid My barbell row';
  const exercise = initial.activeWorkout.exercises[1];
  function Harness() {
    const [state, setState] = useState(initial); current = state;
    change = operation => setState(previous => operation(structuredClone(previous)));
    return <ModalLayer close={closed} backgroundRef={{current: null}}>
      <Detail detail={{replace: exercise}} state={state} update={change} close={closed} setDetail={() => {}} />
    </ModalLayer>;
  }
  act(() => root.render(<Harness />)); return structuredClone(initial);
}
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const editor = () => document.querySelector('.custom-exercise-editor');
const search = () => document.querySelector('[aria-label="Search all available exercises"]');
const click = node => {expect(node).toBeTruthy(); act(() => node.click());};
const field = label => editor().querySelector(`[aria-label="${label}"]`);
function type(node, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  });
}
async function open(query = 'Lateral single-arm raise') {
  await act(async () => {await vi.advanceTimersByTimeAsync(250);});
  click(button('Search all exercises')); type(search(), query);
}
function create() {click(document.querySelector('[aria-label="Create custom exercise"]'));}
async function dismiss() {click(editor().querySelector('[aria-label="Back"]')); await act(async () => {await vi.advanceTimersByTimeAsync(250);});}
function fill({equipment = 'cables'} = {}) {
  type(field('Exercise equipment'), equipment); type(field('Primary target muscle'), 'Back');
  type(field('Exercise movement'), 'horizontal-pull');
}
const customRow = () => [...document.querySelectorAll('.replace-sheet .choice-row')].find(node => node.querySelector('strong')?.textContent === current.customExercises.at(-1)?.name);

it.each(['lateral singl', 'zznonexistent movement'])('offers inline creation even with partial or empty results for %s', async query => {
  mount(); await open(query);
  const action = document.querySelector('[aria-label="Create custom exercise"]');
  expect(action).not.toBeNull(); expect(action.closest('[data-exercise-search-scroll]')).not.toBeNull();
  if (query === 'lateral singl') expect(document.querySelectorAll('.replace-sheet .choice-row').length).toBeGreaterThan(0);
  create(); expect(field('Exercise name').value).toBe(query);
  expect(document.querySelector('.replace-sheet').inert).toBe(true);
});
it('Back cancels creation without changing data and preserves the exact replacement query', async () => {
  const before = mount(); await open('My single-arm lateral raise'); create();
  type(field('Exercise name'), 'Unsubmitted draft'); await dismiss();
  expect(editor()).toBeNull(); expect(search().value).toBe('My single-arm lateral raise');
  expect(current).toEqual(before); expect(saveState).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
});
it('creates once in the library, retains search after compatible suggestions refresh, then uses canonical replacement', async () => {
  const before = mount(); await open('My cable row'); create(); fill();
  const save = button('CREATE EXERCISE', editor()); click(save); click(save);
  expect(editor()).toBeNull(); expect(current.customExercises).toHaveLength(before.customExercises.length + 1);
  expect(saveState).toHaveBeenCalledOnce(); expect(search().value).toBe('My cable row');
  expect(customRow()).toBeTruthy(); expect(current.activeWorkout).toEqual(before.activeWorkout);
  click(customRow()); const replaced = current.activeWorkout.exercises[1];
  expect(replaced).toMatchObject({id: before.activeWorkout.exercises[1].id, exerciseId: current.customExercises.at(-1).id, exerciseSource: 'custom', importedName: 'My cable row'});
  expect(replaced.sets.every(set => !set.completed && set.weight === null)).toBe(true);
  expect(current.activeWorkout.exercises[0]).toEqual(before.activeWorkout.exercises[0]);
  expect(current.program).toEqual(before.program); expect(current.workouts).toEqual(before.workouts); expect(current.profile).toEqual(before.profile);
  expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
  await act(async () => {await vi.advanceTimersByTimeAsync(250);}); expect(closed).toHaveBeenCalledOnce();
  const reloaded = deserializeState(serializeState(current), {strict: true});
  expect(reloaded.customExercises.at(-1).id).toBe(replaced.exerciseId);
});
it('leaves the form and session intact after failed persistence and permits one successful retry', async () => {
  const before = mount(); await open('New row'); create(); fill(); saveState.mockReturnValue(false);
  click(button('CREATE EXERCISE', editor())); expect(editor()).not.toBeNull(); expect(editor().textContent).toContain('Couldn’t save');
  expect(current).toEqual(before); expect(field('Exercise name').value).toBe('New row');
  saveState.mockReturnValue(true); click(button('CREATE EXERCISE', editor()));
  expect(editor()).toBeNull(); expect(current.customExercises).toHaveLength(before.customExercises.length + 1); expect(customRow()).toBeTruthy();
});
it('keeps training restrictions when a new library exercise is not an allowed replacement', async () => {
  const before = mount({restricted: true}); await open('My barbell row'); create(); fill({equipment: 'barbell'}); click(button('CREATE EXERCISE', editor()));
  expect(current.customExercises.at(-1).name).toBe('My barbell row'); expect(customRow()).toBeUndefined();
  expect(document.querySelector('.replace-sheet').textContent).toContain('No available exercise matches');
  expect(document.querySelector('.replace-sheet').textContent).toContain('saved to your library, but it isn’t available');
  expect(current.activeWorkout).toEqual(before.activeWorkout); expect(closed).not.toHaveBeenCalled();
});
it('does not register a draft into another profile or workout after the context changes', async () => {
  mount(); await open('Draft row'); create(); fill();
  act(() => change(state => {state.profile.id = 'another-owner'; return state;}));
  click(button('CREATE EXERCISE', editor())); expect(current.customExercises).toHaveLength(0);
  expect(saveState).not.toHaveBeenCalled(); expect(editor()).not.toBeNull(); expect(closed).not.toHaveBeenCalled();
});
it('supports the same inline creation when replacing in a no-plan freestyle workout', async () => {
  mount({freestyle: true}); await open('Freestyle cable row'); create(); fill(); click(button('CREATE EXERCISE', editor()));
  expect(customRow()).toBeTruthy(); click(customRow());
  expect(current.program).toBeNull(); expect(current.activeWorkout.source).toBe('freestyle');
  expect(current.activeWorkout.exercises[1].exerciseSource).toBe('custom');
});
