// @vitest-environment jsdom
import React, { act, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Today } from './App.jsx';
import { FlexibleWeekSheet } from './FlexibleWeekSheet.jsx';
import { deserializeState, STORAGE_KEY } from './domain.js';
import { temporaryScheduleReview } from './flexibleWeek.js';
import { scheduleRecoveryState } from './fixtures/scheduleRecoveryState.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current, change, publishes;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.getAnimations = () => [];
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); publishes = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const Header = ({ title, onBack, onClose }) => <header><strong>{title}</strong>{onBack && <button onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
function mount(initial, reviewExisting = false) {
  function Harness() {
    const [state, setState] = useState(initial), [request, setRequest] = useState(reviewExisting ? { reviewExisting: true } : null);
    current = state; change = fn => setState(previous => fn(structuredClone(previous)));
    const update = (fn, options) => { publishes(options); change(fn); };
    return <><Today state={state} update={update} setDetail={detail => setRequest(detail.flexibleWeek)} setPage={() => {}} />
      {request && <FlexibleWeekSheet state={state} update={update} close={() => setRequest(null)} Header={Header} request={request} />}</>;
  }
  act(() => root.render(<StrictMode><Harness /></StrictMode>));
}
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
const click = text => act(() => button(text).click());
const reviewSchedule = () => act(() => host.querySelector('.schedule-attention-open').click());
const sheet = () => host.querySelector('.flexible-week-sheet');

it('the reported past move is inspectable as missed history, not an actionable dead-end or current-week warning', () => {
  const state = scheduleRecoveryState(); mount(state, true); const before = structuredClone(current);
  expect(host.querySelector('.temporary-schedule-summary')).toBeNull();
  expect(sheet().querySelector('h1').textContent).toBe('Past changes');expect(sheet().querySelectorAll('.flexible-schedule-history article')).toHaveLength(1);
  expect(sheet().textContent).toContain('Missed');
  expect(sheet().textContent).toContain('Fri, Oct 9'); expect(sheet().textContent).toContain('Tue, Oct 6');
  expect(sheet().textContent).not.toContain('NEEDS ATTENTION');
  expect(button('Restore 1 change')).toBeUndefined();
  expect(button('EDIT SCHEDULE')).toBeUndefined();click('Back');
  expect(sheet().querySelector('h1').textContent).toBe('What changed?');
  expect(sheet().textContent).not.toContain('Your plan changed');
  expect(current).toEqual(before); expect(publishes).not.toHaveBeenCalled();
});
it('Today -> Review -> Restore -> Today saves one real resolution and immediately removes the warning', () => {
  mount(scheduleRecoveryState({ future: true })); const before = structuredClone(current);
  expect(host.querySelector('.schedule-attention-open').textContent).toContain('Review schedule');reviewSchedule();
  expect(sheet().querySelector('h1').textContent).toBe('Schedule changes');
  expect(button('EDIT SCHEDULE')).toBeUndefined();
  expect(sheet().textContent).toContain('Restore the eligible temporary changes');
  expect(button('Restore 1 change').disabled).toBe(false); click('Restore 1 change');
  expect(sheet().querySelector('h1').textContent).toBe('Restore these dates?');
  const apply = button('RESTORE 1 CHANGE'); act(() => { apply.click(); apply.click(); });
  expect(publishes).toHaveBeenCalledOnce(); expect(sheet()).toBeNull();
  expect(host.querySelector('.temporary-schedule-summary')).toBeNull();
  expect(current.program).toEqual(before.program); expect(current.workouts).toEqual(before.workouts);
  expect(current.flexibleWeek.sessions).toEqual({});
  const loaded = deserializeState(localStorage.getItem(STORAGE_KEY), { strict: true });
  expect(temporaryScheduleReview(loaded).unresolved).toHaveLength(0);
});
it('failed offline persistence keeps the unresolved warning and permits retry', () => {
  mount(scheduleRecoveryState({ future: true })); reviewSchedule(); click('Restore 1 change');
  const before = structuredClone(current);
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('full'); });
  click('RESTORE 1 CHANGE');
  expect(current).toEqual(before); expect(publishes).not.toHaveBeenCalled();
  expect(host.querySelector('.temporary-schedule-summary').textContent).toContain('1 workout needs attention');
  expect(sheet().querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');
  fail.mockRestore(); click('RESTORE 1 CHANGE');
  expect(publishes).toHaveBeenCalledOnce(); expect(host.querySelector('.temporary-schedule-summary')).toBeNull();
});
it('a new plan revision invalidates an open Restore review without overwriting the newer state', () => {
  mount(scheduleRecoveryState({ future: true })); reviewSchedule(); click('Restore 1 change');
  act(() => change(state => { state.program.days[0].name = 'Changed again'; return state; }));
  const before = structuredClone(current); click('RESTORE 1 CHANGE');
  expect(current).toEqual(before); expect(publishes).not.toHaveBeenCalled();
  expect(sheet().querySelector('[role="alert"]').textContent).toContain('Review the schedule again');
});
it('a still-carried stale move remains visible, explicitly scoped and protected when past-date restoration is forbidden', () => {
  const state = scheduleRecoveryState(); Object.values(state.flexibleWeek.sessions)[0].scheduledDate = '2026-10-15';
  mount(state); reviewSchedule();
  expect(host.querySelector('.temporary-schedule-summary').textContent).toContain('1 workout needs attention');expect(sheet().textContent).toContain('NEEDS ATTENTION');
  expect(button('Repair this move').disabled).toBe(false);
  expect(button('Restore 1 change')).toBeUndefined();
  expect(current.flexibleWeek).toEqual(state.flexibleWeek); expect(publishes).not.toHaveBeenCalled();
});
it('an empty live review does not invent a past change or an unresolved warning', () => {
  const state=scheduleRecoveryState();state.flexibleWeek.sessions={};mount(state,true);
  expect(sheet().textContent).toContain('No schedule changes.');expect(sheet().querySelector('.flexible-schedule-history')).toBeNull();
  expect(sheet().textContent).not.toContain('These past changes');
  expect(host.querySelector('.temporary-schedule-summary')).toBeNull();
});
