import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Today } from './App.jsx';
import { blankState, buildProgram, completeWorkout, deserializeState, isoDay, weekday, nextScheduledWorkout } from './domain.js';
import { startFreestyleWorkout, addFreestyleExercise, cancelUnloggedFreestyle } from './freestyleWorkout.js';
import { prepareCompletedWorkoutDeletion } from './deleteCompletedWorkout.js';

let root;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-13T12:00:00'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(count = 0) {
  let state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2,
    availableDays: ['Tue', 'Thu'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
    priorities: ['Balanced'], onboardingComplete: true });
  state.program = buildProgram(state.profile); state.ai.planUpgradeDismissed = true;
  state.selectedDate = isoDay(); state.selectedDay = weekday();
  for (let i = 0; i < count; i++) state = finishOne(state);
  return state;
}
function finishOne(state) {
  state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
  Object.assign(state.activeWorkout.exercises[0].sets[0], { reps: 8, completed: true });
  return completeWorkout(state);
}
function render(state) {
  if (!root) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  const setPage = vi.fn(), setDetail = vi.fn(), update = vi.fn();
  act(() => root.render(<Today state={state} update={update} setPage={setPage} setDetail={setDetail} />));
  return { setPage, setDetail, update };
}
const start = () => [...document.querySelectorAll('.today-screen button')].find(b => b.textContent.endsWith('Start freestyle workout'));
const helper = () => document.body.textContent.includes('Choose exercises as you go. Your plan won’t change.');
const rows = () => [...document.querySelectorAll('.today-completed-workouts > .list-row')];

it.each([0, 1, 3])('rest day with %i completed workouts derives action priority from real history', count => {
  const state = fixture(count), before = JSON.stringify(state); render(state);
  expect(document.querySelector('.rest-day-state')).not.toBeNull();
  expect(Boolean(start())).toBe(count === 0); expect(helper()).toBe(false);
  expect(rows()).toHaveLength(count);
  expect(document.querySelectorAll('.today-completed-workouts > .eyebrow')).toHaveLength(count > 1 ? 1 : 0);
  expect(document.querySelector('.rest-up-next')).not.toBeNull();
  expect(JSON.stringify(state)).toBe(before);
});
it('completed + active freestyle keeps Resume and completed rows without offering another start', () => {
  const state = startFreestyleWorkout(fixture(1)); const { setPage } = render(state);
  const resume = [...document.querySelectorAll('button')].find(b => b.textContent === 'RESUME WORKOUT');
  expect(resume).toBeDefined(); expect(start()).toBeUndefined(); expect(rows()).toHaveLength(1);
  act(() => resume.click()); expect(setPage).toHaveBeenCalledWith('workout');
});
it('zero-set cancellation restores the empty rest-day action without manufacturing completion', () => {
  const state = fixture(), cancelled = cancelUnloggedFreestyle(startFreestyleWorkout(state));
  render(cancelled); expect(start()).toBeDefined(); expect(helper()).toBe(false);
  expect(cancelled.workouts).toEqual([]); expect(cancelled.program).toEqual(state.program);
});
it('completion, deleting one of several, deleting the last, and restoring recompute immediately', () => {
  let state = fixture(); render(state); expect(start()).toBeDefined();
  state = finishOne(state); render(state); expect(start()).toBeUndefined();
  state = finishOne(state); const restored = structuredClone(state); render(state); expect(rows()).toHaveLength(2);
  state = prepareCompletedWorkoutDeletion(state, state.workouts[0].id); render(state);
  expect(start()).toBeUndefined(); expect(rows()).toHaveLength(1);
  state = prepareCompletedWorkoutDeletion(state, state.workouts[0].id); render(state);
  expect(start()).toBeDefined(); expect(helper()).toBe(false); expect(rows()).toHaveLength(0);
  render(restored); expect(start()).toBeUndefined(); expect(rows()).toHaveLength(2);
});
it('incomplete historical drafts and completed sessions on another date do not hide Start', () => {
  const state = fixture(1);
  Object.assign(state.workouts[0], { workoutDateKey: '2026-09-12', canonicalPlanDate: '2026-09-12', startedAt: new Date('2026-09-12T12:00:00').getTime(), completedAt: '2026-09-12T13:00:00' });
  state.workouts.push({ id: 'draft', workoutDateKey: isoDay(), completedAt: null, exercises: [] });
  render(state); expect(start()).toBeDefined(); expect(rows()).toHaveLength(0);
});
it('selection and the next empty calendar day retain independent state, including reload', () => {
  const state = deserializeState(JSON.stringify(fixture(1))); render(state); expect(start()).toBeUndefined();
  state.selectedDate = '2026-09-14'; state.selectedDay = 'Mon'; render(state);
  expect(rows()).toHaveLength(0); expect(start()).toBeUndefined(); // Preserve no future-day creation.
  vi.setSystemTime(new Date('2026-09-14T12:00:00')); render(state);
  expect(start()).toBeDefined(); expect(helper()).toBe(false);
  state.selectedDate = '2026-09-13'; state.selectedDay = 'Sun'; render(state);
  expect(start()).toBeUndefined(); expect(rows()).toHaveLength(1);
});
it('an optional active session retains its existing Resume affordance', () => {
  const state = fixture(1);
  state.activeOptionalSession = { id: 'optional-active', date: isoDay(), kind: 'Mobility', activity: 'Mobility', status: 'active', startedAt: Date.now(), elapsedSeconds: 0 };
  render(state); expect(start()).toBeUndefined(); expect(rows()).toHaveLength(1);
  expect(document.querySelector('.active-optional-session-notice')).not.toBeNull();
});

it('the compact row opens the same scheduled date without starting or changing the plan', () => {
  const state=fixture(), upcoming=nextScheduledWorkout(state,new Date(`${state.selectedDate}T12:00:00`));
  const {update,setPage}=render(state), row=document.querySelector('.rest-up-next-row');
  expect(row.tagName).toBe('BUTTON');expect(row.getAttribute('aria-label')).toContain('View ');
  expect(row.textContent).toContain(upcoming.workout.exercises.length+' exercises');
  expect(document.querySelector('.rest-view-workout')).toBeNull();
  expect(document.querySelector('.rest-up-next').compareDocumentPosition(start()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  act(()=>row.click());expect(update).toHaveBeenCalledTimes(1);
  const next=update.mock.calls[0][0](structuredClone(state));
  expect(next.selectedDate).toBe(upcoming.scheduledDate);expect(next.selectedDay).toBe(weekday(upcoming.scheduledDate));
  expect(next.program).toEqual(state.program);expect(next.activeWorkout).toBeNull();expect(setPage).not.toHaveBeenCalled();
});
it('the tertiary freestyle action uses the existing creation path and preserves the active-session guard', () => {
  const state=fixture(), {update,setPage}=render(state);
  expect(start().textContent).toBe('+ Start freestyle workout');expect(start().classList.contains('button')).toBe(false);
  act(()=>start().click());expect(update).toHaveBeenCalledTimes(1);expect(setPage).toHaveBeenCalledWith('workout');
  const apply=update.mock.calls[0][0], next=apply(structuredClone(state));
  expect(next.activeWorkout.source).toBe('freestyle');expect(next.program).toEqual(state.program);
  const alreadyActive=startFreestyleWorkout(state);expect(apply(alreadyActive)).toBe(alreadyActive);
});
