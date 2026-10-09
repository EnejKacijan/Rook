import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveWorkout, ExerciseVisualViewer, ModalLayer, PrivateWorkoutPhotoViewer, Profile, SheetHeader } from './App.jsx';
import { WeekPager } from './WeekPager.jsx';
import { MonthCalendar } from './MonthCalendar.jsx';
import { PhotoComparisonViewer } from './PhotoComparisonViewer.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { isoDay, startWorkout } from './domain.js';
import { useSemanticSwipeBack } from './useSemanticSwipeBack.js';
import { bindStandalonePageZoom, PAGE_ZOOM_PREFERENCE } from './standalonePageZoom.js';
import policyCSS from './standalonePageZoom.css?raw';
import calendarCSS from './calendar.css?raw';
import viewerCSS from './fullscreenViewerDrag.css?raw';
import comparisonCSS from './workoutPhotoCompare.css?raw';

let host, root, release, style, width, now, standalone;
const advance = ms => act(() => { now += ms; vi.advanceTimersByTime(ms); });
const mount = node => act(() => root.render(node));
function touch(node, type, x = 180, y = 200, count = 1) {
  const point = { identifier: 1, clientX: x, clientY: y, target: node };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: count }, (_, i) => ({ ...point, identifier: i + 1 })) },
    changedTouches: { value: [point] },
  });
  act(() => node.dispatchEvent(event)); return event;
}
function pointer(node, type, x, y = 200, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id } });
  act(() => node.dispatchEvent(event)); return event;
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  width = 390; now = 0; standalone = true;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('standalone') ? standalone : false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width, height: 600, right: width, bottom: 600 }));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.getAnimations = () => [];
  style = document.createElement('style'); style.textContent = calendarCSS + viewerCSS + comparisonCSS + policyCSS; document.head.append(style);
  host = document.createElement('div'); host.id = 'root'; document.body.append(host); root = createRoot(host);
  localStorage.removeItem(PAGE_ZOOM_PREFERENCE); release = bindStandalonePageZoom();
});
afterEach(() => {
  act(() => root.unmount()); release(); host.remove(); style.remove(); advance(500);
  localStorage.removeItem(PAGE_ZOOM_PREFERENCE); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it.each([320, 390, 430])('keeps actual week touch paging and vertical intent at %i px', w => {
  width = w; const commit = vi.fn(), state = createReturningUserFixture(0);
  function Harness() {
    const [date, setDate] = useState('2026-09-21');
    return <main className="screen"><WeekPager state={state} date={new Date(`${date}T12:00:00`)} canGoBack canGoForward
      selectDate={(_, value) => { commit(isoDay(value)); setDate(isoDay(value)); }} onCommit={() => {}}
      programName="Test plan" openCalendar={() => {}} calendarOpen={false} /></main>;
  }
  mount(<Harness />); const viewport = host.querySelector('.week-pager-viewport');
  touch(viewport, 'touchstart', w * .8); expect(touch(viewport, 'touchmove', w * .8, 250).defaultPrevented).toBe(false);
  touch(viewport, 'touchend', w * .8, 250);
  touch(viewport, 'touchstart', w * .8); advance(300); touch(viewport, 'touchmove', w * .2); advance(16); touch(viewport, 'touchend', w * .2); advance(300);
  expect(commit).toHaveBeenCalledExactlyOnceWith('2026-09-28');
  touch(viewport, 'touchstart'); expect(touch(viewport, 'touchmove', 180, 200, 2).defaultPrevented).toBe(true);
});
it.each([320, 390, 430])('keeps actual month touch paging without date selection at %i px', w => {
  width = w; const state = createReturningUserFixture(0), select = vi.fn(); state.program.createdAt = '2026-08-01T12:00:00Z';
  mount(<MonthCalendar state={state} today="2026-09-21" selectedDate="2026-08-21" header={<header>Calendar</header>} onSelect={select} />);
  const day = host.querySelector('.month-calendar-grid:not([aria-hidden="true"]) [data-date="2026-08-21"]');
  touch(day, 'touchstart', w * .8); advance(300); touch(day, 'touchmove', w * .2); advance(16); touch(day, 'touchend', w * .2); advance(300);
  expect(host.querySelector('h2').textContent).toBe('September 2026'); expect(select).not.toHaveBeenCalled();
});
it.each([320, 390, 430])('keeps actual sheet dragging, scroll position and a focused draft at %i px', w => {
  width = w; const close = vi.fn();
  mount(<ModalLayer backgroundRef={{ current: null }} close={close}><main className="screen"><SheetHeader title="Test sheet" /><input aria-label="Draft" defaultValue="53," /></main></ModalLayer>);
  advance(300); const panel = host.querySelector('.modal-layer > main'), input = panel.querySelector('input');
  input.focus(); panel.scrollTop = 120;
  touch(input, 'touchstart'); expect(touch(input, 'touchmove').defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input); expect(input.value).toBe('53,'); expect(panel.scrollTop).toBe(120);
  touch(input, 'touchend');
  const handle = panel.querySelector('.modal-drag-handle'); touch(handle, 'touchstart', 180, 100); advance(250); touch(handle, 'touchmove', 180, 310); advance(16);
  expect(panel.style.transform).toContain('210px'); touch(handle, 'touchend', 180, 310); advance(220);
  expect(close).toHaveBeenCalledOnce();
});
it.each([320, 390, 430])('keeps logger inputs and edge Back without completing a workout at %i px', w => {
  width = w; const initial = createReturningUserFixture(0); initial.profile.showExerciseImages = false; initial.profile.restTimerEnabled = false;
  initial.activeWorkout = startWorkout(initial, initial.program.days[0]);
  initial.activeWorkout.exercises.forEach(exercise => exercise.sets.forEach(set => { set.weight = 52.5; set.reps = 12; }));
  const before = structuredClone(initial.activeWorkout), back = vi.fn(), finish = vi.fn();
  function Harness() {
    useSemanticSwipeBack(); const [state, setState] = useState(initial);
    return <ActiveWorkout state={state} update={fn => setState(value => fn(structuredClone(value)))} setPage={back} setDetail={() => {}} onLiveFinish={finish} />;
  }
  mount(<Harness />); const surface = host.querySelector('[data-active-workout]'), input = surface.querySelector('input[data-workout-draft]:not(:disabled)');
  act(() => input.focus()); const value = input.value; touch(input, 'touchstart'); expect(touch(input, 'touchmove').defaultPrevented).toBe(false); touch(input, 'touchend');
  expect(document.activeElement).toBe(input); expect(input.value).toBe(value);
  touch(surface, 'touchstart', 4); touch(surface, 'touchmove', w * .65); advance(120); touch(surface, 'touchend', w * .65); advance(250);
  expect(back).toHaveBeenCalledExactlyOnceWith('today'); expect(finish).not.toHaveBeenCalled(); expect(initial.activeWorkout).toEqual(before);
});
it('keeps the real Preferences accessibility switch reversible, persisted and absent in browser mode', () => {
  const state = createReturningUserFixture(0);
  mount(<Profile state={state} update={() => {}} setDetail={() => {}} setPage={() => {}} />);
  act(() => host.querySelector('[data-profile-area="preferences"]').click());
  const control = host.querySelector('.standalone-zoom-preference input'); expect(control.checked).toBe(false);
  act(() => control.click()); expect(control.checked).toBe(true); expect(localStorage.getItem(PAGE_ZOOM_PREFERENCE)).toBe('true');
  expect(document.documentElement.hasAttribute('data-rook-page-zoom')).toBe(false);
  act(() => control.click()); expect(control.checked).toBe(false); expect(document.documentElement.getAttribute('data-rook-page-zoom')).toBe('locked');
  standalone = false; act(() => window.dispatchEvent(new Event('pageshow')));
  expect(host.querySelector('.standalone-zoom-preference input')).toBeNull();
});
it('preserves real native exercise/photo zoom owners, and guards the app again after close', () => {
  mount(<ModalLayer presentation="fullscreen" backgroundRef={{ current: null }} close={() => {}}><ExerciseVisualViewer exercise={{ exerciseId: 'leg-press' }} /></ModalLayer>);
  const visual = host.querySelector('[data-rook-zoom="native"]'); touch(visual, 'touchstart'); expect(touch(visual, 'touchmove', 180, 200, 2).defaultPrevented).toBe(false);
  expect(document.querySelector('[data-rook-zoom="native"]')).not.toBeNull();
  mount(<main className="screen">Closed</main>);
  expect(document.querySelector('[data-rook-zoom="native"]')).toBeNull();
  touch(host.querySelector('main'), 'touchstart'); expect(touch(host.querySelector('main'), 'touchmove', 180, 200, 2).defaultPrevented).toBe(true);
  mount(<PrivateWorkoutPhotoViewer photoUrl="data:image/png;base64,iVBORw0KGgo=" workout={{ id: 'test', name: 'Test', exercises: [] }} onClose={() => {}} onDelete={() => {}} />);
  const photo = document.querySelector('.workout-photo-viewer [data-rook-zoom="native"]'); touch(photo, 'touchstart'); expect(touch(photo, 'touchmove', 180, 200, 2).defaultPrevented).toBe(false);
});
it('keeps real comparison pinch, local zoom, divider drag and fullscreen dismissal ownership', () => {
  const close = vi.fn(), pair = ['a', 'b'].map(id => ({ id, day: '2026-09-21', workoutName: id }));
  mount(<PhotoComparisonViewer pair={pair} images={{ a: { url: 'test-a', ready: true }, b: { url: 'test-b', ready: true } }} onLoad={() => {}} onError={() => {}}
    onInspect={() => {}} onChooseAnother={() => {}} onBack={() => {}} onClose={close} Header={SheetHeader} />);
  const stage = document.querySelector('.photo-comparison-stage'), divider = document.querySelector('.photo-comparison-divider');
  expect(stage.dataset.rookZoom).toBe('custom');
  touch(stage, 'touchstart'); expect(touch(stage, 'touchmove', 180, 200, 2).defaultPrevented).toBe(false);
  pointer(divider, 'pointerdown', 100); pointer(stage, 'pointermove', 140); pointer(stage, 'pointerdown', 240, 200, 2); pointer(stage, 'pointermove', 340, 200, 2); advance(16);
  expect(stage.style.getPropertyValue('--compare-scale')).toBe('2'); expect(close).not.toHaveBeenCalled();
  pointer(stage, 'pointerup', 340, 200, 2); pointer(stage, 'pointerup', 140);
  const position = divider.getAttribute('aria-valuenow'); expect(Number(position)).toBeGreaterThan(50);
  expect(document.querySelector('[aria-label="Reset comparison zoom"]').textContent).toBe('2×');
});
