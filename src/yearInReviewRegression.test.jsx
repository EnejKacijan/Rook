import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { blankState } from './domain.js';
import { yearInReview } from './yearInReview.js';
import { YearInReview } from './YearInReview.jsx';
import { YEAR_REVIEW_DEMO_TODAY, yearReviewDemoState } from './yearReviewDemoData.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; });
const bench = (id, weight, reps = 8) => ({ id, exerciseId: 'barbell-bench-press', sets: [{ id: `${id}-set`, weight, reps, completed: true }] });
const workout = (id, day, exercises) => ({ id, startedAt: Date.parse(`${day}T12:00:00Z`), completedAt: `${day}T13:00:00Z`, durationSeconds: 3600, exercises });
const state = workouts => ({ ...blankState(), workouts });

describe('annual results across real sessions', () => {
  it('does not turn two instances of an exercise in one workout into an improvement', () => {
    const stats = yearInReview(state([workout('one', '2026-04-01', [bench('a', 40), bench('b', 50)])]), 2026);
    expect(stats).toMatchObject({ workouts: 1, sets: 2, improvements: [] });
  });

  it('compares the best real set in each workout once, preserving its weight and reps', () => {
    const stats = yearInReview(state([
      workout('first', '2026-04-01', [bench('a', 40, 12), bench('b', 50, 8)]),
      workout('second', '2026-05-01', [bench('c', 55, 10), bench('d', 55, 8)]),
    ]), 2026);
    expect(stats.improvements).toHaveLength(1);
    expect(stats.improvements[0]).toMatchObject({
      sessions: 2, from: { workoutId: 'first', weight: 50, reps: 8 },
      to: { workoutId: 'second', weight: 55, reps: 10 }, loadGain: 5, repGain: 2,
    });
    expect(stats.sets).toBe(4);
  });

  it('counts one exercise record per session even when saved IDs contain colons', () => {
    const stats = yearInReview(state([
      workout('baseline', '2025-04-01', [bench('a', 40)]),
      workout('import:2026:1', '2026-04-01', [bench('b', 50, 10)]),
      workout('import:2026:2', '2026-05-01', [bench('c', 55, 12)]),
    ]), 2026);
    expect(stats.records.sessions).toBe(2);
    expect(stats.records.top).toEqual([expect.objectContaining({ exerciseId: 'barbell-bench-press', count: 2 })]);
  });
});

describe('annual review during a history update', () => {
  it.each(['short', 'empty'])('keeps an active page when history changes to %s', kind => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const render = value => act(() => root.render(<YearInReview state={value} close={() => {}} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />));
    render(yearReviewDemoState('rich'));
    for (let i = 0; i < 9; i++) act(() => host.querySelector('[aria-label="Next page"]').click());
    expect(host.querySelector('.year-page.is-active')?.getAttribute('aria-label')).toBe('Your year in numbers');
    render(kind === 'empty' ? state([]) : yearReviewDemoState('short'));
    const pages = host.querySelectorAll('.year-page');
    expect(host.querySelectorAll('.year-page.is-active')).toHaveLength(1);
    expect(host.querySelector('.year-track').style.getPropertyValue('--index')).toBe(String(pages.length - 1));
    expect(host.querySelector('[aria-live="polite"]').textContent).toContain(`Page ${pages.length} of ${pages.length}:`);
    expect(host.textContent).not.toContain('undefined');
  });
});
