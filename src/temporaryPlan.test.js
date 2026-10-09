import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { blankState, hydrateStoredState, serializeState, currentWeekSchedule, plannedWorkoutForDate, startWorkout, completeWorkout, saveState, isExerciseAllowed, exerciseCatalog } from './domain.js';
import { createTrainingReviewState } from './fixtures/trainingReviewState.js';
import { addCalendarDays, flexiblePlanFingerprint, proposeFlexibleWeek, applyFlexibleWeek, temporaryScheduleReview } from './flexibleWeek.js';
import { equipmentProfile } from './gymProfiles.js';
import { applyTemporaryPlan, endTemporaryPlan, nextTemporaryPlanStart, proposeTemporaryPlan, temporaryPlanSignature, temporaryPlanStatus } from './temporaryPlan.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00')); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });
const fixture = () => hydrateStoredState(createTrainingReviewState(blankState()));
const request = { startDate: '2026-10-05', weeks: 3, days: ['Mon', 'Wed', 'Fri'], equipment: ['dumbbells'] };
const prepare = (state, change = {}) => { const result = proposeTemporaryPlan(state, { ...request, ...change }); expect(result.status, result.error).toBe('ready'); return result; };
const apply = state => { const result = applyTemporaryPlan(state, prepare(state), () => true); expect(result.status, result.error).toBe('applied'); return result.state; };

it.each([2, 3, 4])('changes only the reviewed %s weeks, returns automatically to the recurring plan and reloads losslessly', weeks => {
  const state = fixture(), before = serializeState(state), proposal = prepare(state, { weeks });
  expect(serializeState(state)).toBe(before);
  const result = applyTemporaryPlan(state, proposal, () => true), next = result.state;
  expect(result.status).toBe('applied');
  expect(next.program.days).toEqual(state.program.days); expect(next.profile).toEqual(state.profile);
  expect(next.workouts).toEqual(state.workouts); expect(next.planVersions).toEqual(state.planVersions);
  expect(flexiblePlanFingerprint(next)).toBe(flexiblePlanFingerprint(state));
  expect(next.flexibleWeek.revision).toBe(1);
  for (let index = 0; index < weeks; index++) {
    const monday = addCalendarDays(request.startDate, index * 7), items = currentWeekSchedule(next, monday);
    expect(items).toHaveLength(3);
    expect(new Set(items.map(item => item.logicalSessionId)).size).toBe(3);
    expect(items.map(item => item.scheduledDate)).toEqual([0, 2, 4].map(day => addCalendarDays(monday, day)));
    for (const item of items) {
      expect(item.workout.temporaryPlanAdjustment.id).toBe(next.program.temporaryPlanAdjustment.id);
      expect(state.program.days.some(day => day.id === item.workout.id)).toBe(true);
      expect(item.logicalSessionId).toBe(`${item.workoutId}:${item.originalDate}`);
      expect(item.workout.exercises.every(exercise => isExerciseAllowed(exerciseCatalog[exercise.exerciseId], equipmentProfile(state.profile, ['dumbbells'])))).toBe(true);
    }
  }
  const afterDate = addCalendarDays(request.startDate, weeks * 7);
  expect(currentWeekSchedule(next, afterDate).map(({ logicalSessionId, ...item }) => item)).toEqual(currentWeekSchedule(state, afterDate));
  expect(temporaryPlanStatus(next, afterDate).status).toBe('ended');
  const restored = hydrateStoredState(serializeState(next));
  expect(restored.program.temporaryPlanAdjustment).toEqual(JSON.parse(serializeState(next)).program.temporaryPlanAdjustment);
  expect(currentWeekSchedule(restored, request.startDate)).toEqual(currentWeekSchedule(next, request.startDate));
});
it('refuses a failed save without mutating the old plan or consuming a preview', () => {
  const state = fixture(), before = serializeState(state), proposal = prepare(state), persist = vi.fn(() => false);
  expect(applyTemporaryPlan(state, proposal, persist).error).toContain('could not be saved');
  expect(serializeState(state)).toBe(before); expect(persist).toHaveBeenCalledOnce();
  expect(applyTemporaryPlan(state, proposal, () => true).status).toBe('applied');
});
it.each(['active', 'optional', 'adjustment', 'plan', 'day', 'payload'])('rejects stale or conflicting %s changes before any write', kind => {
  const state = fixture(), proposal = prepare(state), persist = vi.fn();
  if (kind === 'active') state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, request.startDate));
  if (kind === 'optional') state.activeOptionalSession = { date: request.startDate };
  if (kind === 'adjustment') state.todayAdaptation = { date: request.startDate };
  if (kind === 'plan') state.program.version++;
  if (kind === 'day') vi.setSystemTime(new Date('2026-10-06T12:00:00'));
  if (kind === 'payload') proposal.changes[0].toDate = '2026-10-11';
  expect(applyTemporaryPlan(state, proposal, persist).status).toBe('conflict'); expect(persist).not.toHaveBeenCalled();
});
it.each([
  { weeks: 1 }, { weeks: 5 }, { days: ['Mon'] }, { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { startDate: '2026-10-06' }, { startDate: '2026-09-28' }, { equipment: [] }, { startDate: '2026-12-07' },
])('rejects invalid settings %j without changing the profile', values => {
  const state = fixture(), before = serializeState(state);
  expect(proposeTemporaryPlan(state, { ...request, ...values }).status).toBe('conflict'); expect(serializeState(state)).toBe(before);
});
it('preserves completed history, actual dates, ended-early status, weights and active-session provenance when ending early', () => {
  let state = apply(fixture());
  state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, '2026-10-05'));
  state.activeWorkout.exercises[0].sets[0].weight = 52; state.activeWorkout.exercises[0].sets[0].completed = true;
  state = completeWorkout(state); const history = structuredClone(state.workouts);
  expect(history.at(-1).exercises[0].sets[0].weight).toBe(52);
  expect(history.at(-1).temporaryPlanAdjustment).toBeDefined();
  expect(history.at(-1).endedEarly).toBe(true);
  const result = endTemporaryPlan(state, () => true);
  expect(result.status, result.error).toBe('applied'); expect(result.state.workouts).toEqual(history);
  expect(result.state.program.days).toEqual(state.program.days);
  expect(currentWeekSchedule(result.state, '2026-10-12')).toHaveLength(4);
  expect(hydrateStoredState(serializeState(result.state)).workouts).toEqual(history);
});
it('previews a moved occurrence without duplicates and safely restores its original saved move on early end', () => {
  let state = fixture();
  const source = currentWeekSchedule(state, '2026-10-05')[2];
  const move = proposeFlexibleWeek(state, { mode: 'move', sessionId: source.logicalSessionId || `${source.workoutId}:${source.originalDate}`, toDate: '2026-10-09' });
  expect(move.status).toBe('ready'); state = applyFlexibleWeek(state, move).state;
  const saved = structuredClone(state.flexibleWeek.sessions), next = apply(state);
  const ended = endTemporaryPlan(next, () => true); expect(ended.status, ended.error).toBe('applied');
  expect(ended.state.flexibleWeek.sessions).toEqual(saved);
});
it('will not overwrite an individually edited date or a later user move when ending early', () => {
  const base = fixture(), first = currentWeekSchedule(base, '2026-10-05')[0];
  base.workoutOccurrenceOverrides[first.scheduledDate] = { [first.workoutId]: { excludedEntryIds: [first.workout.exercises[0].id] } };
  expect(proposeTemporaryPlan(base, request).error).toContain('individual edits');
  const state = apply(fixture()), record = Object.values(state.flexibleWeek.sessions).find(item => !item.skipped);
  record.scheduledDate = '2026-10-11'; const before = serializeState(state), persist = vi.fn();
  expect(endTemporaryPlan(state, persist).error).toContain('changed after'); expect(persist).not.toHaveBeenCalled(); expect(serializeState(state)).toBe(before);
});
it('keeps later block progress compatible, but never reuses temporary exercises under a changed plan', () => {
  const state = apply(fixture()), signature = temporaryPlanSignature(state);
  state.program.trainingBlock.currentWeek++;
  expect(temporaryPlanSignature(state)).toBe(signature);
  state.program.version++; expect(temporaryPlanStatus(state).planChanged).toBe(true);
  expect(endTemporaryPlan(state, vi.fn()).status).toBe('conflict');
});
it('persists through the actual P0 save/hydration boundary and fails closed on damaged temporary workouts', () => {
  const state = fixture(); expect(saveState(state)).toBe(true);
  const result = applyTemporaryPlan(state, prepare(state), saveState); expect(result.status, result.error).toBe('applied');
  const raw = localStorage.getItem('lift-v2-state'); expect(hydrateStoredState(raw).program.temporaryPlanAdjustment.id).toBe(result.state.program.temporaryPlanAdjustment.id);
  const broken = JSON.parse(raw), override = Object.values(broken.workoutOccurrenceOverrides).flatMap(Object.values).find(item => item.temporaryWorkout);
  override.temporaryWorkout.workout.exercises[0].sets = null;
  expect(() => hydrateStoredState(broken)).toThrow(/temporary workout/);
});
it('starts with this Monday or the next Monday, never silently rewrites the past', () => {
  expect(nextTemporaryPlanStart('2026-10-05')).toBe('2026-10-05'); expect(nextTemporaryPlanStart('2026-10-07')).toBe('2026-10-12');
});
it('can create a later period with different equipment without losing or invalidating earlier workouts', () => {
  let state = apply(fixture());
  state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, request.startDate));
  state.activeWorkout.exercises[0].sets[0].completed = true;
  state = completeWorkout(state); const history = structuredClone(state.workouts);
  vi.setSystemTime(new Date('2026-10-26T12:00:00'));
  const proposal = prepare(state, { startDate: '2026-10-26', weeks: 2, equipment: ['full gym'] });
  const result = applyTemporaryPlan(state, proposal, () => true);
  expect(result.status, result.error).toBe('applied');
  const restored = hydrateStoredState(serializeState(result.state));
  expect(restored.workouts).toEqual(history);
  expect(restored.program.temporaryPlanAdjustment.equipment).toEqual(['full gym']);
});
it('safely reloads history after restrictions change, and stops using an unreviewed temporary prescription', () => {
  const state = apply(fixture()); state.profile.avoid = 'Avoid squats';
  expect(temporaryPlanStatus(state).planChanged).toBe(true);
  expect(() => hydrateStoredState(serializeState(state))).not.toThrow();
  expect(endTemporaryPlan(state, vi.fn()).status).toBe('conflict');
});
it('also reloads a newly generated, not-yet-hydrated plan without a false plan change or lost dates', () => {
  const state = createTrainingReviewState(blankState());
  const proposal = prepare(state), result = applyTemporaryPlan(state, proposal, () => true);
  expect(result.status, result.error).toBe('applied');
  const restored = hydrateStoredState(serializeState(result.state));
  expect(temporaryPlanStatus(restored).planChanged).toBe(false);
  expect(temporaryScheduleReview(restored).unresolved).toEqual([]);
  expect(currentWeekSchedule(restored, request.startDate)).toHaveLength(3);
  expect(endTemporaryPlan(restored, () => true).status).toBe('applied');
});
it('advances the block after the three actual workouts, resolves only that week’s reviewed rest slot and never invents history', () => {
  let state = apply(fixture());
  expect(state.program.trainingBlock.currentWeek).toBe(1);
  for (let index = 0; index < 2; index++) {
    const monday = addCalendarDays(request.startDate, index * 7);
    for (const offset of [0, 2, 4]) {
      const date = addCalendarDays(monday, offset); vi.setSystemTime(new Date(`${date}T12:00:00`));
      state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, date));
      expect(state.activeWorkout.trainingBlock.blockWeekNumber).toBe(index + 1);
      state.activeWorkout.exercises[0].sets[0].completed = true;
      state = completeWorkout(state);
    }
    expect(state.program.trainingBlock.currentWeek).toBe(index + 2);
    expect(state.program.trainingBlock.resolvedSkips).toHaveLength(index + 1);
    expect(state.workouts).toHaveLength((index + 1) * 3);
    expect(temporaryPlanStatus(state).planChanged).toBe(false);
    state = hydrateStoredState(serializeState(state));
  }
  const ended = endTemporaryPlan(state, () => true);
  expect(ended.status, ended.error).toBe('applied');
  expect(ended.state.program.trainingBlock.resolvedSkips).toHaveLength(2);
  expect(ended.state.workouts).toEqual(state.workouts);
});
it.each(['days', 'weekday', 'signature', 'change', 'date'])('fails closed on damaged saved %s metadata before mounting its controls', field => {
  const state = apply(fixture()), period = state.program.temporaryPlanAdjustment;
  if (field === 'days') period.days = null;
  if (field === 'weekday') period.days = ['Mon', 'Mon'];
  if (field === 'signature') period.planSignature = 'invalid';
  if (field === 'change') period.changes[0] = null;
  if (field === 'date') period.changes[0].toDate = '2026-02-31';
  expect(() => hydrateStoredState(serializeState(state))).toThrow(/temporary plan/);
});
it('keeps a past plain Adjust Today entry without blocking unrelated future weeks or their early end', () => {
  const state = fixture(), day = state.program.days[0];
  state.todayAdaptation = { ...structuredClone(day), date: '2026-10-04', programDayId: day.id };
  const result = applyTemporaryPlan(state, prepare(state), () => true);
  expect(result.status, result.error).toBe('applied'); expect(result.state.todayAdaptation.date).toBe('2026-10-04');
  expect(endTemporaryPlan(result.state, () => true).status).toBe('applied');
});
