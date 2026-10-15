import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deserializeState, serializeState, startWorkout } from './domain.js';
import { applyFlexibleWeek, effectiveWeekSchedule, flexibleSessionLifecycle, flexibleWeekConflict,
  proposeFlexibleWeek, temporaryScheduleReview, temporaryScheduleRestoreScope } from './flexibleWeek.js';
import { scheduleRecoveryState } from './fixtures/scheduleRecoveryState.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00')); });
afterEach(() => vi.useRealTimers());
const record = state => Object.values(state.flexibleWeek.sessions)[0];

it('classifies Oct 9 -> Oct 6 as a closed-week missed fact after the plan changes, without mutating anything', () => {
  const state = scheduleRecoveryState(), before = structuredClone(state), item = record(state);
  expect(flexibleSessionLifecycle(state, item).status).toBe('missed');
  const review = temporaryScheduleReview(state);
  expect(review.unresolved).toHaveLength(0);
  expect(review.items).toHaveLength(0);
  expect(review.historical).toMatchObject([{ id: item.id, originalDate: '2026-10-09', scheduledDate: '2026-10-06', status: 'missed', historical: true, stale: true }]);
  expect(flexibleWeekConflict(state)).toBe(false);
  expect(temporaryScheduleRestoreScope(state).removable).toHaveLength(0);
  expect(state).toEqual(before);
});
it('a closed-week stale receipt no longer blocks an unrelated current-week adjustment', () => {
  const state = scheduleRecoveryState(), item = record(state), originalRecord = structuredClone(item);
  const currentSchedule = effectiveWeekSchedule(state, '2026-10-14');
  const current = currentSchedule.find(entry => entry.scheduledDate === '2026-10-16');
  const proposal = proposeFlexibleWeek(state, { mode: 'move', sessionId: current.logicalSessionId, toDate: '2026-10-15' });
  expect(proposal.status).toBe('ready');
  const result = applyFlexibleWeek(state, proposal);
  expect(result.status).toBe('applied');
  expect(result.state.flexibleWeek.sessions[item.id]).toEqual(originalRecord);
  expect(result.state.program).toEqual(state.program);
  expect(result.state.workouts).toEqual(state.workouts);
  expect(result.state.activeWorkout).toEqual(state.activeWorkout);
  expect(temporaryScheduleReview(result.state).unresolved).toHaveLength(0);
});
it('future stale moves remain unresolved and restore through the existing guarded transaction', () => {
  const state = scheduleRecoveryState({ future: true }), before = structuredClone(state);
  expect(flexibleWeekConflict(state)).toBe(true);
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(1);
  const proposal = proposeFlexibleWeek(state, { mode: 'restore' });
  expect(proposal.status).toBe('ready');
  const result = applyFlexibleWeek(state, proposal);
  expect(result.status).toBe('applied');
  expect(temporaryScheduleReview(result.state).unresolved).toHaveLength(0);
  expect(result.state.flexibleWeek.sessions).toEqual({});
  expect(result.state.program).toEqual(before.program);
  expect(result.state.workouts).toEqual(before.workouts);
  expect(result.state.activeWorkout).toEqual(before.activeWorkout);
  expect(effectiveWeekSchedule(result.state, '2026-10-14').find(entry => entry.workoutId === record(state).workoutId).scheduledDate).toBe('2026-10-16');
  expect(applyFlexibleWeek(result.state, proposal)).toMatchObject({ status: 'stale', state: result.state });
});
it.each([false, true])('a deleted source remains truthful for a %s future occurrence', future => {
  const state = scheduleRecoveryState({ future }), item = record(state);
  state.program.days = state.program.days.filter(day => day.id !== item.workoutId);
  const before = structuredClone(state), review = temporaryScheduleReview(state);
  expect(review.unresolved).toHaveLength(future ? 1 : 0);
  expect(flexibleWeekConflict(state)).toBe(future);
  if (future) {
    const result = applyFlexibleWeek(state, proposeFlexibleWeek(state, { mode: 'restore' }));
    expect(result.status).toBe('applied');
    expect(result.state.flexibleWeek.sessions).toEqual({});
    expect(result.state.program).toEqual(before.program);
  } else expect(review.historical[0].status).toBe('missed');
  expect(state).toEqual(before);
});
it('a valid current-week move remains informational rather than historical or unresolved', () => {
  const state = scheduleRecoveryState({ future: true, stale: false });
  expect(temporaryScheduleReview(state).moved).toHaveLength(1);
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(0);
  expect(temporaryScheduleReview(state).historical).toHaveLength(0);
});
it('Sunday -> Monday closes the past occurrence, with no saved-data mutation', () => {
  const state = scheduleRecoveryState(), before = structuredClone(state);
  vi.setSystemTime(new Date('2026-10-11T12:00:00'));
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(1);
  vi.setSystemTime(new Date('2026-10-12T00:00:00'));
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(0);
  expect(temporaryScheduleReview(state).historical).toHaveLength(1);
  expect(flexibleWeekConflict(state)).toBe(false);
  expect(state).toEqual(before);
});
it.each(['completed', 'ended-early', 'active'])('preserves %s ownership and never offers a restore for its occurrence', kind => {
  const state = scheduleRecoveryState({ future: true }), item = record(state);
  const workout = startWorkout(state, state.program.days.at(-1));
  Object.assign(workout, { sourceOccurrenceId: item.id, originalScheduledDate: item.originalDate, canonicalPlanDate: item.scheduledDate });
  if (kind === 'active') state.activeWorkout = workout;
  else state.workouts = [{ ...workout, completedAt: '2026-10-14T10:00:00', endedEarly: kind === 'ended-early' }];
  const before = structuredClone(state);
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(0);
  expect(temporaryScheduleRestoreScope(state).removable).toHaveLength(0);
  expect(state).toEqual(before);
});
it('does not archive a carried stale occurrence whose destination is still in a later week', () => {
  const state = scheduleRecoveryState(); record(state).scheduledDate = '2026-10-15';
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(1);
  expect(temporaryScheduleReview(state).historical).toHaveLength(0);
  expect(flexibleWeekConflict(state)).toBe(true);
});
it('classification survives strict reload with all original IDs, dates and provenance', () => {
  const state = scheduleRecoveryState(), loaded = deserializeState(serializeState(state), { strict: true });
  expect(loaded.flexibleWeek).toEqual(state.flexibleWeek);
  expect(temporaryScheduleReview(loaded).historical[0].id).toBe(record(state).id);
  expect(flexibleWeekConflict(loaded)).toBe(false);
  expect(loaded.workouts).toEqual(state.workouts);
});
