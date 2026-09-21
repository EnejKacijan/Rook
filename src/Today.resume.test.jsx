import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {Today, ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {isoDay, weekday, startWorkout, serializeState, deserializeState} from './domain.js';
import {startFreestyleWorkout, addFreestyleExercise} from './freestyleWorkout.js';
import {rememberSwipeParent, pageBackMotion} from './swipePageMotion.js';
import {moveToTodayFixture} from './moveToToday.fixture.js';
import {proposeFlexibleWeek, applyFlexibleWeek, flexibleSessions} from './flexibleWeek.js';

let root, host, current, change, navigate, animate, reduced;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T12:00:00'));
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({get matches() {return reduced;}, addEventListener() {}, removeEventListener() {}}));
  animate = vi.fn(() => ({finished: Promise.resolve(), cancel() {}}));
  Object.defineProperty(HTMLElement.prototype, 'animate', {configurable: true, value: animate});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  navigate = vi.fn();
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); delete HTMLElement.prototype.animate;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function fixture(selectedDate = '2026-09-19', freestyle = false) {
  let state = createReturningUserFixture(0);
  Object.assign(state.profile, {showExerciseImages: false, restTimerEnabled: false});
  state.selectedDate = isoDay(); state.selectedDay = weekday();
  if (freestyle) state = addFreestyleExercise(startFreestyleWorkout(state), 'plank');
  else state.activeWorkout = startWorkout(state, state.program.days[0]);
  const active = state.activeWorkout;
  active.startedAt = Date.now() - 185000;
  active.exercises[0].sets[0] = {...active.exercises[0].sets[0], completed: true, weight: 52.5, reps: 12, rir: 2};
  active.sessionNote = 'Keep this';
  state.selectedDate = selectedDate; state.selectedDay = weekday(selectedDate);
  return state;
}
function mount(state) {
  function Harness() {
    const [value, setValue] = useState(state), [page, setPage] = useState('today');
    current = value;
    change = fn => setValue(old => fn(structuredClone(old)));
    const nav = next => {
      if (next === 'workout') {
        // Match HydratedApp, including the parent painted during edge Back.
        expect(current.selectedDate).toBe(isoDay());
        expect(host.querySelector('.week-strip [aria-current="date"]').getAttribute('aria-pressed')).toBe('true');
        rememberSwipeParent(host.querySelector('.today-screen'), 'workout');
      }
      navigate(next); setPage(next);
    };
    return page === 'today'
      ? <Today state={value} update={change} setPage={nav} setDetail={() => {}}/>
      : <ActiveWorkout state={value} update={change} setPage={nav} setDetail={() => {}}/>;
  }
  act(() => root.render(<Harness/>));
}
const resume = () => [...host.querySelectorAll('button')].find(button => /RESUME/i.test(button.textContent));
const pressResume = () => act(() => resume().click());
const selectDay = day => act(() => host.querySelector('.week-strip button[aria-label^="' + day + ' "]').click());
function expectOnlyDateChanged(before) {
  expect(current).toEqual({...before, selectedDate: '2026-09-20', selectedDay: 'Sun'});
}

it.each([false, true])('Today resumes immediately without motion or state mutation (freestyle=%s)', freestyle => {
  const state = fixture('2026-09-20', freestyle); mount(state); pressResume();
  expect(navigate.mock.calls).toEqual([['workout']]); expect(animate).not.toHaveBeenCalled();
  expect(current).toEqual(state);
});
it.each(['2026-09-19', '2026-09-21', '2026-10-05'].flatMap(date => [false, true].map(freestyle => [date, freestyle])))('resumes immediately from %s and Back selects Today, preserving the full session (freestyle=%s)', (date, freestyle) => {
  const state = fixture(date, freestyle); mount(state); pressResume();
  // No timer, animation completion, frame or later render is needed to enter.
  expect(navigate.mock.calls).toEqual([['workout']]); expectOnlyDateChanged(state);
  expect(host.querySelector('[data-active-workout]')).not.toBeNull();
  expect(host.querySelector('.today-screen')).toBeNull(); expect(animate).not.toHaveBeenCalled();
  act(() => host.querySelector('[aria-label="Back to Today"]').click());
  expect(navigate.mock.calls).toEqual([['workout'], ['today']]); expectOnlyDateChanged(state);
  expect(host.querySelector('.week-strip [aria-current="date"]').getAttribute('aria-pressed')).toBe('true');
  expect(deserializeState(serializeState(current)).activeWorkout).toEqual(deserializeState(serializeState(state)).activeWorkout);
  // A remounted Today has its own navigation guard, so Resume remains usable.
  pressResume(); expect(navigate.mock.calls).toEqual([['workout'], ['today'], ['workout']]);
});
it('rapid repeated Resume clicks enter once without scheduling another navigation', () => {
  mount(fixture()); const button = resume();
  act(() => {button.click(); button.click(); button.click();});
  expect(navigate).toHaveBeenCalledExactlyOnceWith('workout');
  act(() => vi.advanceTimersByTime(1000));
  expect(navigate).toHaveBeenCalledOnce(); expect(animate).not.toHaveBeenCalled();
});
it('captures canonical Today for the existing edge-Back preview before immediate Resume', () => {
  mount(fixture()); pressResume();
  const screen = host.querySelector('[data-active-workout]');
  screen.getAnimations = () => [];
  const motion = pageBackMotion(screen); motion.render(100, 100);
  const preview = host.querySelector('[data-swipe-parent]');
  expect(preview.querySelector('.week-strip [aria-current="date"]').getAttribute('aria-pressed')).toBe('true');
  expect(preview.querySelector('.active-workout-hero')).not.toBeNull(); motion.clear();
});
it.each([true, false])('Resume is immediate with reduced motion (%s) or missing WAAPI', reducedMotion => {
  reduced = reducedMotion; if (!reducedMotion) delete HTMLElement.prototype.animate;
  const state = fixture(); mount(state); pressResume();
  expect(navigate).toHaveBeenCalledOnce(); expectOnlyDateChanged(state); expect(animate).not.toHaveBeenCalled();
});
it('does not redate an overnight session when returning to canonical Today', () => {
  const state = fixture(); state.activeWorkout.workoutDateKey = '2026-09-19';
  mount(state); pressResume(); expectOnlyDateChanged(state); expect(navigate).toHaveBeenCalledOnce();
});
it.each(['removed', 'replaced'])('uses the current active-workout state when it was %s before Resume', mode => {
  mount(fixture());
  act(() => change(state => {state.activeWorkout = mode === 'removed' ? null : {...state.activeWorkout, id: 'replacement'}; return state;}));
  if (mode === 'removed') {expect(resume()).toBeUndefined(); expect(navigate).not.toHaveBeenCalled();}
  else {pressResume(); expect(current.activeWorkout.id).toBe('replacement'); expect(navigate).toHaveBeenCalledOnce();}
});
it.each([false, true])('rapid date browsing commits each date/content directly, without remount, scrolling or delayed work (reduced=%s)', motion => {
  reduced = motion;
  const state = moveToTodayFixture('freestyle'); mount(state);
  const screen = host.querySelector('.today-screen'); screen.scrollTop = 160;
  for (const [day, date, heading] of [
    ['Wed','2026-09-16','FUNKCIONALNI DAN'], ['Tue','2026-09-15','Rest day'],
    ['Fri','2026-09-18','UPPER B'], ['Sun','2026-09-20','Freestyle workout'], ['Mon','2026-09-14','NOGE A'],
  ]) {
    selectDay(day);
    expect(current.selectedDate).toBe(date); expect(current.selectedDay).toBe(day);
    expect(host.querySelector('.week-strip [aria-pressed="true"]').getAttribute('aria-label')).toMatch(new RegExp('^' + day + ' '));
    expect(host.querySelector('h1').textContent).toContain(heading);
    expect(host.querySelector('.today-screen')).toBe(screen); expect(screen.scrollTop).toBe(160);
    expect(animate).not.toHaveBeenCalled();
    expect(current).toEqual({...state, selectedDate: date, selectedDay: day});
  }
  act(() => {vi.advanceTimersByTime(1000); window.dispatchEvent(new Event('focus'));});
  expect(current.selectedDate).toBe('2026-09-14'); expect(host.querySelector('h1').textContent).toContain('NOGE A');
  expect(navigate).not.toHaveBeenCalled(); expect(animate).not.toHaveBeenCalled();
});
it.each(['none','planned','completed-planned','freestyle','active-planned'])('date switching preserves the %s Today presentation and all workout state', kind => {
  const state = moveToTodayFixture(kind); mount(state);
  const hero = host.querySelector('.active-workout-hero,.today-hero,.rest-day-state').textContent;
  selectDay('Tue'); expect(host.querySelector('h1').textContent).toBe('Rest day');
  selectDay('Sun');
  expect(host.querySelector('.active-workout-hero,.today-hero,.rest-day-state').textContent).toBe(hero);
  expect(current).toEqual(state); expect(animate).not.toHaveBeenCalled();
});
it('moved source/destination and week navigation switch directly without changing occurrences or the active freestyle', () => {
  let state = moveToTodayFixture('freestyle');
  state.program.createdAt = '2026-09-07T12:00:00';
  const source = flexibleSessions(state).find(item => item.originalDate === '2026-09-16');
  state = applyFlexibleWeek(state, proposeFlexibleWeek(state, {mode:'move', sessionId:source.logicalSessionId, toDate:'2026-09-20'})).state;
  mount(state);
  expect(host.querySelector('.today-planned-workout').textContent).toContain('FUNKCIONALNI DAN');
  act(() => host.querySelector('[aria-label="Previous week"]').click());
  expect(current.selectedDate).toBe('2026-09-20');
  act(() => vi.advanceTimersByTime(260));
  expect(current.selectedDate).toBe('2026-09-13');
  act(() => host.querySelector('[aria-label="Next week"]').click());
  expect(current.selectedDate).toBe('2026-09-13');
  act(() => vi.advanceTimersByTime(260));
  expect(current.selectedDate).toBe('2026-09-20');
  selectDay('Wed'); expect(current.selectedDate).toBe('2026-09-16');
  expect(host.querySelector('.today-hero').textContent).toContain('Moved to Sunday, Sep 20');
  act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'VIEW DESTINATION').click());
  expect(current).toEqual(state); expect(host.querySelector('.today-planned-workout').textContent).toContain('Moved from Wednesday, Sep 16');
  expect(animate).not.toHaveBeenCalled(); pressResume(); expect(navigate).toHaveBeenCalledOnce();
});
