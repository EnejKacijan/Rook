import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { blankState } from './domain.js';
import { assertStateShape } from './localStateStorage.js';
import { authoritativeWorkouts, reliableDurationSeconds, yearInReview, yearReviewPages, yearReviewYears, yearHeadline } from './yearInReview.js';
import { YEAR_REVIEW_DEMO_TODAY, yearReviewDemoState } from './yearReviewDemoData.js';
import { YearInReview, YearReviewTodayCard, YearReviewProgressEntry, yearReviewCardYear, durationLabel } from './YearInReview.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; });
function render(ui) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(ui)); return host; }
const click = element => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const button = name => [...host.querySelectorAll('button')].find(item => (item.getAttribute('aria-label') || item.textContent).trim() === name);

let serial = 0;
const set = (weight, reps, extra = {}) => ({ id: `s${++serial}`, weight, reps, completed: true, ...extra });
const lift = (exerciseId, sets, extra = {}) => ({ id: `e${++serial}`, exerciseId, sets, ...extra });
// Local wall-clock start, so dates follow the device calendar like the app.
function session(id, [y, m, d, h = 18, min = 0], exercises, { minutes = 50, ...extra } = {}) {
  const startedAt = new Date(y, m - 1, d, h, min).getTime();
  return { id, name: 'Workout', status: 'completed', startedAt, completedAt: new Date(startedAt + (minutes ?? 50) * 60000).toISOString(),
    ...(minutes == null ? {} : { durationSeconds: minutes * 60 }), exercises, ...extra };
}
const bench = (weight, reps) => [lift('barbell-bench-press', [set(weight, reps)])];
function state(workouts = [], extra = {}) {
  const value = blankState();
  Object.assign(value.profile, { id: 'test-profile', units: 'kg', onboardingComplete: true });
  value.program = null;
  value.workouts = workouts;
  return Object.assign(value, extra);
}

describe('year boundary and local dates', () => {
  it('assigns a workout to the local day it started, even across midnight', () => {
    const s = state([
      session('nye-2025', [2025, 12, 31, 23, 40], bench(60, 8), { minutes: 50 }),
      session('nye-2026', [2026, 12, 31, 23, 30], bench(62.5, 8), { minutes: 55 }),
    ]);
    expect(new Date(s.workouts[1].completedAt).getFullYear()).toBe(2027);
    expect(yearInReview(s, 2026)).toMatchObject({ workouts: 1, firstDay: '2026-12-31', lastDay: '2026-12-31' });
    expect(yearInReview(s, 2025).workouts).toBe(1);
    expect(yearInReview(s, 2027).workouts).toBe(0);
  });

  it('uses the timezone recorded at the start of the workout', () => {
    // Noon UTC on Dec 31 is already Jan 1 in Auckland.
    const s = state([{ ...session('nz', [2026, 12, 31], bench(60, 8)), startedAt: Date.UTC(2026, 11, 31, 12), completedAt: '2026-12-31T13:00:00.000Z', timeZoneAtStart: 'Pacific/Auckland' }]);
    expect(yearInReview(s, 2027).workouts).toBe(1);
    expect(yearInReview(s, 2026).workouts).toBe(0);
  });

  it('unlocks a year only once the local date reaches January 1', () => {
    const s = state([session('a', [2025, 6, 1], bench(60, 8)), session('b', [2026, 6, 1], bench(60, 8))]);
    expect(yearReviewYears(s, '2026-12-31')).toEqual([2025]);
    expect(yearReviewYears(s, '2027-01-01')).toEqual([2026, 2025]);
  });

  it('counts a moved workout in the year it was performed', () => {
    const s = state([session('moved', [2027, 1, 2], bench(60, 8), { flexibleWeekMoved: true, canonicalPlanDate: '2026-12-31' })]);
    expect(yearInReview(s, 2026).workouts).toBe(0);
    expect(yearInReview(s, 2027)).toMatchObject({ workouts: 1, movedWorkouts: 1 });
  });

  it('dates imports by their source day', () => {
    const s = state([{ id: 'imp', name: 'Imported', status: 'completed', completedAt: '2027-01-03T10:00:00.000Z', sourceDate: { day: '2026-12-30', precision: 'date' },
      historicalImport: { fingerprint: 'f1' }, exercises: bench(60, 8) }]);
    expect(yearInReview(s, 2026)).toMatchObject({ workouts: 1, importedWorkouts: 1, time: { counted: 0, of: 1 } });
  });
});

describe('one record per real session', () => {
  it('uses the correction, not the superseded record', () => {
    const original = session('w1', [2026, 3, 2], bench(60, 8), { minutes: 40 });
    const corrected = { ...structuredClone(original), id: 'w1-fixed', supersedesCompletionId: 'w1', completedAt: new Date(original.startedAt + 3000000).toISOString(), durationSeconds: 3000, exercises: bench(60, 10) };
    const stats = yearInReview(state([original, corrected]), 2026);
    expect(stats).toMatchObject({ workouts: 1, reps: 10, time: { totalSeconds: 3000 } });
  });

  it('counts a record stored twice once, and keeps separate same-day sessions', () => {
    const morning = session('am', [2026, 3, 2, 7], bench(60, 8));
    const evening = session('pm', [2026, 3, 2, 18], bench(60, 8));
    const resaved = { ...structuredClone(evening), id: 'pm-copy' };
    const stats = yearInReview(state([morning, evening, structuredClone(morning), resaved]), 2026);
    expect(stats).toMatchObject({ workouts: 2, trainingDays: 1, sets: 2 });
  });

  it('dedupes one imported source workout imported twice', () => {
    const imported = id => ({ id, name: 'Imported', status: 'completed', completedAt: '2026-04-01T10:00:00.000Z', sourceDate: { day: '2026-04-01' }, historicalImport: { fingerprint: 'same' }, exercises: bench(60, 8) });
    expect(yearInReview(state([imported('i1'), imported('i2')]), 2026).workouts).toBe(1);
  });

  it('does not count skipped, planned or empty workouts', () => {
    const s = state([
      session('done', [2026, 5, 1], bench(60, 8)),
      session('skipped', [2026, 5, 2], bench(60, 8), { status: 'skipped' }),
      session('empty', [2026, 5, 3], [lift('barbell-bench-press', [set(60, 8, { completed: false })])]),
    ]);
    expect(authoritativeWorkouts(s.workouts).map(w => w.id)).toEqual(['done']);
    expect(yearInReview(s, 2026).workouts).toBe(1);
  });

  it('recomputes from history, so a deleted workout disappears', () => {
    const s = state([session('a', [2026, 5, 1], bench(60, 8)), session('b', [2026, 5, 8], bench(65, 8))]);
    expect(yearInReview(s, 2026).workouts).toBe(2);
    s.workouts.pop();
    expect(yearInReview(s, 2026)).toMatchObject({ workouts: 1, improvements: [] });
  });
});

describe('logged training time', () => {
  it('sums stored durations only and reports coverage', () => {
    const s = state([
      session('a', [2026, 2, 1], bench(60, 8), { minutes: 40 }),
      session('b', [2026, 2, 3], bench(60, 8), { minutes: null }),
      session('c', [2026, 2, 5], bench(60, 8), { minutes: 60 }),
      session('d', [2026, 2, 7], bench(60, 8), { minutes: 50 }),
      // Left open for three days: a workout, not three days of training.
      { ...session('e', [2026, 2, 9], bench(60, 8)), durationSeconds: 3 * 86400 },
    ]);
    const { time, workouts } = yearInReview(s, 2026);
    expect(workouts).toBe(5);
    expect(time).toMatchObject({ totalSeconds: 150 * 60, counted: 3, of: 5, typicalSeconds: 50 * 60, longest: { seconds: 3600, day: '2026-02-05' } });
    expect(reliableDurationSeconds(0)).toBeNull();
    expect(reliableDurationSeconds('')).toBeNull();
    expect(durationLabel(150 * 60)).toBe('2 h 30 min');
  });

  it('keeps conditioning time apart from strength time', () => {
    const s = state([session('a', [2026, 2, 1], bench(60, 8), { minutes: 45 })], { optionalSessions: [
      { id: 'c1', kind: 'Conditioning', intent: 'conditioning', status: 'completed', startedAt: new Date(2026, 1, 2, 7).getTime(), completedAt: new Date(2026, 1, 2, 7, 20).toISOString(), elapsedSeconds: 1200 },
      { id: 'c1', kind: 'Conditioning', intent: 'conditioning', status: 'completed', startedAt: new Date(2026, 1, 2, 7).getTime(), completedAt: new Date(2026, 1, 2, 7, 20).toISOString(), elapsedSeconds: 1200 },
      { id: 'w1', kind: 'Cardio', intent: 'recoveryCardio', status: 'completed', startedAt: new Date(2026, 1, 3, 7).getTime(), completedAt: new Date(2026, 1, 3, 7, 30).toISOString() },
      { id: 'p1', kind: 'Conditioning', intent: 'conditioning', status: 'active', startedAt: new Date(2026, 1, 4, 7).getTime() },
    ] });
    const stats = yearInReview(s, 2026);
    expect(stats.time.totalSeconds).toBe(45 * 60);
    expect(stats.conditioning).toEqual({ sessions: 1, seconds: 1200, counted: 1 });
    expect(stats.otherActivities).toEqual({ sessions: 1, seconds: 0, counted: 0 });
    expect(stats).toMatchObject({ workouts: 1, trainingDays: 3, strengthDays: 1 });
  });

  it('counts long saved sessions in totals, the median, longest and previous-year time', () => {
    const s = state([
      session('old', [2025, 2, 1], bench(60, 8), { minutes: 420 }),
      session('long', [2026, 2, 1], bench(60, 8), { minutes: 390 }),
      session('short', [2026, 2, 2], bench(60, 8), { minutes: 60 }),
    ]);
    expect(yearInReview(s, 2026)).toMatchObject({
      time: { totalSeconds: 450 * 60, counted: 2, of: 2, typicalSeconds: 225 * 60, longest: { seconds: 390 * 60 } },
      previous: { time: { totalSeconds: 420 * 60, counted: 1, of: 1 } },
    });
  });

  it('uses reviewed training time without adding excluded pauses back in', () => {
    const reviewed = session('reviewed', [2026, 2, 1, 8], bench(60, 8), { minutes: 600 });
    Object.assign(reviewed, { durationSeconds: 390 * 60, excludedIdleMs: 210 * 60000, timingReviewedAt: Date.parse(reviewed.completedAt) });
    expect(yearInReview(state([reviewed]), 2026).time).toMatchObject({ totalSeconds: 390 * 60, counted: 1, of: 1 });
  });

  it('keeps explicit long import durations when precise timestamps are unavailable', () => {
    const imported = { id: 'date-only', completedAt: '2026-02-01', sourceDate: { day: '2026-02-01', precision: 'date' }, historicalImport: { fingerprint: 'long-import' }, durationSeconds: 390 * 60, exercises: bench(60, 8) };
    expect(yearInReview(state([imported]), 2026).time).toMatchObject({ totalSeconds: 390 * 60, counted: 1 });
    expect(reliableDurationSeconds(390 * 60, { startedAt: '2026-02-01T08:00:00', completedAt: '2026-02-01T14:30:00' })).toBe(390 * 60);
  });

  it('rejects contradictory precise timestamps and invalid values without a time cap', () => {
    const workout = session('a', [2026, 2, 1], bench(60, 8), { minutes: 390 });
    expect(reliableDurationSeconds(390 * 60, workout)).toBe(390 * 60);
    expect(reliableDurationSeconds(391 * 60, workout)).toBeNull();
    expect(reliableDurationSeconds(390 * 60, { ...workout, endedAt: workout.startedAt - 1 })).toBeNull();
    expect(reliableDurationSeconds(390 * 60, { ...workout, endedAt: workout.startedAt + 3600000 })).toBeNull();
    for (const value of [0, -1, null, undefined, '', NaN, Infinity, true, [], Number.MAX_VALUE]) expect(reliableDurationSeconds(value)).toBeNull();
  });

  it('counts long conditioning separately using its saved elapsed time', () => {
    const startedAt = new Date(2026, 1, 1, 8).getTime();
    const s = state([], { optionalSessions: [{ id: 'long-bike', kind: 'Conditioning', intent: 'conditioning', status: 'completed', startedAt, completedAt: new Date(startedAt + 8 * 3600000).toISOString(), elapsedSeconds: 6 * 3600 }] });
    expect(yearInReview(s, 2026)).toMatchObject({ time: { totalSeconds: 0 }, conditioning: { sessions: 1, seconds: 6 * 3600, counted: 1 } });
  });
});

describe('records and improvements', () => {
  it('compares January against earlier years, so the first session is not a record by itself', () => {
    const history = [session('old1', [2025, 11, 1], bench(80, 8)), session('old2', [2025, 11, 8], bench(80, 8))];
    const s = state([...history, session('jan', [2026, 1, 3], bench(70, 8)), session('feb', [2026, 2, 3], bench(82.5, 8))]);
    const { records } = yearInReview(s, 2026);
    expect(records.sessions).toBe(1);
    expect(records.top[0]).toMatchObject({ exerciseId: 'barbell-bench-press', weight: 82.5, reps: 8 });
    expect(yearInReview(state([session('only', [2026, 1, 3], bench(70, 8))]), 2026).records.sessions).toBe(0);
  });

  it('shows weight and reps from the same real set', () => {
    const s = state([
      session('a', [2026, 1, 5], [lift('barbell-bench-press', [set(50, 8), set(45, 10)])]),
      session('b', [2026, 3, 5], [lift('barbell-bench-press', [set(55, 10), set(52.5, 12)])]),
    ]);
    const [item] = yearInReview(s, 2026).improvements;
    expect(item).toMatchObject({ from: { weight: 50, reps: 8 }, to: { weight: 55, reps: 10 }, loadGain: 5, repGain: 2 });
    // 55 × 12 never happened, so it is never shown.
    const mixed = state([
      session('a', [2026, 1, 5], bench(50, 8)),
      session('b', [2026, 3, 5], [lift('barbell-bench-press', [set(55, 6), set(50, 12)])]),
    ]);
    expect(yearInReview(mixed, 2026).improvements[0]).toMatchObject({ to: { weight: 55, reps: 6 }, loadGain: 5, repGain: -2 });
  });

  it('keeps deload sessions out of records and improvements but counts them as training', () => {
    const deload = { trainingBlock: { plannedDeload: true, phase: 'deload' } };
    const s = state([
      session('a', [2026, 1, 5], bench(60, 8)),
      session('d', [2026, 1, 12], bench(90, 8), deload),
      session('b', [2026, 1, 19], bench(60, 8)),
    ]);
    const stats = yearInReview(s, 2026);
    expect(stats).toMatchObject({ workouts: 3, deloadWorkouts: 1, improvements: [], records: { sessions: 0 }, time: { counted: 3 } });
  });

  it('finds no comparable result when exercises never repeat', () => {
    const s = state([session('a', [2026, 1, 5], bench(60, 8)), session('b', [2026, 1, 9], [lift('back-squat', [set(80, 5)])])]);
    const stats = yearInReview(s, 2026);
    expect(stats.improvements).toEqual([]);
    expect(yearHeadline(stats).kind).toBe('start');
  });

  it('leaves bodyweight, assisted and timed lifts out of records', () => {
    const s = state([
      session('a', [2026, 1, 5], [lift('pull-up', [set(null, 6)]), lift('assisted-pull-up', [set(30, 8)]), lift('plank', [set(null, 45, { durationSeconds: 45 })])]),
      session('b', [2026, 2, 5], [lift('pull-up', [set(null, 9)]), lift('assisted-pull-up', [set(20, 8)]), lift('plank', [set(null, 90, { durationSeconds: 90 })])]),
    ]);
    const stats = yearInReview(s, 2026);
    expect(stats.improvements).toEqual([]);
    expect(stats.records.sessions).toBe(0);
  });
});

describe('work totals', () => {
  it('counts per-side reps, segments once, and never seconds as reps', () => {
    const s = state([session('a', [2026, 1, 5], [
      lift('walking-lunge', [set(10, 12, { sides: { left: { reps: 12 }, right: { reps: 11 } } })], { loggingMode: 'per_side' }),
      lift('barbell-bench-press', [set(60, 8, { setType: 'drop', segments: [{ id: 'x', kind: 'drop', order: 1, weight: 50, reps: 6, completed: true }] })]),
      lift('plank', [set(null, 60, { durationSeconds: 60 })]),
      lift('pull-up', [set(null, 8)]),
      lift('assisted-pull-up', [set(25, 10)]),
    ])]);
    const stats = yearInReview(s, 2026);
    expect(stats.sets).toBe(5);
    expect(stats.reps).toBe(23 + 8 + 6 + 0 + 8 + 10);
    expect(stats.holdSeconds).toBe(60);
    // Lunge 10 × 23, bench 60 × 8 + 50 × 6. No pull-up, assisted or plank load.
    expect(stats.volumeKg).toBe(230 + 480 + 300);
    expect(stats.volumeSets).toBe(2);
  });
});

describe('story pages adapt to the data', () => {
  it('shows an empty page for a year without training', () => {
    expect(yearReviewPages(yearInReview(state(), 2026))).toEqual([{ kind: 'empty' }]);
    expect(yearReviewYears(state(), '2027-01-02')).toEqual([]);
  });

  it('keeps a single workout short', () => {
    const kinds = yearReviewPages(yearInReview(state([session('a', [2026, 4, 1], bench(60, 8))]), 2026)).map(page => page.kind);
    expect(kinds).toEqual(['intro', 'workouts', 'time', 'finale']);
  });

  it('builds each demo case to its expected length', () => {
    const pages = id => yearReviewPages(yearInReview(yearReviewDemoState(id), 2026)).map(page => page.kind);
    expect(pages('rich')).toEqual(['intro', 'workouts', 'rhythm', 'time', 'work', 'records', 'improvements', 'favorites', 'beyond', 'finale']);
    expect(pages('short')).toEqual(['intro', 'workouts', 'time', 'improvements', 'finale']);
    expect(pages('mixed')).toHaveLength(10);
    const mixed = yearInReview(yearReviewDemoState('mixed'), 2026);
    expect(mixed).toMatchObject({ workouts: 89, deloadWorkouts: 14, importedWorkouts: 3, time: { counted: 85, of: 89 } });
    expect(yearReviewYears(yearReviewDemoState('mixed'), YEAR_REVIEW_DEMO_TODAY)).toEqual([2026, 2025]);
  });

  it('keeps every demo case a valid saved state', () => {
    for (const id of ['rich', 'short', 'mixed']) expect(() => assertStateShape(yearReviewDemoState(id))).not.toThrow();
  });
});

describe('year in review viewer', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });
  const demo = () => yearReviewDemoState('rich');

  it('moves one page per tap and stops at the ends', () => {
    let closed = 0;
    render(<YearInReview state={demo()} close={() => closed++} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />);
    const current = () => [...host.querySelectorAll('.year-progress button')].findIndex(item => item.getAttribute('aria-current') === 'step');
    expect(current()).toBe(0);
    expect(button('Previous page').disabled).toBe(true);
    for (let i = 0; i < 25; i++) { const next = button('Next page'); if (next) click(next); }
    expect(current()).toBe(9);
    expect(host.querySelector('.year-page.is-active').getAttribute('aria-label')).toBe('Your year in numbers');
    expect(host.querySelectorAll('.year-page:not(.is-active)[inert]').length).toBe(9);
    click(button('Previous page'));
    expect(current()).toBe(8);
    act(() => host.querySelector('.year-review').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(current()).toBe(7);
    click(button('Close year in review'));
    expect(closed).toBe(1);
  });

  it('opens all year stats and returns to the story', () => {
    render(<YearInReview state={demo()} close={() => {}} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />);
    for (let i = 0; i < 9; i++) click(button('Next page'));
    click(button('All year stats'));
    expect(host.textContent).toContain('ALL YEAR STATS');
    expect(host.textContent).toContain('Logged training time');
    click(button('BACK TO STORY'));
    expect(host.querySelector('.year-progress')).not.toBeNull();
  });

  it('switches between years with data', () => {
    render(<YearInReview state={demo()} close={() => {}} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />);
    const select = host.querySelector('.year-select select');
    expect([...select.options].map(option => option.value)).toEqual(['2026', '2025']);
    act(() => { select.value = '2025'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('.year-review').getAttribute('aria-label')).toBe('Your year in Rook, 2025');
  });

  it('shows records with weight and reps in the profile unit', () => {
    const s = yearReviewDemoState('mixed');
    render(<YearInReview state={s} close={() => {}} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />);
    const kinds = yearReviewPages(yearInReview(s, 2026)).map(page => page.kind);
    for (let i = 0; i < kinds.indexOf('improvements'); i++) click(button('Next page'));
    const text = host.querySelector('.year-page.is-active').textContent;
    expect(text).toMatch(/135 lb × 8→ to 215 lb × 8\+80 lb/);
    expect(text).not.toMatch(/kg/);
  });
});

describe('entry points', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });
  const s = () => yearReviewDemoState('short');

  it('offers the Today card in January only, never during a workout', () => {
    expect(yearReviewCardYear(s(), '2027-01-02')).toBe(2026);
    expect(yearReviewCardYear(s(), '2027-02-01')).toBeNull();
    expect(yearReviewCardYear(s(), '2026-12-31')).toBeNull();
    expect(yearReviewCardYear({ ...s(), activeWorkout: { id: 'live' } }, '2027-01-02')).toBeNull();
  });

  it('remembers Not now without touching training data', () => {
    const value = s(), before = JSON.stringify(value);
    let opened = null;
    render(<YearReviewTodayCard state={value} open={year => { opened = year; }} today="2027-01-02" />);
    click(button('OPEN'));
    expect(opened).toBe(2026);
    click(button('NOT NOW'));
    expect(host.querySelector('.year-review-card')).toBeNull();
    expect(yearReviewCardYear(value, '2027-01-02')).toBeNull();
    expect(JSON.stringify(value)).toBe(before);
  });

  it('lists every unlocked year on Progress', () => {
    render(<YearReviewProgressEntry state={yearReviewDemoState('rich')} open={() => {}} today="2027-03-10" />);
    expect([...host.querySelectorAll('.year-review-entry-row strong')].map(item => item.textContent)).toEqual(['Your year in Rook · 2026', 'Your year in Rook · 2025']);
  });
});

describe('share image', () => {
  it('uses the story numbers, real sets and visible time coverage', async () => {
    const { yearShareContent } = await import('./yearShareCard.js');
    const short = yearShareContent(yearInReview(yearReviewDemoState('short'), 2026), 'kg');
    expect(short).toMatchObject({ year: 2026, fileName: 'ROOK-year-2026.png', line: 'Biggest jump: Leg Press',
      highlight: { from: '90 kg × 12', to: '110 kg × 10', gain: '+20 kg' } });
    expect(short.tiles).toEqual([{ label: 'Workouts', value: '4' }, { label: 'Logged time · 2 of 4', value: '1 h 39 min' },
      { label: 'Active weeks', value: '4' }, { label: 'Records', value: '7' }]);
    const mixed = yearShareContent(yearInReview(yearReviewDemoState('mixed'), 2026), 'lb');
    expect(mixed.highlight).toMatchObject({ from: '135 lb × 8', to: '215 lb × 8', gain: '+80 lb' });
    const single = yearShareContent(yearInReview(state([session('a', [2026, 4, 1], bench(60, 8))]), 2026), 'kg');
    expect(single).toMatchObject({ highlight: null, line: '1 workout logged' });
  });

  it('shares a PNG from the finale without uploading anything', async () => {
    const calls = [], fetches = [];
    const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
    const original = { getContext: HTMLCanvasElement.prototype.getContext, toBlob: HTMLCanvasElement.prototype.toBlob, share: navigator.share, canShare: navigator.canShare, fetch: globalThis.fetch };
    HTMLCanvasElement.prototype.getContext = () => context;
    HTMLCanvasElement.prototype.toBlob = callback => callback(new Blob(['png'], { type: 'image/png' }));
    Object.assign(navigator, { share: async data => { calls.push(data); }, canShare: () => true });
    globalThis.fetch = (...args) => { fetches.push(args); return Promise.reject(new Error('offline')); };
    try {
      render(<YearInReview state={yearReviewDemoState('short')} close={() => {}} initialYear={2026} today={YEAR_REVIEW_DEMO_TODAY} />);
      for (let i = 0; i < 4; i++) click(button('Next page'));
      await act(async () => { button('SHARE').dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 1700)); });
      expect(calls).toHaveLength(1);
      expect(calls[0].files[0]).toMatchObject({ name: 'ROOK-year-2026.png', type: 'image/png' });
      expect(fetches).toEqual([]);
      expect(button('SHARE').disabled).toBe(false);
    } finally {
      Object.assign(HTMLCanvasElement.prototype, { getContext: original.getContext, toBlob: original.toBlob });
      Object.assign(navigator, { share: original.share, canShare: original.canShare });
      globalThis.fetch = original.fetch;
    }
  });
});

describe('comparison with your previous year', () => {
  it('compares with last year neutrally, and time only with full coverage', () => {
    const s = state([
      session('a', [2025, 3, 1], bench(60, 8), { minutes: 40 }), session('b', [2025, 3, 8], bench(60, 8), { minutes: null }),
      session('c', [2026, 3, 1], bench(60, 8)), session('d', [2026, 3, 8], bench(60, 8)), session('e', [2026, 3, 15], bench(60, 8)),
    ]);
    const stats = yearInReview(s, 2026);
    expect(stats.previous).toEqual({ year: 2025, workouts: 2, activeWeeks: 2, sets: 2, time: { totalSeconds: 2400, counted: 1, of: 2 } });
    expect(yearInReview(s, 2025).previous).toBeNull();
    render(<YearInReview state={s} close={() => {}} initialYear={2026} today="2027-01-02" />);
    click(button('Next page'));
    expect(host.querySelector('.year-page.is-active').textContent).toContain('1 workout more than in 2025.');
  });

  it('names last year plainly when this year has fewer', () => {
    const s = state([session('a', [2025, 3, 1], bench(60, 8)), session('b', [2025, 3, 8], bench(60, 8)), session('c', [2026, 3, 1], bench(60, 8))]);
    render(<YearInReview state={s} close={() => {}} initialYear={2026} today="2027-01-02" />);
    click(button('Next page'));
    expect(host.querySelector('.year-page.is-active').textContent).toContain('2025: 2 workouts.');
  });
});
