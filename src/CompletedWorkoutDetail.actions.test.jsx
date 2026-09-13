import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CompletedWorkoutDetail } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { deleteCompletedWorkout } from './deleteCompletedWorkout.js';

vi.mock('./deleteCompletedWorkout.js', async original => ({ ...await original(), deleteCompletedWorkout: vi.fn() }));
let root, state, target, close, update;
const detail = () => document.querySelector('.completed-workout-detail');
const confirm = () => document.querySelector('.completed-workout-delete-confirm');
const trigger = () => detail().querySelector('[aria-label="Delete workout"]');
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
const click = element => act(() => element.click());
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  state = createReturningUserFixture(2); target = state.workouts[0];
  target.sessionNote = 'Keep my note';
  state.workouts[1].name = target.name; // IDs, never names, identify the target.
  close = vi.fn(); update = vi.fn();
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<CompletedWorkoutDetail workoutId={target.id} state={state} update={update} close={close} setPage={vi.fn()} />)); }
it('has only direct Edit/Delete actions and top Close; opening confirmation never deletes', () => {
  render();
  expect([...detail().querySelector('.completed-workout-detail-actions').children].map(b => b.textContent)).toEqual(['Edit', 'Delete']);
  expect(detail().querySelector('[aria-label="Close workout details"]')).not.toBeNull();
  expect(detail().querySelector('[aria-label="Workout options"]')).toBeNull();
  click(trigger()); click(trigger());
  expect(document.querySelectorAll('.completed-workout-delete-confirm')).toHaveLength(1);
  expect(confirm().textContent).toContain('Any photos attached to this workout will also be deleted.');
  expect(confirm().textContent).toContain(target.name);
  expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('cancel keeps identical detail, note and log DOM mounted with the same scroll', async () => {
  render(); const panel = detail(), note = panel.querySelector('textarea'), log = panel.querySelector('.complete-session-log');
  click(log.querySelector('.session-log-trigger'));
  panel.scrollTop = 123; click(trigger());
  expect(panel.inert).toBe(true); expect(note.isConnected).toBe(true);
  click(button('CANCEL')); await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(confirm()).toBeNull(); expect(detail()).toBe(panel); expect(detail().scrollTop).toBe(123);
  expect(detail().querySelector('textarea')).toBe(note); expect(note.value).toBe('Keep my note');
  expect(detail().querySelector('.complete-session-log')).toBe(log);
  expect(log.querySelector('.session-log-trigger').getAttribute('aria-expanded')).toBe('true'); expect(panel.inert).toBe(false);
  expect(deleteCompletedWorkout).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it.each(['activeWorkout', 'activeOptionalSession'])('retains the %s deletion guard', key => {
  state[key] = { id: 'active' }; render(); expect(trigger().disabled).toBe(true);
  click(trigger()); expect(confirm()).toBeNull(); expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('Edit still opens the existing correction editor', () => {
  render(); click(button('Edit')); expect(document.querySelector('.history-correction-editor')).not.toBeNull();
  expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('explicit confirmation invokes the existing transaction once with the exact ID and blocks dismissal while busy', async () => {
  let resolve; vi.mocked(deleteCompletedWorkout).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(); click(trigger()); const submit = button('DELETE WORKOUT');
  await act(async () => { submit.click(); submit.click(); });
  expect(deleteCompletedWorkout).toHaveBeenCalledTimes(1);
  expect(deleteCompletedWorkout.mock.calls[0].slice(0, 2)).toEqual([state, target.id]);
  expect(button('CANCEL').disabled).toBe(true);
  const dismissal = new CustomEvent('rook:before-sheet-close', { bubbles: true, cancelable: true });
  expect(confirm().dispatchEvent(dismissal)).toBe(false);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(confirm()).not.toBeNull(); expect(close).not.toHaveBeenCalled();
  const next = { ...state, workouts: state.workouts.filter(w => w.id !== target.id) };
  await act(async () => resolve(next));
  expect(update).toHaveBeenCalledTimes(1); expect(update.mock.calls[0][0]()).toBe(next);
  expect(update.mock.calls[0][1]).toEqual({ planVersion: false, persistedState: next }); expect(close).toHaveBeenCalledTimes(1);
});
it('transaction failure keeps the parent and confirmation recoverable without publishing state', async () => {
  vi.mocked(deleteCompletedWorkout).mockRejectedValue(new Error('write failed'));
  render(); const panel = detail(); click(trigger());
  await act(async () => button('DELETE WORKOUT').click());
  expect(confirm().querySelector('[role="alert"]').textContent).toContain('Your saved data has not been replaced');
  expect(detail()).toBe(panel); expect(button('CANCEL').disabled).toBe(false);
  expect(update).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
