import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Today, Detail, ModalLayer } from './App.jsx';
import { blankState, isoDay, nextScheduledWorkout } from './domain.js';
import { createTrainingReviewState } from './fixtures/trainingReviewState.js';
import { useAnimationClock } from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, initial, current, updates, navigate;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = node => act(() => node.click());
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const dialog = () => host.querySelector('[role="dialog"]');
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({ top = 0 } = {}) { this.scrollTop = top; };
  HTMLElement.prototype.scrollIntoView = () => {};
  initial = createTrainingReviewState(blankState()); initial.ai.planUpgradeDismissed = true; initial.profile.showExerciseImages = false;
  updates = vi.fn(); navigate = vi.fn(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount() {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState(null), background = useRef(null); current = state;
    const update = fn => { updates(); setState(previous => fn(previous)); };
    return <><div ref={background}><Today state={state} update={update} setPage={navigate} setDetail={setDetail} /></div>
      {detail && <ModalLayer backgroundRef={background} close={() => setDetail(null)}>{close => <Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail} setPage={navigate} />}</ModalLayer>}</>;
  }
  act(() => root.render(<Harness />)); advance(400);
}
function open(label) { act(() => button(label).focus()); click(button(label)); advance(400); }
function unchanged() { expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); }

it('root exposes two semantic actions, with no individual activity/freestyle/My workouts launchers', () => {
  mount(); const actions = host.querySelector('.rest-day-actions');
  expect([...actions.querySelectorAll('button')].map(node => node.textContent)).toEqual(['+ Add optional activity', 'Train anyway']);
  expect(host.querySelector('.today-my-workouts')).toBeNull(); expect(host.querySelector('.rest-freestyle-action')).toBeNull();
  expect(host.querySelector('.today-optional-actions')).toBeNull();
  for (const node of actions.querySelectorAll('button')) { expect(node.getAttribute('type')).toBe('button'); expect(node.classList.contains('rook-ui')).toBe(true); expect(node.getAttribute('aria-haspopup')).toBe('dialog'); }
  unchanged();
});
it('optional activity opens the short Recovery/Training chooser with no data mutation', () => {
  mount(); open('+ Add optional activity');
  expect(dialog().getAttribute('aria-label')).toBe('Optional activity');
  expect([...dialog().querySelectorAll('.eyebrow')].map(node => node.textContent)).toEqual(['RECOVERY', 'TRAINING']);
  expect([...dialog().querySelectorAll('.rest-day-choice strong')].map(node => node.textContent)).toEqual(['Light cardio', 'Mobility / recovery', 'Conditioning']);
  expect(dialog().querySelector('p')).toBeNull(); unchanged();
});
it.each([
  ['Light cardioEasy aerobic movement.', 'Cardio', '20 min'],
  ['Mobility / recoveryGuided mobility and recovery.', 'Mobility', '15 min'],
  ['ConditioningOptional cardio / conditioning work.', 'Conditioning', '20 min'],
])('%s opens the canonical editor and starts only at START SESSION', (label, kind, duration) => {
  mount(); open('+ Add optional activity'); click(button(label)); advance(400);
  expect(dialog().querySelector('.optional-activity-editor')).not.toBeNull();
  expect(dialog().querySelector('output').textContent).toBe(duration); unchanged();
  click(button('START SESSION')); advance(400);
  expect(updates).toHaveBeenCalledOnce(); expect(current.activeOptionalSession.kind).toBe(kind);
  expect(current.program).toEqual(initial.program); expect(current.workouts).toEqual(initial.workouts);
  expect(navigate).toHaveBeenCalledWith('optional-session');
});
it.each(['Light cardioEasy aerobic movement.', 'Mobility / recoveryGuided mobility and recovery.', 'ConditioningOptional cardio / conditioning work.'])('Back from %s returns to the chooser; dismiss returns to Today without writing', label => {
  mount(); open('+ Add optional activity'); click(button(label)); advance(400);
  const back = dialog().querySelector('[aria-label="Back to optional activity"]') || button('‹ Back'); click(back); advance(400);
  expect(dialog().getAttribute('aria-label')).toBe('Optional activity'); unchanged();
  click(dialog().querySelector('[aria-label="Close Optional activity"]')); advance(500);
  advance(32); // Focus restoration is scheduled after the animated modal unmount.
  expect(dialog()).toBeNull(); expect(document.activeElement).toBe(button('+ Add optional activity')); unchanged();
});
it('Train anyway does not start a workout; Freestyle retains its existing explicit start and Back', () => {
  mount(); open('Train anyway'); expect(dialog().getAttribute('aria-label')).toBe('Train anyway');
  click(button('Start freestyle workoutStart empty. Add exercises as you go.')); advance(400);
  expect(current.activeWorkout).toBeNull(); expect(button('Start freestyle workout')).toBeDefined(); unchanged();
  click(dialog().querySelector('[aria-label="Back to Train anyway"]')); advance(400); unchanged();
  click(button('Start freestyle workoutStart empty. Add exercises as you go.')); advance(400);
  click(button('Start freestyle workout')); advance(500);
  expect(current.activeWorkout.source).toBe('freestyle'); expect(current.activeWorkout.exercises).toEqual([]);
  expect(current.program).toEqual(initial.program); expect(current.profile).toEqual(initial.profile);
  expect(updates).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledWith('workout');
});
it('My workouts reuses canonical browse/review and Back, and opening it is read-only', () => {
  mount(); open('Train anyway'); click(button('My workoutsStart one of your reusable or plan workouts.')); advance(400);
  expect(dialog().querySelector('.saved-workout-list')).not.toBeNull(); unchanged();
  const row = dialog().querySelector('.saved-workout-list button'); click(row); advance(400);
  expect(dialog().querySelector('.saved-workout-preview')).not.toBeNull(); unchanged();
  click(dialog().querySelector('[aria-label="Back"]')); advance(400);
  expect(dialog().querySelector('.saved-workout-list')).not.toBeNull();
  click(dialog().querySelector('[aria-label="Back to Train anyway"]')); advance(400);
  expect(dialog().getAttribute('aria-label')).toBe('Train anyway'); unchanged();
});
it('completed optional activities remain below both actions and each opens its own details', () => {
  initial.optionalSessions = [{ id: 'walking', date: isoDay(), status: 'completed', kind: 'Cardio', activity: 'Walking', intensity: 'Easy', elapsedSeconds: 1200 }, { id: 'mobility', date: isoDay(), status: 'completed', kind: 'Mobility', activity: 'Mobility / recovery', elapsedSeconds: 540 }];
  mount(); const history = host.querySelector('.rest-day-activity-history'); expect(history.querySelector('.eyebrow').textContent).toBe('TODAY');
  expect(host.querySelector('.rest-day-actions').compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(history.querySelectorAll('.optional-session-note')).toHaveLength(2);
  click(history.querySelectorAll('.optional-session-note')[1]); advance(400);
  expect(dialog().textContent).toContain('Mobility / recovery'); expect(dialog().querySelector('.optional-activity-summary').textContent).toBe('9 min'); unchanged();
});
it('Up Next still selects its canonical scheduled date without starting training', () => {
  mount(); const next = nextScheduledWorkout(initial); click(host.querySelector('.rest-up-next-row'));
  expect(updates).toHaveBeenCalledOnce(); expect(current.selectedDate).toBe(next.scheduledDate);
  expect(current.program).toEqual(initial.program); expect(current.activeWorkout).toBeNull(); expect(navigate).not.toHaveBeenCalled();
});
it('an active optional session keeps Resume and prevents a second Freestyle start', () => {
  initial.activeOptionalSession = { id: 'active', date: isoDay(), kind: 'Mobility', activity: 'Mobility', status: 'active', startedAt: Date.now(), elapsedSeconds: 0 };
  mount(); expect(host.querySelector('.active-optional-session-notice')).not.toBeNull(); open('Train anyway');
  expect(button('Start freestyle workoutResume or finish your active session first.').disabled).toBe(true); unchanged();
});
