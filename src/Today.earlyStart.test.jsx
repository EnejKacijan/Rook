import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Today} from './App.jsx';
import {calendarDayPresentation} from './workoutCalendar.js';
import {calendarStatusFixture} from './calendarStatus.fixture.js';
import {completeWorkout, plannedWorkoutForDate, startWorkout, weekday} from './domain.js';
import {flexibleOccurrenceForDate} from './flexibleWeek.js';

let root, host;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function futureFixture() {
  const state = calendarStatusFixture('planned');
  state.profile.availableDays = ['Mon', 'Tue', 'Wed'];
  state.program.days[1].weekday = 'Tue';
  state.program.days[0].name = 'UPPER A';
  state.program.days[1].name = 'NOGE A (MOČ)';
  state.selectedDate = '2026-09-22';
  state.selectedDay = 'Tue';
  return state;
}

it('starts the selected future occurrence today with explicit identity and actual date', () => {
  const state = futureFixture();
  const source = flexibleOccurrenceForDate(state, '2026-09-22');
  const actual = startWorkout(state, plannedWorkoutForDate(state, '2026-09-22'));
  expect(actual.logicalSessionId).toBe(source.logicalSessionId);
  expect(actual.canonicalPlanDate).toBe('2026-09-22');
  expect(actual.workoutDateKey).toBe('2026-09-21');
  expect(actual.originalScheduledDate).toBe('2026-09-22');
});

it('uses one source-date Resume and suppresses the global notice for an early active session', () => {
  const future = futureFixture();
  act(() => root.render(<Today state={future} update={() => {}} setPage={() => {}} setDetail={() => {}} />));
  expect(host.textContent).toContain('START TODAY');
  const state = {...future, activeWorkout: startWorkout(future, plannedWorkoutForDate(future, '2026-09-22'))};
  // Render the actual date and then browse back to the source date.
  act(() => root.render(<Today state={{...state, selectedDate: '2026-09-21', selectedDay: 'Mon'}} update={() => {}} setPage={() => {}} setDetail={() => {}} />));
  expect(host.querySelector('.active-workout-hero')).not.toBeNull();
  act(() => root.render(<Today state={{...state, selectedDate: '2026-09-22', selectedDay: 'Tue'}} update={() => {}} setPage={() => {}} setDetail={() => {}} />));
  expect(host.querySelector('.active-workout-notice')).toBeNull();
  expect(host.textContent).toContain('Started early · Mon, Sep 21');
  expect(host.querySelectorAll('button').length).toBeGreaterThan(0);
  expect([...host.querySelectorAll('button')].filter(button => /RESUME/.test(button.textContent)).length).toBe(1);
});

it('projects active and completed early execution only on its actual date', () => {
  const state = futureFixture();
  state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, '2026-09-22'));
  expect(calendarDayPresentation(state, ['2026-09-21', '2026-09-22'])['2026-09-21'].markers).toContain('active');
  expect(calendarDayPresentation(state, ['2026-09-21', '2026-09-22'])['2026-09-22'].markers).not.toContain('active');
  state.activeWorkout.exercises.forEach(exercise => exercise.sets.forEach(set => {
    set.completed = true;
    set.reps = set.reps || 8;
    if (set.weight == null && exercise.loadRequirement !== 'none') set.weight = 20;
  }));
  const completed = completeWorkout(state);
  const dates = calendarDayPresentation(completed, ['2026-09-21', '2026-09-22']);
  expect(dates['2026-09-21'].markers).toContain('completed');
  expect(dates['2026-09-22'].markers).toContain('completed');
  expect(dates['2026-09-22'].label).not.toBe('rest day');
});
