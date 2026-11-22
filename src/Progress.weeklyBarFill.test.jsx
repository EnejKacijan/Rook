import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Progress, noteWeeklyConsistencyFromFinish } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { consistencyForCurrentWeek, isoDay, weekDate, workoutPerformedDate, workoutSetSummary } from './domain.js';
import { clearWeeklyConsistencyMotion } from './weeklyConsistencyMotion.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, reduced, observers;

function counted(state) {
  const start = isoDay(weekDate('Mon', new Date())), end = isoDay(weekDate('Sun', new Date()));
  return state.workouts.filter(w => w.completedAt && !w.historicalImport && w.source !== 'freestyle'
    && workoutPerformedDate(w) >= start && workoutPerformedDate(w) <= end && workoutSetSummary(w).completed > 0);
}
// A week with `completed` of its planned sessions done, plus the state one session earlier.
function weekWith(completed) {
  const state = createReturningUserFixture(2);
  const planned = consistencyForCurrentWeek(state).planned;
  expect(planned).toBeGreaterThanOrEqual(completed);
  const template = state.workouts.find(w => w.completedAt && w.source !== 'freestyle' && workoutSetSummary(w).completed > 0);
  const monday = weekDate('Mon', new Date());
  const thisWeek = Array.from({ length: completed }, (_, index) => {
    const day = new Date(monday); day.setDate(day.getDate() + index); day.setHours(10, 0, 0, 0);
    const end = new Date(day.getTime() + 3600e3).toISOString();
    return { ...template, id: `this-week-${index}`, startedAt: day.toISOString(), completedAt: end, endedAt: end, workoutDateKey: isoDay(day) };
  });
  const earlier = state.workouts.filter(w => !counted({ workouts: [w] }).length);
  const after = { ...state, workouts: [...earlier, ...thisWeek] };
  const before = { ...after, workouts: after.workouts.filter(w => w.id !== thisWeek.at(-1).id) };
  expect(consistencyForCurrentWeek(after).completed).toBe(completed);
  expect(consistencyForCurrentWeek(before).completed).toBe(completed - 1);
  return { before, after, planned };
}
const bars = () => [...host.querySelectorAll('.consistency-bars i')].map(i => i.className);
const mark = () => host.querySelector('.weekly-completion-mark');
async function render(state) {
  if (!root) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  await act(async () => root.render(<Progress state={state} update={() => {}} setPage={() => {}} setDetail={() => {}} />));
}
async function unmount() { await act(async () => root?.unmount()); host?.remove(); root = null; }
const showCard = async () => act(async () => observers.forEach(fn => fn([{ isIntersecting: true, intersectionRatio: 1 }])));
const tick = async ms => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date(2026, 10, 22, 18, 0)); // Sunday: the whole week is in the past
  reduced = false; observers = new Set(); clearWeeklyConsistencyMotion();
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('reduced-motion') ? reduced : false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class { constructor(fn) { this.fn = fn; } observe(node) { if (node.classList?.contains('consistency-bars')) observers.add(this.fn); } disconnect() { observers.delete(this.fn); } });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(async () => { await unmount(); clearWeeklyConsistencyMotion(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('fills the new bar once the card is visible, and only once', async () => {
  const { before, after, planned } = weekWith(2);
  noteWeeklyConsistencyFromFinish(before, after);
  await render(after);
  // The counter and its label are final before any motion.
  expect(host.querySelector('.consistency').getAttribute('aria-label')).toContain(`2 of ${planned} planned sessions`);
  expect(bars().slice(0, 2)).toEqual(['filled', '']);
  await showCard();
  expect(bars().slice(0, 2)).toEqual(['filled', 'is-filling']);
  await tick(400);
  expect(bars().slice(0, 2)).toEqual(['filled', 'filled']);
  await unmount();
  await render(after);
  expect(bars().slice(0, 2)).toEqual(['filled', 'filled']);
  expect(observers.size).toBe(0);
});

it('emphasizes the existing check after the last planned bar fills', async () => {
  const { planned } = weekWith(1);
  const { before, after } = weekWith(planned);
  noteWeeklyConsistencyFromFinish(before, after);
  await render(after);
  expect(mark().className).toContain('is-awaiting-fill');
  await showCard();
  expect(bars()[planned - 1]).toBe('is-filling');
  expect(mark().className).toContain('is-emphasized');
  expect(mark().style.getPropertyValue('--weekly-mark-delay')).toBe('250ms');
  expect(host.querySelector('.consistency').getAttribute('aria-label')).toContain('Week complete.');
  await tick(800);
  expect(mark().className).toBe('weekly-completion-mark');
  expect(bars().every(name => name === 'filled')).toBe(true);
});

it('shows the real state at once with reduced motion', async () => {
  const { before, after } = weekWith(2);
  reduced = true;
  noteWeeklyConsistencyFromFinish(before, after);
  await render(after);
  expect(bars().slice(0, 2)).toEqual(['filled', 'filled']);
  expect(observers.size).toBe(0);
});

it('drops the fill when the week changes before the card is shown', async () => {
  const { before, after } = weekWith(2);
  noteWeeklyConsistencyFromFinish(before, after);
  // A schedule change, import or new week changes the counted truth.
  await render(before);
  expect(bars()[1]).toBe('');
  await render(after);
  expect(bars().slice(0, 2)).toEqual(['filled', 'filled']);
});
