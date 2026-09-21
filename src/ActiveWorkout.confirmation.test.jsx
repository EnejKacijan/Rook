import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Detail, ModalLayer} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let host, root, current, navigate, reduced;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-09-21T12:00:00')); reduced = false;
  vi.stubGlobal('matchMedia', query => ({matches: query.includes('reduced-motion') && reduced, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({top = 0} = {}) { this.scrollTop = top; };
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); navigate = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const panel = () => document.querySelector('.workout-confirm');
const click = element => act(() => element.click());
const button = text => [...document.querySelectorAll('button')].find(n => n.textContent.trim() === text);
function mount() {
  const initial = createReturningUserFixture(0);
  initial.profile.showExerciseImages = false; initial.profile.restTimerEnabled = false;
  initial.activeWorkout = startWorkout(initial, initial.program.days[0]);
  Object.assign(initial.activeWorkout.exercises[0].sets[0], {weight:40, reps:8, completed:true});
  function Harness() {
    const [state, setState] = useState(initial); current = state;
    return <ActiveWorkout state={state} update={fn => setState(previous => fn(structuredClone(previous)))} setPage={navigate} setDetail={() => {}}/>;
  }
  act(() => root.render(<Harness/>));
  const trigger = button('Finish'); act(() => trigger.focus()); click(trigger); advance(300);
  Object.defineProperty(panel(), 'offsetHeight', {configurable:true, value:360});
  vi.spyOn(panel(), 'getBoundingClientRect').mockReturnValue({top:484, bottom:844, left:0, right:390, width:390, height:360});
  return trigger;
}
function pointer(type, target, y) {
  const event = new Event(type, {bubbles:true, cancelable:true});
  Object.assign(event, {clientY:y, clientX:195, pointerId:7, pointerType:'mouse', button:0});
  act(() => target.dispatchEvent(event));
}
it.each([false, true])('Finish confirmation owns focus/background and Escape returns unchanged (%s reduced)', motion => {
  reduced = motion; const trigger = mount(), before = structuredClone(current);
  expect(host.querySelector('[data-active-workout]').inert).toBe(true);
  expect(document.body.style.position).toBe('fixed');
  expect(panel().closest('[aria-hidden="true"]')).toBeNull();
  expect(panel().getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(button('KEEP TRAINING'));
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})));
  advance(220); act(() => vi.advanceTimersToNextFrame());
  expect(panel()).toBeNull(); expect(document.body.style.position).toBe('');
  expect(host.querySelector('[data-active-workout]').inert).toBe(false);
  expect(document.activeElement).toBe(trigger); expect(current).toEqual(before); expect(navigate).not.toHaveBeenCalled();
});
it('a cancelled pointer drag never dismisses Finish confirmation', () => {
  mount(); const before = structuredClone(current), target = panel().querySelector('[aria-label="Drag down or tap to close"]');
  pointer('pointerdown', target, 100); advance(200); pointer('pointermove', target, 270);
  expect(panel().style.transform).toBe('translateY(170px)');
  pointer('pointercancel', target, 270); advance(250);
  expect(panel()).not.toBeNull(); expect(['', 'translateY(0px)']).toContain(panel().style.transform);
  expect(current).toEqual(before); expect(navigate).not.toHaveBeenCalled();
});
it.each(['resize', 'blur', 'visibilitychange', 'lostpointercapture'])('%s resets the shared confirmation handle without changing the session', reason => {
  mount(); const before = structuredClone(current), target = panel().querySelector('.modal-drag-handle');
  pointer('pointerdown', target, 100); advance(150); pointer('pointermove', target, 140);
  act(() => (reason === 'visibilitychange' ? document : reason === 'lostpointercapture' ? target : window).dispatchEvent(new Event(reason, {bubbles:true})));
  advance(250); expect(panel().style.transform).toBe(''); expect(current).toEqual(before);
});
it('the remaining legacy Change plan handle also cancels pointer drag without closing', () => {
  const close = vi.fn(), backgroundRef = {current:host}, state = createReturningUserFixture(0);
  act(() => root.render(<ModalLayer close={close} backgroundRef={backgroundRef}>{requestClose => <Detail detail="change-plan" state={state} update={() => {}} close={requestClose} setDetail={() => {}}/>}</ModalLayer>));
  advance(300); const sheet = document.querySelector('.change-plan-sheet'), target = sheet.querySelector('.sheet-grab-zone');
  Object.defineProperty(sheet, 'offsetHeight', {configurable:true, value:400});
  pointer('pointerdown', target, 100); advance(200); pointer('pointermove', target, 270); pointer('pointercancel', target, 270); advance(450);
  expect(close).not.toHaveBeenCalled(); expect(sheet.style.transform).toBe('translateY(0px)');
});
it('Finish anyway still stores one completed workout and only performed sets', () => {
  mount(); const before = structuredClone(current), selected = before.activeWorkout;
  click(button('FINISH ANYWAY')); advance(1000);
  expect(current.activeWorkout).toBeNull(); expect(current.workouts).toHaveLength(before.workouts.length + 1);
  const completed = current.workouts.at(-1);
  expect(completed.exercises.flatMap(e => e.sets).filter(s => s.completed)).toHaveLength(1);
  expect(current.program).toEqual(before.program); expect(selected.exercises[0].sets[0].completed).toBe(true);
  expect(navigate).toHaveBeenCalledOnce();
});
