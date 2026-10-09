import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { blankState, buildProgram, isoDay, startOptionalSession, optionalSessionTiming, pauseOptionalSession, resumeOptionalSession, finishOptionalSession, cancelOptionalSession, nextScheduledWorkout, coachContext, saveState, loadState, deserializeState } from './domain.js';
import { editCompletedOptionalActivity, deleteCompletedOptionalActivity, optionalActivitySummary } from './optionalActivity.js';
import { ACCOUNT_SYNC_SCHEMA, syncEntities, applySyncDownloads, planSyncReconciliation } from './accountSyncModel.js';
import { ensureAccountSyncLedger, updateAccountSyncLedger, recordAccountSyncDeleteIntent, captureAccountSyncMutations, readAccountSyncLedger } from './accountSyncOutbox.js';
import { calendarDayPresentation } from './workoutCalendar.js';

const config = { kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'steady', duration: 20, intensity: 'Moderate' };
const intervals = { ...config, activity: 'Assault / Air Bike', format: 'intervals', intervals: { rounds: 8, workSeconds: 30, restSeconds: 60 }, intensity: 'Hard' };
function fixture() {
  const state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Sun', 'Tue'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false });
  state.program = buildProgram(state.profile); state.selectedDate = isoDay(); state.selectedDay = 'Sun';
  return state;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00')); localStorage.clear(); });
afterEach(() => vi.useRealTimers());
it('B/C: canonical intents reject Hard recovery, Easy conditioning and malformed formats/intervals', () => {
  const state = fixture();
  for (const invalid of [{ kind: 'Cardio', intensity: 'Hard' }, { ...config, intensity: 'Easy' }, { ...config, intent: undefined }, { ...intervals, intervals: { rounds: 0, workSeconds: 30, restSeconds: 60 } }, { ...config, format: 'pyramid' }]) expect(startOptionalSession(state, invalid)).toBe(state);
  expect(startOptionalSession(state, { kind: 'Cardio', activity: 'Walking', duration: 20 }).activeOptionalSession.intent).toBe('recoveryCardio');
  for (const intensity of ['Moderate', 'Hard']) expect(startOptionalSession(state, { ...config, intensity }).activeOptionalSession.intensity).toBe(intensity);
});
it('D/E: steady and bounded intervals retain canonical targets, IDs and metadata', () => {
  const state = fixture(), steady = startOptionalSession(state, config), work = startOptionalSession(state, intervals);
  expect(steady.activeOptionalSession).toMatchObject({ ...config, accumulatedSeconds: 0, status: 'active' });
  expect(work.activeOptionalSession.duration * 60).toBe(660);
  expect(work.activeOptionalSession.intervals).toEqual(intervals.intervals);
});
it('F/K: finish creates exactly one optional record while every strength/schedule/progression field remains unchanged', () => {
  const before = fixture(), nextWorkout = nextScheduledWorkout(before), start = startOptionalSession(before, intervals, Date.now() - 660000);
  const finished = finishOptionalSession(start);
  expect(finished.optionalSessions).toHaveLength(1); expect(finished.optionalSessions[0]).toMatchObject({ id: start.activeOptionalSession.id, status: 'completed', completedRounds: 8, elapsedSeconds: 660 });
  expect(finishOptionalSession(finished)).toBe(finished); expect(finishOptionalSession(deserializeState(JSON.stringify(finished))).optionalSessions).toHaveLength(1);
  expect(nextScheduledWorkout(finished)).toEqual(nextWorkout);
  expect(calendarDayPresentation(finished, [isoDay()])).toEqual(calendarDayPresentation(before, [isoDay()]));
  expect({ ...finished, activeOptionalSession: before.activeOptionalSession, optionalSessions: before.optionalSessions }).toEqual(before);
});
it('J: background/reload phase derives from wall clock; pause excludes time and resume refreshes correctly', () => {
  const now = Date.now(), started = startOptionalSession(fixture(), intervals, now);
  const restored = deserializeState(JSON.stringify(started));
  expect(optionalSessionTiming(restored.activeOptionalSession, now + 189000)).toMatchObject({ round: 3, phase: 'Work', remainingSeconds: 21, completedRounds: 2 });
  expect(optionalSessionTiming(restored.activeOptionalSession, now + 216000)).toMatchObject({ round: 3, phase: 'Rest', remainingSeconds: 54, completedRounds: 3 });
  const paused = pauseOptionalSession(restored, now + 216000);
  expect(optionalSessionTiming(paused.activeOptionalSession, now + 600000).elapsedSeconds).toBe(216);
  const resumed = resumeOptionalSession(paused, now + 600000);
  expect(optionalSessionTiming(resumed.activeOptionalSession, now + 655000)).toMatchObject({ round: 4, phase: 'Work', remainingSeconds: 29 });
  expect(optionalSessionTiming(started.activeOptionalSession, now + 900000)).toMatchObject({ phase: 'Complete', completedRounds: 8, remainingSeconds: 0 });
});
it('J: zero rest, exact boundaries and final round omit trailing rest', () => {
  const now = Date.now(), state = startOptionalSession(fixture(), { ...intervals, intervals: { rounds: 2, workSeconds: 10, restSeconds: 0 } });
  expect(optionalSessionTiming(state.activeOptionalSession, now + 10000)).toMatchObject({ round: 2, phase: 'Work', remainingSeconds: 10, completedRounds: 1 });
  expect(optionalSessionTiming(state.activeOptionalSession, now + 20000)).toMatchObject({ phase: 'Complete', totalSeconds: 20 });
});
it('G/H/I: early finish is truthful; same-ID editing and scoped deletion preserve strength and other activities', () => {
  const before = fixture(), finished = finishOptionalSession(startOptionalSession(before, intervals, Date.now() - 189000));
  const original = finished.optionalSessions[0]; expect(optionalActivitySummary(original)).toBe('2 of 8 rounds · Hard');
  const other = { ...original, id: 'other', kind: 'Cardio', intent: 'recoveryCardio' };
  finished.optionalSessions.push(other);
  const edited = editCompletedOptionalActivity(finished, original.id, { activity: 'Bike', format: 'intervals', intervals: { rounds: 6, workSeconds: 30, restSeconds: 60 }, intensity: 'Moderate', durationSeconds: 300 }, original);
  expect(edited.optionalSessions[0]).toMatchObject({ id: original.id, activity: 'Bike', completedRounds: 4, elapsedSeconds: 300, startedAt: original.startedAt, completedAt: original.completedAt });
  expect(deleteCompletedOptionalActivity(edited, original.id).optionalSessions).toEqual([other]);
  expect(edited.program).toBe(before.program); expect(edited.workouts).toBe(before.workouts);
});
it('L: active strength and optional sessions block start; canceled sessions produce no history', () => {
  const before = fixture(), activeStrength = { ...before, activeWorkout: { id: 'strength' } };
  expect(startOptionalSession(activeStrength, config)).toBe(activeStrength);
  const started = startOptionalSession(before, config); expect(startOptionalSession(started, intervals)).toBe(started);
  expect(cancelOptionalSession(started)).toEqual(before);
});
it('M: current Coach context does not consume optional cardio; Hard conditioning causes no hidden recovery/proposal change', () => {
  const before = fixture(), after = finishOptionalSession(startOptionalSession(before, intervals, Date.now() - 660000));
  expect(coachContext(after)).toEqual(coachContext(before));
});
it('local-first persistence reloads active and completed conditioning with every interval field', () => {
  const started = startOptionalSession(fixture(), intervals); expect(saveState(started)).toBe(true);
  expect(syncEntities(started).get('activeOptionalSession:"root"').value).toEqual(started.activeOptionalSession);
  expect(loadState().activeOptionalSession).toEqual(started.activeOptionalSession);
  const completed = finishOptionalSession(started); expect(saveState(completed)).toBe(true);
  expect(loadState().optionalSessions).toEqual(completed.optionalSessions);
});
it('cancel persists safely for an intentional first-run user without a plan or history', () => {
  const before = blankState(); Object.assign(before.profile, { onboardingComplete: true, preferredTrainingStyle: 'freestyle', noPlanReceipt: { kind: 'first-run' } });
  const started = startOptionalSession(before, config); expect(saveState(started)).toBe(true);
  const canceled = cancelOptionalSession(started); expect(saveState(canceled)).toBe(true);
  expect(loadState().activeOptionalSession).toBeNull(); expect(loadState().optionalSessions).toEqual([]); expect(loadState().profile.id).toBe(before.profile.id);
});
it('N: existing domain sync converges creation/edit and explicit deletion across synthetic devices', () => {
  const completed = finishOptionalSession(startOptionalSession(fixture(), intervals, Date.now() - 660000)), target = completed.optionalSessions[0], key = `optionalSessions:${JSON.stringify(target.id)}`;
  const cloud = new Map([...syncEntities(completed)].map(([k, e]) => [k, { ...e, revision: 1, syncSchemaVersion: ACCOUNT_SYNC_SCHEMA, deleted: false }]));
  const acknowledged = new Map([...cloud].map(([k, e]) => [k, { revision: e.revision, digest: e.digest }]));
  ensureAccountSyncLedger(localStorage, completed.profile.id, { deviceId: 'conditioning-device' });
  updateAccountSyncLedger(localStorage, completed.profile.id, ledger => ({ ...ledger, acknowledged: Object.fromEntries(acknowledged) }));
  expect(applySyncDownloads({ ...completed, optionalSessions: [] }, [{ key, operation: 'upsert', entity: cloud.get(key) }]).optionalSessions).toEqual(completed.optionalSessions);
  const edited = editCompletedOptionalActivity(completed, target.id, { activity: 'SkiErg', format: 'intervals', intervals: target.intervals, intensity: 'Moderate', durationSeconds: 660 });
  captureAccountSyncMutations(localStorage, edited, 1);
  const proposal = readAccountSyncLedger(localStorage, completed.profile.id).pending.find(p => p.proposal.key === key).proposal;
  expect(applySyncDownloads(completed, [{ ...proposal, entity: { ...proposal.entity, revision: 2, syncSchemaVersion: ACCOUNT_SYNC_SCHEMA } }]).optionalSessions).toEqual(edited.optionalSessions);
  recordAccountSyncDeleteIntent(localStorage, completed.profile.id, 'optionalSessions', target.id);
  captureAccountSyncMutations(localStorage, deleteCompletedOptionalActivity(edited, target.id), 2);
  expect(readAccountSyncLedger(localStorage, completed.profile.id).pending.find(p => p.proposal.key === key).proposal.operation).toBe('delete');
  cloud.set(key, { ...cloud.get(key), revision: 2, value: null, digest: null, deleted: true });
  const download = planSyncReconciliation({ localEntities: syncEntities(completed), cloudEntities: cloud, acknowledged }).download;
  expect(applySyncDownloads(completed, download).optionalSessions).toEqual([]);
});
