import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ModalLayer, SheetHeader } from './App.jsx';
import { SavedWorkouts } from './SavedWorkouts.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { startFreestyleWorkout, addFreestyleExercise } from './freestyleWorkout.js';
import { saveWorkoutTemplate, templateDraft } from './savedWorkouts.js';
import * as domain from './domain.js';
import { recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
import { useAnimationClock } from './testAnimationClock.js';

vi.mock('./accountSyncOutbox.js', async original => ({ ...await original(), recordAccountSyncDeleteIntent: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, current, initial, updates, closed, reduced;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = element => act(() => element.click());
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const confirmation = () => document.querySelector('.destructive-confirmation-sheet');
const detail = () => document.querySelector('.saved-workouts');
const preview = () => detail().querySelector('.saved-workout-preview');
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-04T12:00:00')); reduced = false;
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('reduced-motion') && reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({ top = 0 } = {}) { this.scrollTop = top; };
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
  initial = addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(2)), 'plank');
  initial.profile.showExerciseImages = false;
  const draft = { ...templateDraft(initial.activeWorkout, initial), name: 'Upper A · Sample' };
  initial = saveWorkoutTemplate(initial, draft, { id: 'delete-target' });
  initial = saveWorkoutTemplate(initial, draft, { id: 'same-name-keep' });
  vi.mocked(recordAccountSyncDeleteIntent).mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  updates = vi.fn(); closed = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount() {
  function Harness() {
    const [state, setState] = useState(initial), background = useRef(null); current = state;
    const update = fn => { updates(); setState(previous => fn(previous)); };
    return <><div className="app-shell" ref={background}>Today</div>
      <ModalLayer backgroundRef={background} close={closed}>{close =>
        <SavedWorkouts state={state} update={update} close={close} Header={SheetHeader} Modal={ModalLayer}/>
      }</ModalLayer></>;
  }
  act(() => root.render(<Harness/>)); advance(300);
  click(detail().querySelector('.saved-workout-list button')); advance(32);
}
function openDelete() {
  click(detail().querySelector('[aria-label="Saved workout options"]')); advance(300);
  click(button('Delete saved workout')); advance(300); advance(100); advance(40);
}
function pointer(type, target, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 195, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0 });
  act(() => target.dispatchEvent(event));
}

it('A/B: opens a separate compact decision above the mounted inert detail without mutation', () => {
  mount(); const originalDetail = detail(), originalPreview = preview(); originalPreview.scrollTop = 173;
  openDelete();
  expect(confirmation()).not.toBeNull(); expect(confirmation().parentElement).not.toBe(detail().parentElement);
  expect(detail()).toBe(originalDetail); expect(preview()).toBe(originalPreview); expect(preview().scrollTop).toBe(173);
  expect(detail().inert).toBe(true); expect(detail().getAttribute('aria-hidden')).toBe('true');
  expect(confirmation().closest('[aria-hidden="true"]')).toBeNull();
  expect(confirmation().textContent).toContain('Delete “Upper A · Sample”?');
  expect(confirmation().querySelectorAll('.modal-drag-handle')).toHaveLength(1);
  expect(confirmation().querySelector('.button.danger').textContent).toBe('DELETE SAVED WORKOUT');
  expect(document.activeElement).toBe(button('KEEP WORKOUT'));
  expect(detail().querySelector('.saved-template-delete')).toBeNull();
  expect(confirmation().textContent).not.toContain('Start workout');
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
  expect(recordAccountSyncDeleteIntent).not.toHaveBeenCalled();
});

it.each(['keep', 'X', 'Back', 'Escape', 'drag', 'handle', 'backdrop'])('C–F: %s returns to the same detail and scroll without changing any data', method => {
  mount(); const original = preview(), originalDetail = detail(); original.scrollTop = 173;
  const trigger = detail().querySelector('[aria-label="Saved workout options"]'); openDelete();
  if (method === 'keep') click(button('KEEP WORKOUT'));
  if (method === 'X') click(confirmation().querySelector('[aria-label="Close deletion confirmation"]'));
  if (method === 'Back') click(confirmation().querySelector('[aria-label="Back to saved workout"]'));
  if (method === 'Escape') act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  if (method === 'handle') click(confirmation().querySelector('.modal-drag-handle'));
  if (method === 'backdrop') click(confirmation().parentElement);
  if (method === 'drag') {
    const panel = confirmation(), handle = panel.querySelector('.modal-drag-handle');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height: 340, width: 390, top: 504, bottom: 844 });
    pointer('pointerdown', handle, 100); advance(220); pointer('pointermove', handle, 280); pointer('pointerup', handle, 280);
  }
  advance(300); advance(40);
  expect(confirmation()).toBeNull(); expect(detail()).toBe(originalDetail); expect(preview()).toBe(original);
  expect(preview().scrollTop).toBe(173); expect(detail().inert).toBe(false);
  expect(detail().hasAttribute('aria-hidden')).toBe(false); expect(document.activeElement).toBe(trigger);
  expect(document.body.style.position).toBe('fixed'); // Parent still owns its document lock.
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
  expect(recordAccountSyncDeleteIntent).not.toHaveBeenCalled();
});

it('a canceled drag leaves the decision open and never invokes Delete', () => {
  mount(); openDelete(); const handle = confirmation().querySelector('.modal-drag-handle');
  pointer('pointerdown', handle, 100); advance(220); pointer('pointermove', handle, 270); pointer('pointercancel', handle, 270); advance(300);
  expect(confirmation()).not.toBeNull(); expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
});

it.each([false, true])('G–L/N: explicit double-tap deletes exactly the captured ID and returns to list (%s reduced motion)', motion => {
  reduced = motion; mount(); openDelete(); const save = vi.spyOn(domain, 'saveState'), confirm = button('DELETE SAVED WORKOUT');
  act(() => { confirm.click(); confirm.click(); }); advance(300);
  expect(save).toHaveBeenCalledOnce(); expect(updates).toHaveBeenCalledOnce();
  expect(current.savedWorkoutTemplates.map(t => t.id)).toEqual(['same-name-keep']);
  expect(current.workouts).toEqual(initial.workouts); expect(current.activeWorkout).toEqual(initial.activeWorkout);
  expect(current.program).toEqual(initial.program);
  expect({ ...current, savedWorkoutTemplates: initial.savedWorkoutTemplates }).toEqual(initial);
  expect(recordAccountSyncDeleteIntent).toHaveBeenCalledExactlyOnceWith(localStorage, initial.profile.id, 'savedWorkoutTemplates', 'delete-target');
  expect(confirmation()).toBeNull(); expect(preview()).toBeNull(); expect(detail().querySelector('.saved-workout-list')).not.toBeNull();
  expect(detail().querySelectorAll('.saved-workout-list button')).toHaveLength(1);
  expect(detail().inert).toBe(false); expect(closed).not.toHaveBeenCalled();
  expect(document.querySelector('.rook-snackbar').textContent).toBe('Saved workout deleted');
  expect(document.querySelector('.rook-snackbar button')).toBeNull(); // No invented Undo.
});

it('local persistence failure keeps a recoverable decision; retry commits only once', () => {
  mount(); openDelete(); const save = vi.spyOn(domain, 'saveState').mockReturnValue(false);
  click(button('DELETE SAVED WORKOUT')); advance(300);
  expect(confirmation().querySelector('[role="alert"]').textContent).toContain('Could not save');
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled(); expect(recordAccountSyncDeleteIntent).not.toHaveBeenCalled();
  save.mockRestore(); click(button('DELETE SAVED WORKOUT')); advance(300);
  expect(current.savedWorkoutTemplates).toHaveLength(1); expect(confirmation()).toBeNull();
});

it('M: cloud-intent failure retains the local deletion and shows attention through the canonical snackbar', () => {
  vi.mocked(recordAccountSyncDeleteIntent).mockImplementation(() => { throw Error('Outbox unavailable'); });
  mount(); openDelete(); click(button('DELETE SAVED WORKOUT')); advance(300);
  expect(current.savedWorkoutTemplates.map(t => t.id)).toEqual(['same-name-keep']);
  expect(confirmation()).toBeNull(); expect(preview()).toBeNull();
  expect(document.querySelector('.rook-snackbar').textContent).toBe('Saved workout deleted locally. Cloud removal needs attention.');
  expect(detail().querySelector('[role="alert"]')).toBeNull();
  expect(current.workouts).toEqual(initial.workouts); expect(current.activeWorkout).toEqual(initial.activeWorkout);
});
