import React, {act, StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {WeeklySessionProgress, weeklySessionInProgress, weeklyCompletionIds} from './WeeklySessionProgress.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {startWorkout} from './domain.js';
import {effectiveWeekSchedule, applyFlexibleWeek, proposeFlexibleWeek} from './flexibleWeek.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, scope, sequence = 0;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00'));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  scope = `weekly-test-${++sequence}`;
});
afterEach(() => {act(() => root.unmount()); host.remove(); vi.useRealTimers();});
const render = props => act(() => root.render(<StrictMode><WeeklySessionProgress scope={scope} completed={2} planned={5} completionIds={['a', 'b']} {...props}/></StrictMode>));
const bars = () => [...host.querySelectorAll('[data-state]')];

it('keeps active status separate from completion bars and never adds a completion for logging sets', () => {
  render({active:true});
  expect(bars().map(x => x.dataset.state)).toEqual(['complete','complete','pending','pending','pending']);
  expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('2');
  expect(host.textContent).toBe('1 workout in progress'); expect(host.querySelector('.is-newly-completed')).toBeNull();
  expect(host.querySelector('.weekly-session-meter').firstElementChild.textContent).toBe('1 workout in progress');
  expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuetext')).toBe('2 of 5 completed. One workout in progress.');
  render({active:true}); expect(host.querySelector('.is-newly-completed')).toBeNull();
  render({completed:3, completionIds:['a','b','c']});
  expect(bars().map(x => x.classList.contains('is-newly-completed'))).toEqual([false,false,true,false,false]);
  expect(host.querySelector('[data-state="current"]')).toBeNull(); expect(host.textContent).toBe('');
  expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('3');
});
it('retains once-per-visit feedback across tab remounts and skips replay after an unrelated rerender', () => {
  render(); act(() => root.render(null));
  render({completed:3, completionIds:['a','b','c']}); expect(host.querySelectorAll('.is-newly-completed')).toHaveLength(1);
  render({completed:3, completionIds:['a','b','c'],active:true}); expect(host.querySelectorAll('.is-newly-completed')).toHaveLength(1);
  act(() => root.render(null)); render({completed:3, completionIds:['a','b','c']});
  expect(host.querySelector('.is-newly-completed')).toBeNull();
});
it('does not celebrate a changed denominator, a count correction without a new session, or a different week/profile', () => {
  render(); render({planned:6}); expect(host.querySelector('.is-newly-completed')).toBeNull();
  render({completed:3}); expect(host.querySelector('.is-newly-completed')).toBeNull();
  scope = `next-week-${sequence}`; render({completed:4,completionIds:['a','b','c','d']});
  expect(host.querySelector('.is-newly-completed')).toBeNull();
});
it('handles undo, all-complete and an empty plan without a phantom active segment', () => {
  render(); render({completed:1, completionIds:['a']}); expect(host.querySelector('.is-newly-completed')).toBeNull();
  render({completed:2, completionIds:['a','new']}); expect(bars()[1].classList.contains('is-newly-completed')).toBe(true);
  render({completed:5, completionIds:['a','new','c','d','e'],active:true});
  expect(bars().every(x => x.dataset.state==='complete')).toBe(true); expect(host.textContent).toBe('');
  render({planned:0}); expect(host.firstChild).toBeNull();
});

const range = ['2026-10-26','2026-11-01'];
function activeFixture() {
  const state = combineExample(); state.program.rotationStartDate=range[0]; state.program.createdAt=new Date('2026-10-26T08:00:00').getTime(); state.program.trainingBlock=null;
  state.selectedDate='2026-10-28'; state.activeWorkout=startWorkout(state,state.program.days[1]);
  return state;
}
it('recognizes a canonical planned active session, even before its first set is checked', () => {
  const state=activeFixture(), before=JSON.stringify(state);
  expect(weeklySessionInProgress(state,...range)).toBe(true); expect(JSON.stringify(state)).toBe(before);
});
it.each(['freestyle','repeat','optional','last-week','wrong-occurrence','already-completed'])('does not show a planned active-workout status for %s', kind => {
  const state=activeFixture(), active=state.activeWorkout;
  if(kind==='freestyle'||kind==='repeat')active.source=kind;
  if(kind==='optional')active.optionalSessionId='optional';
  if(kind==='last-week')active.startedAt=new Date('2026-10-25T23:30:00').getTime();
  if(kind==='wrong-occurrence')active.logicalSessionId='pull-source:2026-10-21';
  if(kind==='already-completed')state.workouts.push({...active,id:'finished',completedAt:new Date().toISOString()});
  expect(weeklySessionInProgress(state,...range)).toBe(false);
});
it('recognizes a moved occurrence using its durable identity and actual training week', () => {
  let state=activeFixture(); state.activeWorkout=null;
  const item=effectiveWeekSchedule(state,'2026-10-29')[0];
  const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:item.logicalSessionId,toDate:'2026-10-29'});
  expect(proposal.status).toBe('ready'); state=applyFlexibleWeek(state,proposal).state;
  const moved=effectiveWeekSchedule(state,'2026-10-29').find(row=>row.logicalSessionId===item.logicalSessionId);
  state.selectedDate='2026-10-29'; state.activeWorkout=startWorkout(state,moved.workout);
  expect(weeklySessionInProgress(state,...range)).toBe(true);
});
it('identifies a combined active session through its source reservations without counting two completions', () => {
  const state=activeFixture(), item=effectiveWeekSchedule(state,'2026-10-29')[0];
  state.activeWorkout.programDayId='combined'; state.activeWorkout.logicalSessionId='combined';
  state.activeWorkout.adjustment={schemaVersion:1,mode:'combine',sourceSessions:[{programId:state.program.id,logicalSessionId:item.logicalSessionId}]};
  expect(weeklySessionInProgress(state,...range)).toBe(true);
  state.activeWorkout.adjustment.sourceSessions[0].programId='other-plan'; expect(weeklySessionInProgress(state,...range)).toBe(false);
});
it('animation receipts exclude imports, freestyle, pending history and other weeks', () => {
  const workout={id:'real',completedAt:'2026-10-29T12:00:00',startedAt:new Date('2026-10-29T11:00:00').getTime()};
  const rows=[workout,{...workout,id:'import',historicalImport:true},{...workout,id:'free',source:'freestyle'},
    {...workout,id:'pending',completedAt:null},{...workout,id:'old',startedAt:new Date('2026-10-25T11:00:00').getTime()}];
  expect(weeklyCompletionIds(rows,...range)).toEqual(['real']);
});
