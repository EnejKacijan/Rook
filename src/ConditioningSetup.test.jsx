import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ConditioningSheet} from './ConditioningSheet.jsx';
import {ModalLayer, SheetHeader} from './App.jsx';
import * as domain from './domain.js';
import * as optional from './optionalActivity.js';
import {useAnimationClock} from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, initial, current, navigate, save;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = node => act(() => node.click());
const button = label => document.querySelector(`[aria-label="${label}"]`);
const radio = label => [...document.querySelectorAll('[role="radio"]')].find(node => node.textContent === label);
const start = () => document.querySelector('.conditioning-action-footer button');
const output = label => document.querySelector(`output[aria-label="${label}"]`).textContent;

beforeEach(() => {
  useAnimationClock();
  vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({top = 0} = {}) {this.scrollTop = top;};
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
  save = vi.spyOn(domain, 'saveState').mockReturnValue(true);
  initial = domain.blankState();
  Object.assign(initial.profile, {goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Sun', 'Tue'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true});
  initial.program = domain.buildProgram(initial.profile);
  initial.selectedDate = domain.isoDay();
  navigate = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
function mount() {
  function Harness() {
    const [state, setState] = useState(initial), [open, setOpen] = useState(true);
    current = state;
    return open && <ModalLayer close={() => setOpen(false)} backgroundRef={{current: null}}>
      {close => <ConditioningSheet date={domain.isoDay()} state={state} update={fn => setState(s => fn(s))} close={close} setPage={navigate} Header={SheetHeader}/>}
    </ModalLayer>;
  }
  act(() => root.render(<Harness/>)); advance(300);
}
function selectType(value) {
  const select = document.querySelector('select');
  act(() => {select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));});
}
function pointer(handle, type, y) {
  act(() => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    Object.assign(event, {clientX: 190, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0});
    handle.dispatchEvent(event);
  });
}

it('A/E/I: owns one form-bound action footer outside the body, with one concise heading', () => {
  mount();
  const sheet = document.querySelector('.conditioning-sheet'), body = sheet.querySelector('.sheet-scroll'), footer = sheet.querySelector('footer');
  expect(footer.parentElement).toBe(sheet); expect(body.contains(footer)).toBe(false);
  expect(footer.dataset.separate).toBe('true'); expect(start().form).toBe(body.querySelector('form'));
  expect(sheet.querySelectorAll('[type="submit"]')).toHaveLength(1); expect(start().disabled).toBe(false);
  expect(sheet.querySelector('.detail-header strong').textContent).toBe('Conditioning');
  expect(sheet.querySelector('h2')).toBeNull(); expect(body.querySelector('.eyebrow').textContent).toBe('OPTIONAL SESSION');
  expect(sheet.textContent.match(/does not complete a planned strength workout/g)).toHaveLength(1);
  click(radio('Intervals'));
  expect(sheet.querySelector('footer')).toBe(footer); expect(start().form).toBe(body.querySelector('form'));
  expect(body.querySelectorAll('.stepper-row')).toHaveLength(3);
  expect(current).toEqual(initial); expect(save).not.toHaveBeenCalled();
});
it('B/C: Steady submits the chosen native Type, duration and intensity without interval fields', () => {
  mount(); selectType('SkiErg'); click(button('Increase duration')); click(radio('Hard'));
  expect(document.querySelectorAll('select option')).toHaveLength(9);
  expect(output('Activity duration')).toBe('25 min');
  click(start());
  expect(current.activeOptionalSession).toMatchObject({kind: 'Conditioning', intent: 'conditioning', activity: 'SkiErg', format: 'steady', duration: 25, intensity: 'Hard'});
  expect(current.activeOptionalSession).not.toHaveProperty('intervals');
  expect(navigate).toHaveBeenCalledExactlyOnceWith('optional-session');
});
it('D/F/G: format switching retains the in-sheet interval draft, Type and intensity without writing data', () => {
  mount(); selectType('Rower'); click(radio('Hard')); click(radio('Intervals'));
  click(button('Decrease rounds')); click(button('Increase work duration')); click(button('Increase rest duration'));
  click(radio('Steady')); expect(button('Increase rounds')).toBeNull();
  click(button('Increase duration')); click(radio('Intervals'));
  expect([output('Rounds'), output('Work duration'), output('Rest duration')]).toEqual(['7', '35 sec', '75 sec']);
  expect(document.querySelector('select').value).toBe('Rower'); expect(radio('Hard').getAttribute('aria-checked')).toBe('true');
  click(radio('Steady')); expect(output('Activity duration')).toBe('25 min');
  expect(current).toEqual(initial); expect(save).not.toHaveBeenCalled();
});
it('H: rapid explicit Start stores one interval session and navigates once', () => {
  mount(); selectType('Bike'); click(radio('Intervals')); click(radio('Hard'));
  click(button('Increase rounds')); click(button('Increase work duration')); click(button('Decrease rest duration'));
  const action = start(); act(() => {action.click(); action.click();});
  expect(current.activeOptionalSession).toMatchObject({activity: 'Bike', format: 'intervals', intensity: 'Hard', intervals: {rounds: 9, workSeconds: 35, restSeconds: 45}, duration: (9 * 35 + 8 * 45) / 60});
  expect(current.optionalSessions).toEqual([]); expect(save).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledExactlyOnceWith('optional-session');
  expect(document.querySelector('.conditioning-sheet').textContent).not.toContain('An optional session is active');
  expect(document.querySelector('.conditioning-sheet form')).not.toBeNull(); expect(start().disabled).toBe(true);
  advance(220); expect(document.querySelector('.conditioning-sheet')).toBeNull();
});
it('N: starting after an ended strength session preserves every strength, plan and progression field', () => {
  initial.activeWorkout = domain.startWorkout(initial, initial.program.days[0]);
  Object.assign(initial.activeWorkout.exercises[0].sets[0], {completed: true, reps: 8, weight: 20});
  initial = domain.completeWorkout(initial);
  expect(initial.workouts[0]).toMatchObject({status: 'ended-early', endedEarly: true});
  const ended = structuredClone(initial); mount(); click(start());
  expect(current.workouts).toEqual(ended.workouts);
  expect({...current, activeOptionalSession: ended.activeOptionalSession}).toEqual(ended);
});
it('canonical validation disables Start without silently fixing a rejected draft', () => {
  vi.spyOn(optional, 'conditioningConfiguration').mockImplementation(() => {throw Error('Invalid configuration');});
  mount(); expect(start().disabled).toBe(true); click(start());
  act(() => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})));
  expect(save).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(current).toEqual(initial);
});
it('format-specific bounds keep a zero rest interval valid and prevent lower-bound underflow', () => {
  mount(); click(radio('Intervals'));
  for (let i = 0; i < 8; i++) click(button('Decrease rounds'));
  for (let i = 0; i < 8; i++) click(button('Decrease work duration'));
  for (let i = 0; i < 5; i++) click(button('Decrease rest duration'));
  expect([output('Rounds'), output('Work duration'), output('Rest duration')]).toEqual(['1', '5 sec', '0 sec']);
  for (const label of ['Decrease rounds', 'Decrease work duration', 'Decrease rest duration']) expect(button(label).disabled).toBe(true);
  expect(start().disabled).toBe(false); click(start());
  expect(current.activeOptionalSession.intervals).toEqual({rounds: 1, workSeconds: 5, restSeconds: 0});
});
it('failed persistence retains the draft and allows a safe explicit retry', () => {
  mount(); selectType('Sled'); click(radio('Hard')); save.mockReturnValueOnce(false);
  click(start()); expect(current).toEqual(initial); expect(navigate).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]').textContent).toContain('Could not save');
  expect(document.querySelector('select').value).toBe('Sled'); click(start());
  expect(current.activeOptionalSession).toMatchObject({activity: 'Sled', intensity: 'Hard'}); expect(save).toHaveBeenCalledTimes(2);
});
it.each(['X', 'Escape', 'drag'])('O: %s dismisses the draft without a session or persistence write', method => {
  mount(); click(radio('Intervals')); click(button('Increase rounds'));
  if (method === 'X') click(button('Close Conditioning'));
  if (method === 'Escape') act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  if (method === 'drag') {
    const panel = document.querySelector('.conditioning-sheet'), handle = panel.querySelector('.modal-drag-handle');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({height: 500, top: 344, bottom: 844, width: 390, left: 0, right: 390});
    pointer(handle, 'pointerdown', 100); advance(250); pointer(handle, 'pointermove', 260); pointer(handle, 'pointerup', 260);
  }
  advance(220); expect(document.querySelector('.conditioning-sheet')).toBeNull();
  expect(current).toEqual(initial); expect(save).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});
it('J: visible-viewport pan keeps the same form, footer and draft', () => {
  const original = window.visualViewport, viewport = new EventTarget();
  Object.assign(viewport, {height: 844, offsetTop: 0, scale: 1});
  Object.defineProperty(window, 'visualViewport', {configurable: true, value: viewport});
  try {
    mount(); click(radio('Intervals')); click(button('Increase work duration'));
    const form = document.querySelector('form'), footer = document.querySelector('footer');
    Object.assign(viewport, {height: 420, offsetTop: 70}); act(() => viewport.dispatchEvent(new Event('resize')));
    expect(document.querySelector('form')).toBe(form); expect(document.querySelector('footer')).toBe(footer);
    expect(output('Work duration')).toBe('35 sec');
    expect(document.querySelector('.modal-layer').style.paddingTop).toBe('70px');
    expect(current).toEqual(initial);
  } finally {
    act(() => root.unmount()); root = null;
    Object.defineProperty(window, 'visualViewport', {configurable: true, value: original});
  }
});
it('L: Reduced Motion disables both format reveal and shared segmented travel', () => {
  const css = readFileSync('src/optionalActivity.css', 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(readFileSync('src/segmentedControl.css','utf8')).toMatch(/prefers-reduced-motion:[\s\S]*transition:none !important/);
  expect(reduced).toMatch(/conditioning-sheet \.optional-parameters[^}]*animation: none !important/);
  mount(); click(radio('Intervals')); click(radio('Hard')); click(radio('Steady'));
  expect(radio('Hard').getAttribute('aria-checked')).toBe('true');
  expect(button('Increase rounds')).toBeNull(); expect(start().disabled).toBe(false);
  expect(current).toEqual(initial);
});
