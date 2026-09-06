import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { blankState, buildProgram, completeWorkout, currentWeekSchedule, deserializeState, plannedWorkoutForDate, startWorkout } from './domain.js';
import { weeklyPerformanceReview } from './performanceInsights.js';
import { addCalendarDays, applyFlexibleWeek, flexibleSessions, missedFlexibleSessions, proposeFlexibleWeek, flexibleWeekConflict } from './flexibleWeek.js';
import { buildBackupArchive, parseBackupArchive } from './backup.js';

function fixture(days = ['Mon', 'Wed', 'Fri']) {
  const state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: days.length, availableDays: days, sessionMinutes: 60, equipment: ['full gym'], environment: 'Commercial gym', priorities: ['Balanced'], onboardingComplete: true });
  state.program = buildProgram(state.profile); state.program.trainingBlock.startDate = '2026-08-31';
  state.selectedDate = '2026-09-05'; return deserializeState(state);
}
const first = state => missedFlexibleSessions(state)[0];
const proposal = (state, toDate = '2026-09-05') => proposeFlexibleWeek(state, { mode: 'move', sessionId: first(state).logicalSessionId, toDate });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:00:00')); });
afterEach(() => vi.useRealTimers());
describe('Flexible Week logical sessions', () => {
  it('moves only calendar placement and preserves permanent plan and identity', () => {
    const state = fixture(), plan = structuredClone(state.program), p = proposal(state);
    expect(p.status).toBe('ready'); const result = applyFlexibleWeek(state, p);
    expect(result.status).toBe('applied'); expect(result.state.program).toEqual(plan); expect(state.flexibleWeek).toBeNull();
    const moved = plannedWorkoutForDate(result.state, '2026-09-05');
    expect(moved.logicalSessionId).toBe(p.changes[0].logicalSessionId);
    expect(plannedWorkoutForDate(result.state, '2026-08-31')).toBeNull();
  });
  it('repeated movement replaces one record and uses effective missed date', () => {
    const initial = fixture();
    let state = applyFlexibleWeek(initial, proposal(initial)).state;
    const id = Object.keys(state.flexibleWeek.sessions)[0];
    vi.setSystemTime(new Date('2026-09-06T12:00:00'));
    const outstanding = missedFlexibleSessions(state).filter(s => s.logicalSessionId === id);
    expect(outstanding).toHaveLength(1); expect(outstanding[0].scheduledDate).toBe('2026-09-05');
    state = applyFlexibleWeek(state, proposeFlexibleWeek(state, { mode: 'move', sessionId: id, toDate: '2026-09-06' })).state;
    expect(Object.keys(state.flexibleWeek.sessions)).toHaveLength(1);
  });
  it('rejects occupied, past, unavailable and malformed dates', () => {
    const state = fixture(), id = first(state).logicalSessionId;
    for (const toDate of ['2026-09-07', '2026-09-04', 'not-a-date', '2026-09-99']) expect(proposeFlexibleWeek(state, { mode: 'move', sessionId: id, toDate }).status).toBe('conflict');
    expect(proposeFlexibleWeek(state, { mode: 'move', sessionId: id, toDate: '2026-09-06', availableDates: ['2026-09-05'] }).status).toBe('conflict');
  });
  it('cannot move active or completed sessions', () => {
    const state = fixture(), item = first(state); state.selectedDate = item.scheduledDate;
    state.activeWorkout = startWorkout(state, item.workout);
    expect(proposeFlexibleWeek(state, { mode: 'move', sessionId: item.logicalSessionId, toDate: '2026-09-06' }).status).toBe('conflict');
    state.workouts = [{ ...state.activeWorkout, completedAt: '2026-09-05T12:00:00' }]; state.activeWorkout = null;
    expect(proposeFlexibleWeek(state, { mode: 'skip', sessionId: item.logicalSessionId }).status).toBe('conflict');
  });
  it('rejects double apply and stale reviews', () => {
    const state = fixture(), p = proposal(state), applied = applyFlexibleWeek(state, p).state;
    expect(applyFlexibleWeek(applied, p).status).toBe('stale');
    for (const mutate of [s => s.program.version++, s => s.program.trainingBlock.currentWeek++, s => s.activeWorkout = { id: 'active' }, s => s.workouts.push({ completedAt: 'now' }), s => s.todayAdaptation = { id: 'new' }]) {
      const next = structuredClone(state); mutate(next); expect(applyFlexibleWeek(next, p).status).toBe('stale');
    }
  });
  it('keeps skip distinct, reversible and without history or plan changes', () => {
    const state = fixture(); const p = proposeFlexibleWeek(state, { mode: 'skip', sessionId: first(state).logicalSessionId });
    const next = applyFlexibleWeek(state, p).state;
    expect(flexibleSessions(next).find(s => s.logicalSessionId === p.changes[0].logicalSessionId).status).toBe('skipped');
    expect(next.workouts).toEqual(state.workouts); expect(next.program).toEqual(state.program);
  });
  it('carries into next week without duplicate recurring session and retains block week', () => {
    const state = fixture(), p = proposal(state, '2026-09-08'), next = applyFlexibleWeek(state, p).state;
    const carried = currentWeekSchedule(next, '2026-09-08').find(s => s.logicalSessionId === p.changes[0].logicalSessionId);
    expect(carried.workout.trainingBlock.blockWeekNumber).toBe(1);
    expect(currentWeekSchedule(next, '2026-09-08').filter(s => s.scheduledDate === '2026-09-08')).toHaveLength(1);
    next.program.trainingBlock.currentWeek = 2;
    expect(plannedWorkoutForDate(next, '2026-09-08').trainingBlock.blockWeekNumber).toBe(1);
  });
  it('requires explicit today-adjustment choice, supports restore and keep', () => {
    const state = fixture(), item = first(state);
    state.todayAdaptation = { id: 'adjusted', date: item.scheduledDate, programDayId: item.workoutId, workout: { exercises: [] } };
    const p = proposal(state);
    expect(p.adaptationConflict).toBe(true); expect(applyFlexibleWeek(state, p).status).toBe('conflict');
    expect(applyFlexibleWeek(state, p, { adaptationChoice: 'restore' }).state.todayAdaptation).toBeNull();
    expect(applyFlexibleWeek(state, p, { adaptationChoice: 'keep' }).state.todayAdaptation.date).toBe('2026-09-05');
  });
  it('reload round-trips placement and quarantines changed plans', () => {
    const state = fixture(), next = applyFlexibleWeek(state, proposal(state)).state;
    expect(deserializeState(JSON.stringify(next)).flexibleWeek).toEqual(next.flexibleWeek);
    expect(plannedWorkoutForDate(deserializeState(next), '2026-09-05')).not.toBeNull();
    next.program.days[0].name = 'Edited'; expect(flexibleWeekConflict(next)).toBe(true);
    expect(plannedWorkoutForDate(next, '2026-09-05')).toBeNull();
  });
  it('backup archive restores effective schedule exactly', async () => {
    vi.useRealTimers();
    const state = fixture(), today = new Date();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:00:00'));
    const next = applyFlexibleWeek(state, proposal(state)).state;
    vi.useRealTimers();
    const archive = await buildBackupArchive(next, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.flexibleWeek).toEqual(next.flexibleWeek);
    expect(plannedWorkoutForDate(restored.state, '2026-09-05')?.logicalSessionId).toBe(Object.keys(next.flexibleWeek.sessions)[0]);
  });
  for (const [count, days] of [[5,5],[5,4],[5,3],[4,3],[3,2],[1,1]]) it(`${count} recurring templates / ${days} available is deterministic without loss across the rolling window`, () => {
    const state = fixture(['Mon','Tue','Wed','Thu','Fri'].slice(0, count));
    const request = { mode: 'available', availableDates: Array.from({ length: days }, (_, i) => addCalendarDays('2026-09-05', i)) };
    const a = proposeFlexibleWeek(state, request), b = proposeFlexibleWeek(state, request);
    expect(a).toEqual(b);
    if (a.status === 'ready') { const next = applyFlexibleWeek(state, a).state; expect(new Set(flexibleSessions(next).map(s => s.logicalSessionId)).size).toBe(flexibleSessions(next).length); }
    else expect(a.status).toBe('insufficient-capacity');
  });
  it('finds a bounded carry bridge and preserves order', () => {
    const state = fixture();
    const p = proposeFlexibleWeek(state, { mode: 'available', availableDates: ['2026-09-05','2026-09-06'], carry: true });
    expect(p.status).toBe('ready'); expect(p.changes.some(c => c.toDate >= '2026-09-07')).toBe(true);
    const dates = p.changes.map(c => c.toDate); expect(dates).toEqual([...dates].sort());
  });
  it('completion counts once, carries original identity, and leaves remaining sessions editable', () => {
    const state = fixture(); let next = applyFlexibleWeek(state, proposal(state)).state;
    next.selectedDate = '2026-09-05'; const template = plannedWorkoutForDate(next, '2026-09-05');
    next.activeWorkout = startWorkout(next, template);
    next.activeWorkout.exercises.forEach(e => e.sets.forEach(s => { s.completed = true; s.weight = 30; }));
    next = completeWorkout(next);
    expect(next.workouts).toHaveLength(1); expect(next.workouts[0].logicalSessionId).toBe(template.logicalSessionId);
    expect(weeklyPerformanceReview(next).completed).toBe(1); expect(weeklyPerformanceReview(next).moved).toBe(1);
    expect(proposeFlexibleWeek(next, { mode: 'skip', sessionId: template.logicalSessionId }).status).toBe('conflict');
    expect(proposeFlexibleWeek(next, { mode: 'move', sessionId: missedFlexibleSessions(next)[0].logicalSessionId, toDate:'2026-09-06' }).status).toBe('ready');
  });
  it('retains active snapshot on restore and plan conflict', () => {
    const state=fixture();const next=applyFlexibleWeek(state,proposal(state)).state;next.selectedDate='2026-09-05';next.activeWorkout=startWorkout(next,plannedWorkoutForDate(next,'2026-09-05'));
    const snapshot=structuredClone(next.activeWorkout); const restored=applyFlexibleWeek(next,proposeFlexibleWeek(next,{mode:'restore'})).state;
    expect(restored.activeWorkout).toEqual(snapshot);expect(Object.keys(restored.flexibleWeek.sessions)).toHaveLength(1);
  });
  it('explicit skip does not create performance failure or completion', () => {
    const state=fixture(), next=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:first(state).logicalSessionId})).state;
    const review=weeklyPerformanceReview(next);expect(review.skipped).toBe(1);expect(review.completed).toBe(0);expect(review.exercisesHeld).toBe(0);
  });
  it('restore rejects a collision with an immutable moved active session', () => {
    const state=fixture();const bridge=proposeFlexibleWeek(state,{mode:'available',availableDates:['2026-09-05','2026-09-06'],carry:true});
    const next=applyFlexibleWeek(state,bridge).state;
    const item=flexibleSessions(next).find(s=>s.scheduledDate==='2026-09-07');
    if (item) { next.selectedDate=item.scheduledDate;next.activeWorkout=startWorkout(next,item.workout);expect(proposeFlexibleWeek(next,{mode:'restore'}).status).toBe('conflict'); }
  });
  it('zero remaining is a calm no-change result', () => {
    const state=fixture();state.workouts=flexibleSessions(state).map(item=>({id:item.logicalSessionId,logicalSessionId:item.logicalSessionId,programDayId:item.workoutId,canonicalPlanDate:item.scheduledDate,completedAt:item.scheduledDate+'T12:00:00'}));
    expect(proposeFlexibleWeek(state,{mode:'available',availableDates:['2026-09-05']}).status).toBe('no-change');
  });
  it('optional sessions are not missed obligations', () => {
    const state=fixture();state.program.days.forEach(d=>d.optional=true);
    expect(missedFlexibleSessions(state)).toHaveLength(0);
  });
  it('moving an occurrence retains its explicit exercise ordering', () => {
    const state=fixture(), item=first(state), order=item.workout.exercises.map(e=>e.id).reverse();
    state.workoutOccurrenceOverrides={[item.scheduledDate]:{[item.workoutId]:{orderedEntryIds:order}}};
    const next=applyFlexibleWeek(state,proposal(state)).state;
    expect(plannedWorkoutForDate(next,'2026-09-05').exercises.map(e=>e.id)).toEqual(order);
  });
  it('early starting a carried session stores the actual local performance date', () => {
    const state=fixture(), next=applyFlexibleWeek(state,proposal(state,'2026-09-08')).state;next.selectedDate='2026-09-08';
    const active=startWorkout(next,plannedWorkoutForDate(next,'2026-09-08'));
    expect(active.canonicalPlanDate).toBe('2026-09-05');expect(active.originalScheduledDate).toBe('2026-08-31');
  });
  it('restoring a past moved session clears orphaned temporary edits', () => {
    const state=fixture(), next=applyFlexibleWeek(state,proposal(state)).state;
    const record=Object.values(next.flexibleWeek.sessions)[0];
    next.todayAdaptation={programDayId:record.workoutId,date:record.scheduledDate};
    next.workoutOccurrenceOverrides={[record.scheduledDate]:{[record.workoutId]:{orderedEntryIds:['example']}}};
    const restored=applyFlexibleWeek(next,proposeFlexibleWeek(next,{mode:'restore'})).state;
    expect(restored.todayAdaptation).toBeNull();
    expect(restored.workoutOccurrenceOverrides[record.scheduledDate][record.workoutId]).toBeUndefined();
  });
  it('Weekly Review identifies mixed carried program weeks', () => {
    const state=fixture();
    state.workouts=[1,2].map(week=>({id:`mixed-${week}`,completedAt:'2026-09-05T12:00:00',canonicalPlanDate:'2026-09-05',exercises:[{exerciseId:'bench-press',sets:[{completed:true,weight:60,reps:8}]}],trainingBlock:{blockWeekNumber:week,totalWeeks:6}}));
    expect(weeklyPerformanceReview(state,'2026-09-05').blockContext.weeks).toEqual([1,2]);
  });
  for (const [from, to] of [['2026-09-06','2026-09-07'],['2026-09-30','2026-10-01'],['2026-12-31','2027-01-01'],['2026-03-29','2026-03-30']]) it(`local calendar arithmetic ${from} → ${to}`, () => expect(addCalendarDays(from, 1)).toBe(to));
});
