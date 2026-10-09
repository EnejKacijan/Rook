import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Today, Detail, ModalLayer, ActiveOptionalSession } from './App.jsx';
import * as domain from './domain.js';
import { useAnimationClock } from './testAnimationClock.js';
import { recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
vi.mock('./accountSyncOutbox.js', async original => ({ ...await original(), recordAccountSyncDeleteIntent: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, initial, current, navigation;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = node => act(() => node.click());
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const radio = text => [...document.querySelectorAll('[role="radio"]')].find(node => node.textContent === text);
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({ top = 0 } = {}) { this.scrollTop = top; }; HTMLElement.prototype.scrollIntoView = () => {};
  initial = domain.blankState();
  Object.assign(initial.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Tue', 'Thu'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false });
  initial.program = domain.buildProgram(initial.profile); initial.ai.planUpgradeDismissed = true;
  initial.selectedDate = domain.isoDay(); initial.selectedDay = 'Sun'; navigation = vi.fn();
  vi.mocked(recordAccountSyncDeleteIntent).mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount(detailValue = null, activeScreen = false) {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState(detailValue), [page, setPage] = useState(activeScreen ? 'optional-session' : 'today'), background = useRef(null); current = state;
    const update = fn => setState(previous => fn(previous));
    const navigate = page => { navigation(page); setPage(page); };
    return <><div ref={background}>{page === 'optional-session' ? <ActiveOptionalSession state={state} update={update} setPage={navigate} /> : <Today state={state} update={update} setPage={navigate} setDetail={setDetail} />}</div>
      {detail && <ModalLayer backgroundRef={background} close={() => setDetail(null)}>{close => <Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail} setPage={navigate} />}</ModalLayer>}</>;
  }
  act(() => root.render(<Harness />)); advance(300);
}
const open = () => { click(button('+ Add optional activity')); advance(300); click(button('ConditioningOptional cardio / conditioning work.')); advance(300); };
it('A/B: Rest day keeps recovery copy and groups Light cardio and Conditioning inside the chooser', () => {
  mount(); expect(document.querySelector('.rest-day-state').textContent).toContain('Rest dayThis is a planned recovery day.');
  expect(document.querySelector('.today-optional-actions')).toBeNull();
  click(button('+ Add optional activity')); advance(300);
  click(button('Light cardioEasy aerobic movement.')); advance(300);
  expect([...document.querySelectorAll('[role="radio"]')].map(node => node.textContent)).toEqual(['Easy', 'Moderate']); expect(current).toEqual(initial);
});
it('C/D/E: type picker and shared selectors update immediately; start persists interval configuration', () => {
  mount(); open(); expect(document.querySelectorAll('select option')).toHaveLength(9);
  expect(radio('Moderate').getAttribute('aria-checked')).toBe('true'); expect(radio('Easy')).toBeUndefined();
  click(document.querySelector('[aria-label="Increase duration"]')); expect(document.querySelector('output').textContent).toBe('25 min');
  click(radio('Intervals')); click(radio('Hard')); click(document.querySelector('[aria-label="Increase rounds"]'));
  expect(radio('Intervals').getAttribute('aria-checked')).toBe('true'); expect(radio('Hard').getAttribute('aria-checked')).toBe('true');
  click(button('START SESSION')); advance(400);
  expect(current.activeOptionalSession).toMatchObject({ kind: 'Conditioning', intent: 'conditioning', format: 'intervals', intensity: 'Hard', intervals: { rounds: 9, workSeconds: 30, restSeconds: 60 } });
  expect(navigation).toHaveBeenCalledWith('optional-session'); expect(document.querySelector('.conditioning-phase').textContent).toContain('Round 1 of 9WORK');
});
it('L: active strength offers return and cannot start another primary session', () => {
  initial.activeWorkout = { id: 'strength', name: 'Current workout', source: 'freestyle', startedAt: Date.now(), workoutDateKey: domain.isoDay(), exercises: [], exerciseIndex: 0 };
  mount({ conditioning: domain.isoDay() }); expect(document.querySelector('.conditioning-sheet').textContent).toContain('Your strength workout is active.');
  expect(button('START SESSION')).toBeUndefined(); click(button('RETURN TO ACTIVE SESSION')); expect(navigation).toHaveBeenCalledWith('workout'); expect(current).toEqual(initial);
});
it('strength days retain their primary workout and expose the secondary action and completed conditioning', () => {
  initial.profile.availableDays = ['Sun', 'Tue']; initial.program = domain.buildProgram(initial.profile);
  initial = domain.finishOptionalSession(domain.startOptionalSession(initial, { kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'steady', duration: 20, intensity: 'Moderate' }, Date.now() - 1200000));
  mount(); expect(document.querySelector('.rest-day-state')).toBeNull(); expect(button('START WORKOUT')).toBeDefined();
  expect(button('+ Conditioning')).toBeDefined(); expect(button('+ Light cardio')).toBeUndefined();
  expect(document.querySelector('.optional-session-note').textContent).toContain('Rower completed20 min · Moderate');
});
it('G/H/I: completed interval details reuse editor and canonical confirmation, keeping stable ID and scoped deletion', () => {
  initial = domain.finishOptionalSession(domain.startOptionalSession(initial, { kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'intervals', intervals: { rounds: 8, workSeconds: 30, restSeconds: 60 }, intensity: 'Hard' }, Date.now() - 660000));
  const original = initial.optionalSessions[0]; mount(); click(document.querySelector('.optional-session-note')); advance(300);
  expect(document.querySelector('.optional-activity-details').textContent).toContain('CONDITIONINGRower8 rounds · Hard8 × 30/60 sec');
  click(button('EDIT ACTIVITY')); click(radio('Moderate')); click(document.querySelector('[aria-label="Decrease rounds"]')); click(button('SAVE ACTIVITY'));
  expect(current.optionalSessions[0]).toMatchObject({ id: original.id, intensity: 'Moderate', intervals: { rounds: 7 }, completedAt: original.completedAt });
  click(button('Delete activity')); advance(400); click(button('KEEP ACTIVITY')); advance(400); expect(current.optionalSessions).toHaveLength(1);
  click(button('Delete activity')); advance(400); click(button('DELETE ACTIVITY')); advance(800);
  expect(current.optionalSessions).toEqual([]); expect(current.program).toEqual(initial.program); expect(current.workouts).toEqual(initial.workouts);
  expect(recordAccountSyncDeleteIntent).toHaveBeenCalledExactlyOnceWith(localStorage, initial.profile.id, 'optionalSessions', original.id);
});
it('J/K: focus after background refreshes phase immediately; double finish stores one canonical completion', () => {
  initial = domain.startOptionalSession(initial, { kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'intervals', intervals: { rounds: 8, workSeconds: 30, restSeconds: 60 }, intensity: 'Hard' });
  mount(null, true); vi.setSystemTime(Date.now() + 216000); act(() => window.dispatchEvent(new Event('focus')));
  expect(document.querySelector('.conditioning-phase').textContent).toContain('Round 3 of 8REST'); expect(document.querySelector('.optional-session-clock').textContent).toBe('0:54');
  const save = vi.spyOn(domain, 'saveState'), finish = button('FINISH SESSION'); act(() => { finish.click(); finish.click(); });
  expect(current.optionalSessions).toHaveLength(1); expect(save).toHaveBeenCalledOnce(); expect(current.activeOptionalSession).toBeNull();
  expect(document.querySelector('.optional-session-complete').textContent).toContain('SESSION COMPLETE');
  expect(document.querySelector('.optional-session-complete').textContent).toContain('8 × 30/60 sec');
  expect(navigation).not.toHaveBeenCalledWith('today');
});
it('cancel confirmation retains the session on Keep and discards without history on Cancel', () => {
  initial = domain.startOptionalSession(initial, { kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'steady', duration: 20, intensity: 'Moderate' }, Date.now() - 60000);
  mount(null, true); click(button('Cancel session')); click(button('KEEP SESSION')); expect(current).toEqual(initial);
  click(button('Cancel session')); click(button('CANCEL SESSION')); expect(current.optionalSessions).toEqual([]); expect(current.activeOptionalSession).toBeNull();
});
it('failed local finish stays active with a recoverable error; retry creates one completion', () => {
  initial = domain.startOptionalSession(initial, { kind: 'Conditioning', intent: 'conditioning', activity: 'Bike', format: 'steady', duration: 20, intensity: 'Moderate' });
  mount(null, true); vi.spyOn(domain, 'saveState').mockReturnValueOnce(false); click(button('FINISH SESSION'));
  expect(current).toEqual(initial); expect(document.querySelector('[role="alert"]').textContent).toContain('Could not save');
  click(button('FINISH SESSION')); expect(current.optionalSessions).toHaveLength(1);
});
