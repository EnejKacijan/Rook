import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Today, Detail, ModalLayer, RestTrainingSheet } from './App.jsx';
import * as domain from './domain.js';
import { recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
import { useAnimationClock } from './testAnimationClock.js';

vi.mock('./accountSyncOutbox.js', async original => ({ ...await original(), recordAccountSyncDeleteIntent: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, current, initial, updates, reduced;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = node => act(() => node.click());
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const radio = text => [...document.querySelectorAll('[role="radio"]')].find(node => node.textContent === text);
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-04T12:00:00')); reduced = false;
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('reduced-motion') && reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({ top = 0 } = {}) { this.scrollTop = top; };
  HTMLElement.prototype.scrollIntoView = () => {};
  initial = domain.blankState();
  Object.assign(initial.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Tue', 'Thu'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false });
  initial.program = domain.buildProgram(initial.profile); initial.ai.planUpgradeDismissed = true;
  initial.selectedDate = domain.isoDay(); initial.selectedDay = 'Sun';
  initial = domain.finishOptionalSession(domain.startOptionalSession(initial, { date: domain.isoDay(), kind: 'Cardio', activity: 'Walking', duration: 20, intensity: 'Easy' }, Date.now() - 3000), Date.now());
  vi.mocked(recordAccountSyncDeleteIntent).mockReset(); updates = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount(create = false) {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState(create ? { restTraining: domain.isoDay() } : null), background = useRef(null); current = state;
    const update = fn => { updates(); setState(previous => fn(previous)); };
    return <><div ref={background}><Today state={state} update={update} setPage={() => {}} setDetail={setDetail} /></div>
      {detail && <ModalLayer backgroundRef={background} close={() => setDetail(null)}>{close => <Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail} setPage={() => {}} />}</ModalLayer>}</>;
  }
  act(() => root.render(<Harness />)); advance(300);
}
function open() { click(document.querySelector('.optional-session-note')); advance(300); }
function openDelete() { open(); click(button('Delete activity')); advance(400); }

it('A/B/C: whole row opens the correct compact details and canonical editor with measured duration', () => {
  mount(); const row = document.querySelector('.optional-session-note'); expect(row.tagName).toBe('BUTTON'); expect(row.textContent).toContain('0:03 · Easy');
  open(); expect(document.querySelector('.optional-activity-details').textContent).toContain('Walking3 sec · Easy');
  click(button('EDIT ACTIVITY'));
  expect(document.querySelector('.optional-activity-editor')).not.toBeNull(); expect(document.querySelector('select').value).toBe('Walking');
  expect(document.querySelector('output').textContent).toBe('3 sec'); expect(radio('Easy').getAttribute('aria-checked')).toBe('true');
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
});
it('D/E: saves the same ID once and updates Today immediately without altering target/timestamps', () => {
  mount(); open(); click(button('EDIT ACTIVITY')); click(document.querySelector('[aria-label="Increase duration"]')); click(radio('Moderate'));
  const save = vi.spyOn(domain, 'saveState'); click(button('SAVE ACTIVITY'));
  expect(save).toHaveBeenCalledOnce(); expect(updates).toHaveBeenCalledOnce();
  expect(current.optionalSessions[0]).toEqual({ ...initial.optionalSessions[0], elapsedSeconds: 60, intensity: 'Moderate' });
  expect(document.querySelector('.optional-session-note').textContent).toContain('1:00 · Moderate');
  expect(document.querySelector('.optional-activity-summary').textContent).toBe('1 min · Moderate');
  expect({ ...current, optionalSessions: initial.optionalSessions }).toEqual(initial);
});
it.each(['KEEP ACTIVITY', 'Close delete activity confirmation', 'Back to activity'])('F: %s cancels the separate confirmation without mutation', label => {
  mount(); openDelete(); const confirmation = document.querySelector('[role="alertdialog"]');
  expect(confirmation.textContent).toContain('This removes the optional activity from this day.');
  expect(document.activeElement).toBe(button('KEEP ACTIVITY'));
  click(label === 'KEEP ACTIVITY' ? button(label) : confirmation.querySelector(`[aria-label="${label}"]`)); advance(400);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect(document.querySelector('.optional-activity-details')).not.toBeNull();
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled(); expect(recordAccountSyncDeleteIntent).not.toHaveBeenCalled();
});
it.each([false, true])('G/H/I: deletion is scoped and returns to Rest Day with next strength unchanged (%s reduced)', motion => {
  reduced = motion; const next = domain.nextScheduledWorkout(initial); mount(); openDelete();
  const confirm = button('DELETE ACTIVITY'); act(() => { confirm.click(); confirm.click(); }); advance(800);
  expect(current.optionalSessions).toEqual([]); expect(updates).toHaveBeenCalledOnce();
  expect(document.querySelector('.optional-session-note')).toBeNull(); expect(document.querySelector('.optional-activity-details')).toBeNull();
  expect(document.querySelector('.rest-day-state')).not.toBeNull(); expect(domain.nextScheduledWorkout(current)).toEqual(next);
  expect({ ...current, optionalSessions: initial.optionalSessions }).toEqual(initial);
  expect(recordAccountSyncDeleteIntent).toHaveBeenCalledExactlyOnceWith(localStorage, initial.profile.id, 'optionalSessions', initial.optionalSessions[0].id);
});
it('multiple same-day activity rows independently open their own identity', () => {
  initial.optionalSessions.push({ ...initial.optionalSessions[0], id: 'second', kind: 'Mobility', activity: 'Mobility / recovery', elapsedSeconds: 120 });
  mount(); expect(document.querySelectorAll('.optional-session-note')).toHaveLength(2);
  click(document.querySelectorAll('.optional-session-note')[1]); advance(300);
  expect(document.querySelector('.optional-activity-summary').textContent).toBe('2 min');
  click(button('Delete activity')); advance(400); click(button('DELETE ACTIVITY')); advance(800);
  expect(current.optionalSessions).toEqual(initial.optionalSessions.slice(0, 1));
  expect(document.querySelector('.optional-session-note').textContent).toContain('Walking');
});
it('J/K/L: the creation form uses the same editor; selection/rapid toggles and keyboard state are immediate', () => {
  mount(true); click(button('LIGHT CARDIOAdd an easy session without changing the strength plan.'));
  expect(document.querySelector('.optional-activity-editor')).not.toBeNull(); expect(document.querySelector('output').textContent).toBe('20 min');
  click(radio('Moderate')); expect(radio('Moderate').getAttribute('aria-checked')).toBe('true');
  expect(document.querySelector('[role="radiogroup"]').style.getPropertyValue('--rook-segment-index')).toBe('1');
  act(() => { radio('Easy').click(); radio('Moderate').click(); radio('Easy').click(); });
  expect(radio('Easy').getAttribute('aria-checked')).toBe('true'); expect(radio('Moderate').getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('[role="radiogroup"]').style.getPropertyValue('--rook-segment-index')).toBe('0');
  act(() => radio('Easy').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(document.activeElement).toBe(radio('Moderate')); expect(radio('Moderate').getAttribute('aria-checked')).toBe('true');
  expect(document.querySelectorAll('[role="radio"]')).toHaveLength(2); expect(current).toEqual(initial);
});
it('M: Reduced Motion disables indicator travel through its actual CSS rule', () => {
  const css = readFileSync('src/segmentedControl.css', 'utf8');
  expect(css).toMatch(/prefers-reduced-motion:[\s\S]*transition:none !important/);
});
it('failed local save retains the activity and recoverable draft; no deletion intent is sent', () => {
  mount(); open(); click(button('EDIT ACTIVITY')); click(radio('Moderate'));
  vi.spyOn(domain, 'saveState').mockReturnValue(false); click(button('SAVE ACTIVITY'));
  expect(document.querySelector('[role="alert"]').textContent).toContain('Could not save'); expect(current).toEqual(initial);
  click(document.querySelector('[aria-label="Back to activity"]')); click(button('Delete activity')); advance(400); click(button('DELETE ACTIVITY'));
  expect(document.querySelector('[role="alertdialog"] [role="alert"]').textContent).toContain('Could not save');
  expect(current).toEqual(initial); expect(recordAccountSyncDeleteIntent).not.toHaveBeenCalled();
});
it('a failed delete-intent write can retry without a second local mutation', () => {
  mount(); openDelete(); vi.mocked(recordAccountSyncDeleteIntent).mockImplementationOnce(() => { throw Error('storage'); });
  click(button('DELETE ACTIVITY')); expect(current.optionalSessions).toEqual([]); expect(document.querySelector('[role="alert"]').textContent).toContain('Try again');
  expect(button('KEEP ACTIVITY')).toBeUndefined(); expect(button('CLOSE')).toBeDefined();
  click(button('RETRY CLOUD REMOVAL')); advance(800); expect(updates).toHaveBeenCalledOnce(); expect(recordAccountSyncDeleteIntent).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.optional-activity-details')).toBeNull();
});
