import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CompletedWorkoutDetail,TodayActionsSheet,completedRecordLabel } from './App.jsx';
import {workoutPlanDate} from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';
import { deleteCompletedWorkout } from './deleteCompletedWorkout.js';

vi.mock('./deleteCompletedWorkout.js', async original => ({ ...await original(), deleteCompletedWorkout: vi.fn() }));
let root, state, target, close, update;
const detail = () => document.querySelector('.completed-workout-detail');
const confirm = () => document.querySelector('.completed-workout-delete-confirm');
const trigger = () => detail().querySelector('[aria-label="Workout options"]');
const options = () => document.querySelector('.completed-workout-options-sheet');
const remove = () => options().querySelector('.danger-text');
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
const click = element => act(() => element.click());
const choose = label => { click(trigger()); click(button(label)); act(()=>vi.advanceTimersByTime(200)); };
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
it('does not invent a completion time for date-only imported history',()=>{
 expect(completedRecordLabel({...target,historicalImport:{version:2},sourceDate:{precision:'date',value:'2026-09-14'}})).toContain('Time not recorded');
 expect(completedRecordLabel({...target,historicalImport:{version:2},sourceEnd:{precision:'datetime',value:'2026-09-14T18:45:00'}})).toContain('Finished 18:45');
});
it('moves management actions into options and keeps top Close; opening confirmation never deletes', () => {
  render();
  expect(detail().querySelector('.completed-workout-detail-actions')).toBeNull();
  expect(detail().querySelector('[aria-label="Close workout details"]')).not.toBeNull();
  expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
  click(trigger()); click(trigger());
  expect([...options().querySelectorAll('.list-row')].map(b=>b.textContent)).toEqual(['Edit history','Delete workout']);
  click(remove()); act(()=>vi.advanceTimersByTime(200));
  expect(document.querySelectorAll('.completed-workout-delete-confirm')).toHaveLength(1);
  expect(confirm().textContent).toContain('Any photos attached to this workout will also be deleted.');
  expect(confirm().textContent).toContain(target.name);
  expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('cancel keeps identical detail, note and log DOM mounted with the same scroll', async () => {
  render(); const panel = detail(), note = panel.querySelector('textarea'), log = panel.querySelector('.complete-session-log');
  click(log.querySelector('.session-log-trigger'));
  panel.scrollTop = 123; choose('Delete workout');
  expect(panel.inert).toBe(true); expect(note.isConnected).toBe(true);
  click(button('CANCEL')); await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(confirm()).toBeNull(); expect(detail()).toBe(panel); expect(detail().scrollTop).toBe(123);
  expect(detail().querySelector('textarea')).toBe(note); expect(note.value).toBe('Keep my note');
  expect(detail().querySelector('.complete-session-log')).toBe(log);
  expect(log.querySelector('.session-log-trigger').getAttribute('aria-expanded')).toBe('true'); expect(panel.inert).toBe(false);
  expect(deleteCompletedWorkout).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it.each(['activeWorkout', 'activeOptionalSession'])('retains the %s deletion guard', key => {
  state[key] = { id: 'active' }; render(); click(trigger()); expect(remove().disabled).toBe(true);
  click(remove()); expect(confirm()).toBeNull(); expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('Edit still opens the existing correction editor', () => {
  render(); choose('Edit history'); expect(document.querySelector('.history-correction-editor')).not.toBeNull();
  expect(deleteCompletedWorkout).not.toHaveBeenCalled();
});
it('explicit confirmation invokes the existing transaction once with the exact ID and blocks dismissal while busy', async () => {
  let resolve; vi.mocked(deleteCompletedWorkout).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(); choose('Delete workout'); const submit = button('DELETE WORKOUT');
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
  render(); const panel = detail(); choose('Delete workout');
  await act(async () => button('DELETE WORKOUT').click());
  expect(confirm().querySelector('[role="alert"]').textContent).toContain('Your saved data has not been replaced');
  expect(detail()).toBe(panel); expect(button('CANCEL').disabled).toBe(false);
  expect(update).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('Today menu scopes zero/one/many history to the selected date and shares the exact deletion operation',async()=>{
 const date=workoutPlanDate(target);
 const draw=()=>act(()=>root.render(<TodayActionsSheet state={state} update={update} close={close} setDetail={vi.fn()} date={date}/>));
 const other=structuredClone(state.workouts[1]);state.workouts=[other];draw();expect(button('Delete workout')).toBeUndefined();
 state={...state,workouts:[target,other]};draw();expect(button('Delete workout')).toBeDefined();
 const twin={...structuredClone(target),id:'same-name-second',completedAt:new Date(new Date(target.completedAt).getTime()+3600000).toISOString()};
 state={...state,workouts:[target,twin,other]};draw();click(button('Delete a workout'));
 const panel=document.querySelector('.today-actions-sheet');panel.scrollTop=75;
 click(panel.querySelector('[data-workout-id="same-name-second"]'));expect(confirm().textContent).toContain(twin.name);
 click(button('CANCEL'));await act(async()=>vi.advanceTimersByTimeAsync(200));expect(panel.scrollTop).toBe(75);expect(panel.inert).toBe(false);
 click(panel.querySelector('[data-workout-id="same-name-second"]'));vi.mocked(deleteCompletedWorkout).mockResolvedValue({...state,workouts:[target,other]});
 await act(async()=>button('DELETE WORKOUT').click());expect(deleteCompletedWorkout.mock.calls[0][1]).toBe(twin.id);
});
