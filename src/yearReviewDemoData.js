// Synthetic, deterministic demo profiles for "Your year in Rook". They are
// built in memory for the demo page and tests and never touch saved data.
import { blankState, buildProgram } from './domain.js';

export const YEAR_REVIEW_DEMO_TODAY = '2027-01-02';
export const YEAR_REVIEW_DEMO_CASES = [
  { id: 'rich', label: 'Rich year', detail: '4 workouts a week, records, blocks and conditioning' },
  { id: 'short', label: 'Short year', detail: 'A few workouts, some without a duration' },
  { id: 'mixed', label: 'Mixed history', detail: 'Corrections, moved and deload sessions, imports, lb' },
];

const at = (y, m, d, h = 18, min = 0) => new Date(y, m, d, h, min);
const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let serial = 0;
const set = (weight, reps, extra = {}) => ({ id: `demo-set-${++serial}`, weight, reps, completed: true, rir: 2, ...extra });
const exercise = (exerciseId, sets, extra = {}) => ({ id: `demo-ex-${++serial}`, exerciseId, sets, ...extra });
function workout({ id, start, minutes, name, exercises, ...extra }) {
  const startedAt = start.getTime();
  return { id, name, startedAt, completedAt: new Date(startedAt + (minutes ?? 50) * 60000).toISOString(),
    ...(minutes === null ? {} : { durationSeconds: minutes * 60 }), workoutDateKey: day(start), status: 'completed', exercises, ...extra };
}
const round = (value, step = 2.5) => Math.round(value / step) * step;

function baseState(units = 'kg') {
  const state = blankState();
  Object.assign(state.profile, { id: 'year-review-demo', name: 'Demo', units, onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate',
    daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'] });
  // A valid saved state: a finished profile always has a plan.
  state.program = buildProgram(state.profile);
  return state;
}

// Week n of the year, weekday offset 0 = Monday.
function weekStart(year, week) { const first = new Date(year, 0, 1, 12); const monday = new Date(first); monday.setDate(first.getDate() - ((first.getDay() + 6) % 7) + week * 7); return monday; }

function richYear() {
  serial = 0;
  const state = baseState('kg');
  const plans = [
    { name: 'Upper A', time: [18, 5], lifts: [['barbell-bench-press', 3, 60, 8], ['barbell-row', 3, 55, 10], ['dumbbell-shoulder-press', 3, 18, 10], ['lateral-raise', 3, 8, 14]] },
    { name: 'Lower A', time: [7, 10], lifts: [['back-squat', 3, 80, 6], ['romanian-deadlift', 3, 70, 8], ['leg-extension', 3, 40, 12], ['cable-crunch', 3, 25, 12]] },
    { name: 'Upper B', time: [18, 20], lifts: [['incline-dumbbell-press', 3, 22, 10], ['lat-pulldown', 3, 55, 10], ['barbell-curl', 3, 25, 10], ['plank', 3, null, 45]] },
    { name: 'Lower B', time: [10, 0], lifts: [['deadlift', 3, 110, 5], ['leg-press', 3, 140, 10], ['seated-leg-curl', 3, 35, 12], ['hip-thrust', 3, 80, 10]] },
  ];
  const weekdays = [0, 1, 3, 5];
  // Prior year: a baseline so January is not a record by calendar alone.
  for (let week = 40; week < 52; week++) plans.forEach((plan, index) => {
    const start = weekStart(2025, week); start.setDate(start.getDate() + weekdays[index]); start.setHours(...plan.time);
    state.workouts.push(workout({ id: `rich-2025-${week}-${index}`, start, minutes: 55, name: plan.name,
      exercises: plan.lifts.map(([id, count, weight, reps]) => exercise(id, Array.from({ length: count }, () => set(weight == null ? null : round(weight * 0.97), reps, weight == null ? { durationSeconds: reps } : {})))) }));
  });
  let blockWeek = 0, blockIndex = 0;
  for (let week = 0; week < 53; week++) {
    const monday = weekStart(2026, week);
    if (monday.getFullYear() > 2026) break;
    const off = week === 31 || week === 32; // two weeks away in August
    blockWeek++;
    if (!off) plans.forEach((plan, index) => {
      if (week % 9 === 4 && index === 3) return; // one missed session now and then
      const start = new Date(monday); start.setDate(monday.getDate() + weekdays[index]); start.setHours(...plan.time);
      if (start.getFullYear() !== 2026) return;
      const deload = blockWeek === 6;
      const progress = Math.floor(week / 3) * 0.012;
      state.workouts.push(workout({ id: `rich-${week}-${index}`, start, minutes: deload ? 40 : 52 + ((week * 7 + index * 5) % 26), name: plan.name,
        ...(deload ? { trainingBlock: { blockId: `rich-block-${blockIndex}`, plannedDeload: true, phase: 'deload' } } : {}),
        exercises: plan.lifts.map(([id, count, weight, reps]) => exercise(id, Array.from({ length: deload ? 2 : count }, (_, s) => weight == null
          ? set(null, reps + Math.floor(week / 6) * 5, { durationSeconds: reps + Math.floor(week / 6) * 5 })
          : set(round(weight * (1 + progress) * (deload ? 0.8 : 1)), reps + (week % 3 === 2 && s === 0 ? 1 : 0))))) }));
    });
    if (blockWeek === 6) {
      const end = new Date(monday); end.setDate(monday.getDate() + 5);
      state.completedTrainingBlocks.push({ id: `rich-block-${blockIndex}`, name: `Strength block ${blockIndex + 1}`, totalWeeks: 6, completed: true, completedAt: at(end.getFullYear(), end.getMonth(), end.getDate(), 12).toISOString(), weeks: [] });
      blockWeek = 0; blockIndex++;
    }
    if (week >= 12 && !off && week % 2 === 0) {
      const start = new Date(monday); start.setDate(monday.getDate() + 2); start.setHours(7, 0);
      state.optionalSessions.push({ id: `rich-cond-${week}`, kind: 'Conditioning', intent: 'conditioning', activity: 'Bike', intensity: 'Hard', format: 'intervals',
        intervals: { rounds: 8, workSeconds: 60, restSeconds: 90 }, duration: 18.5,
        status: 'completed', date: day(start), startedAt: start.getTime(), completedAt: new Date(start.getTime() + 24 * 60000).toISOString(), elapsedSeconds: 24 * 60 });
    }
  }
  return state;
}

function shortYear() {
  serial = 100;
  const state = baseState('kg');
  const sessions = [
    [at(2026, 2, 3, 18), 48, [['dumbbell-bench-press', 18, 10], ['lat-pulldown', 40, 10], ['leg-press', 90, 12]]],
    [at(2026, 2, 10, 18), null, [['dumbbell-bench-press', 20, 9], ['lat-pulldown', 42.5, 10], ['leg-press', 100, 12]]],
    [at(2026, 3, 2, 19), 51, [['dumbbell-bench-press', 20, 11], ['lat-pulldown', 45, 9], ['plank', null, 40]]],
    [at(2026, 4, 20, 17), null, [['dumbbell-bench-press', 22, 10], ['leg-press', 110, 10]]],
  ];
  sessions.forEach(([start, minutes, lifts], index) => state.workouts.push(workout({ id: `short-${index}`, start, minutes, name: 'Full body',
    exercises: lifts.map(([id, weight, reps]) => exercise(id, [set(weight, reps, weight == null ? { durationSeconds: reps } : {}), set(weight, reps, weight == null ? { durationSeconds: reps } : {})])) })));
  return state;
}

const LB = 0.45359237;
function mixedHistory() {
  serial = 200;
  const state = baseState('lb');
  const lb = value => Math.round(value * LB * 1000) / 1000;
  const lifts = week => [['barbell-bench-press', lb(135 + Math.floor(week / 3) * 5), 8], ['pull-up', null, 6 + Math.min(4, Math.floor(week / 8))],
    ['assisted-pull-up', lb(60 - week), 8], ['walking-lunge', lb(25), 12], ['barbell-curl', lb(55 + Math.floor(week / 6) * 5), 10]];
  for (let week = 0; week < 50; week += 1) {
    if (week % 7 === 6) continue;
    const monday = weekStart(2026, week);
    for (const [offset, hour] of [[1, 18], [4, 9]]) {
      const start = new Date(monday); start.setDate(monday.getDate() + offset); start.setHours(hour, 15);
      if (start.getFullYear() !== 2026) continue;
      const deload = week % 7 === 5;
      const moved = week % 5 === 3 && offset === 4;
      state.workouts.push(workout({ id: `mixed-${week}-${offset}`, start, minutes: 46 + (week % 4) * 6, name: offset === 1 ? 'Push / pull' : 'Full body',
        ...(deload ? { trainingBlock: { blockId: 'mixed-block', plannedDeload: true, phase: 'deload' } } : {}),
        ...(moved ? { flexibleWeekMoved: true, canonicalPlanDate: day(new Date(start.getTime() - 86400000)) } : {}),
        exercises: lifts(week).map(([id, weight, reps], index) => exercise(id, [
          set(weight == null ? null : deload ? weight * 0.85 : weight, reps),
          set(weight == null ? null : deload ? weight * 0.85 : weight, Math.max(1, reps - 1), index === 0 && week === 20 ? { setType: 'drop', segments: [{ id: 'seg-1', kind: 'drop', order: 1, weight: lb(115), reps: 6, completed: true }] } : {}),
        ], id === 'walking-lunge' ? { loggingMode: 'per_side' } : {})) }));
    }
  }
  // Per-side sets record both sides.
  for (const w of state.workouts) for (const e of w.exercises) if (e.loggingMode === 'per_side') for (const s of e.sets) s.sides = { left: { reps: s.reps }, right: { reps: s.reps } };
  // A correction: the resumed session supersedes the first completion.
  const original = state.workouts.find(w => w.id === 'mixed-10-1');
  state.workouts.push({ ...structuredClone(original), id: 'mixed-10-1-corrected', supersedesCompletionId: original.id, durationSeconds: original.durationSeconds + 600 });
  // The same record stored twice must count once.
  state.workouts.push(structuredClone(state.workouts.find(w => w.id === 'mixed-12-4')));
  // Left open for three days by mistake: counted as a workout, not as time.
  const open = state.workouts.find(w => w.id === 'mixed-15-1'); open.durationSeconds = 3 * 86400;
  // Imported history without durations, dated by its source day.
  for (const [index, month] of [2, 3, 4].entries()) state.workouts.push({ id: `mixed-import-${index}`, name: 'Imported session', status: 'completed',
    completedAt: `2026-0${month + 1}-14T12:00:00.000Z`, workoutDateKey: `2026-0${month + 1}-14`, sourceDate: { day: `2026-0${month + 1}-14`, precision: 'date' },
    historicalImport: { source: 'csv', importId: 'demo-import', fingerprint: `demo-import-${index}` },
    exercises: [exercise('leg-press', [set(lb(200), 12, { rawImport: { version: 2, loadKind: 'external' }, importSetType: 'normal' }), set(lb(200), 10, { rawImport: { version: 2, loadKind: 'external' }, importSetType: 'normal' })])] });
  // Across midnight: started on Dec 31, so it belongs to that year.
  state.workouts.push(workout({ id: 'mixed-nye', start: at(2026, 11, 31, 23, 30), minutes: 55, name: 'Late session', exercises: lifts(49).slice(0, 2).map(([id, weight, reps]) => exercise(id, [set(weight, reps)])) }));
  state.workouts.push(workout({ id: 'mixed-2025-nye', start: at(2025, 11, 31, 23, 40), minutes: 50, name: 'Late session', exercises: lifts(0).slice(0, 2).map(([id, weight, reps]) => exercise(id, [set(weight, reps)])) }));
  state.completedTrainingBlocks.push({ id: 'mixed-block', name: 'Base block', totalWeeks: 6, completed: true, completedAt: '2026-06-20T12:00:00.000Z', weeks: [] });
  state.optionalSessions.push({ id: 'mixed-walk', kind: 'Cardio', intent: 'recoveryCardio', activity: 'Walk', status: 'completed', date: '2026-05-02', startedAt: at(2026, 4, 2, 9).getTime(), completedAt: at(2026, 4, 2, 9, 35).toISOString(), elapsedSeconds: 35 * 60 });
  return state;
}

export function yearReviewDemoState(id) {
  if (id === 'short') return shortYear();
  if (id === 'mixed') return mixedHistory();
  return richYear();
}
