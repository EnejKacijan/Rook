import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { blankState, buildProgram, isoDay, startOptionalSession, finishOptionalSession, nextScheduledWorkout, coachContext, saveState, loadState, deserializeState } from './domain.js';
import { editCompletedOptionalActivity, deleteCompletedOptionalActivity, optionalActivityDurationLabel } from './optionalActivity.js';
import { ACCOUNT_SYNC_SCHEMA, syncEntities, planSyncReconciliation, applySyncDownloads } from './accountSyncModel.js';
import { ensureAccountSyncLedger, updateAccountSyncLedger, recordAccountSyncDeleteIntent, captureAccountSyncMutations, readAccountSyncLedger } from './accountSyncOutbox.js';

export function restActivityFixture() {
  let state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Tue', 'Thu'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false });
  state.program = buildProgram(state.profile); state.ai.planUpgradeDismissed = true;
  state.selectedDate = isoDay(); state.selectedDay = 'Sun';
  state = startOptionalSession(state, { date: isoDay(), kind: 'Cardio', activity: 'Walking', duration: 20, intensity: 'Easy' }, Date.now() - 3000);
  return finishOptionalSession(state, Date.now());
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00')); });
afterEach(() => vi.useRealTimers());

it('retains canonical ID, timing provenance and target while editing actual completion duration', () => {
  const before = restActivityFixture(), original = before.optionalSessions[0];
  expect(original.elapsedSeconds).toBe(3);
  const next = editCompletedOptionalActivity(before, original.id, { activity: 'Cycling', durationSeconds: 180, intensity: 'Moderate' }, original);
  expect(next.optionalSessions).toHaveLength(1);
  expect(next.optionalSessions[0]).toEqual({ ...original, activity: 'Cycling', elapsedSeconds: 180, intensity: 'Moderate' });
  expect({ ...next, optionalSessions: before.optionalSessions }).toEqual(before);
  expect(optionalActivityDurationLabel(3)).toBe('3 sec'); expect(optionalActivityDurationLabel(185)).toBe('3 min 5 sec');
  expect(editCompletedOptionalActivity(next, original.id, { activity: 'Cycling', durationSeconds: 180, intensity: 'Moderate' })).toBe(next);
});
it('multiple completed activities are already supported; deletion affects only the chosen identity', () => {
  const before = restActivityFixture(), target = before.optionalSessions[0];
  const multiple = finishOptionalSession(startOptionalSession(before, { date: isoDay(), kind: 'Mobility', activity: 'Mobility / recovery', duration: 15, intensity: 'Easy' }, Date.now() - 60000), Date.now());
  expect(multiple.optionalSessions).toHaveLength(2);
  const nextWorkout = nextScheduledWorkout(multiple), context = coachContext(multiple);
  const deleted = deleteCompletedOptionalActivity(multiple, target.id, target);
  expect(deleted.optionalSessions).toEqual([multiple.optionalSessions[1]]);
  expect(nextScheduledWorkout(deleted)).toEqual(nextWorkout); expect(deleted.program).toBe(multiple.program);
  expect(deleted.workouts).toBe(multiple.workouts); expect(coachContext(deleted)).toEqual(context);
  expect({ ...deleted, optionalSessions: multiple.optionalSessions }).toEqual(multiple);
});
it('rejects stale edits/deletes, invalid duration/Hard and active or strength records', () => {
  const before = restActivityFixture(), target = before.optionalSessions[0], draft = { activity: 'Walking', durationSeconds: 60, intensity: 'Easy' };
  const changed = editCompletedOptionalActivity(before, target.id, draft);
  expect(() => editCompletedOptionalActivity(changed, target.id, draft, target)).toThrow(/changed/);
  expect(() => deleteCompletedOptionalActivity(changed, target.id, target)).toThrow(/changed/);
  expect(() => editCompletedOptionalActivity(before, target.id, { ...draft, intensity: 'Hard' })).toThrow(/Easy or Moderate/);
  expect(() => editCompletedOptionalActivity(before, target.id, { ...draft, durationSeconds: NaN })).toThrow(/duration/);
  for (const invalid of [{ ...target, kind: 'Strength' }, { ...target, status: 'active' }]) {
    const state = { ...before, optionalSessions: [invalid] };
    expect(() => deleteCompletedOptionalActivity(state, target.id)).toThrow(/Only completed/);
    expect(() => editCompletedOptionalActivity(state, target.id, draft)).toThrow(/no longer/);
  }
});
it('N: edited and deleted records survive real local persistence/reload', () => {
  const state = restActivityFixture(), target = state.optionalSessions[0];
  const edited = editCompletedOptionalActivity(state, target.id, { activity: 'Cycling', durationSeconds: 180, intensity: 'Moderate' });
  expect(saveState(edited)).toBe(true); expect(loadState().optionalSessions).toEqual(edited.optionalSessions);
  expect(saveState(deleteCompletedOptionalActivity(edited, target.id))).toBe(true);
  expect(loadState().optionalSessions).toEqual([]); expect(loadState().program).toEqual(deserializeState(JSON.stringify(state)).program);
});
it('O: existing sync upsert retains ID; explicit deletion produces a tombstone and reaches the second device', () => {
  const state = restActivityFixture(), target = state.optionalSessions[0], key = `optionalSessions:${JSON.stringify(target.id)}`;
  const base = syncEntities(state), cloud = new Map([...base].map(([k, e]) => [k, { ...e, revision: 1, syncSchemaVersion: ACCOUNT_SYNC_SCHEMA, deleted: false }]));
  const acknowledged = new Map([...cloud].map(([k, e]) => [k, { revision: e.revision, digest: e.digest }]));
  ensureAccountSyncLedger(localStorage, state.profile.id, { deviceId: 'activity-device' });
  updateAccountSyncLedger(localStorage, state.profile.id, ledger => ({ ...ledger, acknowledged: Object.fromEntries(acknowledged) }));
  const edited = editCompletedOptionalActivity(state, target.id, { activity: 'Cycling', durationSeconds: 180, intensity: 'Moderate' });
  captureAccountSyncMutations(localStorage, edited, 1);
  const edit = readAccountSyncLedger(localStorage, state.profile.id).pending.find(p => p.proposal.key === key).proposal;
  expect(edit.operation).toBe('upsert'); expect(edit.entity.value.id).toBe(target.id);
  expect(applySyncDownloads(state, [{ ...edit, entity: { ...edit.entity, revision: 2, syncSchemaVersion: ACCOUNT_SYNC_SCHEMA } }]).optionalSessions).toEqual(edited.optionalSessions);
  const deleted = deleteCompletedOptionalActivity(state, target.id);
  expect(planSyncReconciliation({ localEntities: syncEntities(deleted), cloudEntities: cloud, acknowledged }).conflicts).toContainEqual({ key, reason: 'delete-intent-missing' });
  recordAccountSyncDeleteIntent(localStorage, state.profile.id, 'optionalSessions', target.id);
  captureAccountSyncMutations(localStorage, deleted, 2);
  const pending = readAccountSyncLedger(localStorage, state.profile.id).pending.find(p => p.proposal.key === key).proposal;
  expect(pending).toEqual({ key, operation: 'delete', baseRevision: 1 });
  cloud.set(key, { ...cloud.get(key), revision: 2, value: null, digest: null, deleted: true });
  const download = planSyncReconciliation({ localEntities: base, cloudEntities: cloud, acknowledged }).download;
  const secondDevice = applySyncDownloads(state, download);
  expect(secondDevice.optionalSessions).toEqual([]); expect(secondDevice.program).toEqual(state.program); expect(secondDevice.workouts).toEqual(state.workouts);
});
