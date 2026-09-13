import { baseWeekSchedule, exerciseCatalog, isoDay, weekKey, workoutPlanDate } from './domain.js';
import { prescribeTrainingBlockWorkout, resolveTrainingBlockSkips } from './trainingBlocks.js';
import { combinedOccurrenceState, combinedAdjustment } from './combinedWorkoutLifecycle.js';

export const addCalendarDays = (date, amount) => {
  const value = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return isoDay(value);
};
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && isoDay(new Date(`${date}T12:00:00`)) === date;
const identity = item => `${item.workoutId}:${item.originalDate}`;
const records = state => Object.values(state.flexibleWeek?.sessions || {});
export function flexiblePlanFingerprint(state) {
  const program = state.program;
  if (!program) return 'none';
  const serialized = JSON.stringify({ id: program.id, version: program.version, days: program.days, rotationStartDate: program.rotationStartDate,
    block: program.trainingBlock && { id: program.trainingBlock.id, weeks: program.trainingBlock.weeks, totalWeeks: program.trainingBlock.totalWeeks } });
  let first = 2166136261, second = 5381;
  for (const char of serialized) { first = Math.imul(first ^ char.charCodeAt(0), 16777619); second = Math.imul(second, 33) ^ char.charCodeAt(0); }
  return `${serialized.length}:${first >>> 0}:${second >>> 0}`;
}
export function flexibleReviewFingerprint(state) {
  return JSON.stringify([flexiblePlanFingerprint(state), state.flexibleWeek, state.weekScheduleOverrides, state.workoutOccurrenceOverrides,
    state.activeWorkout, state.activeOptionalSession, state.workouts, state.todayAdaptation, state.program?.trainingBlock?.currentWeek]);
}
export function flexibleWeekConflict(state) {
  return records(state).some(record => !['completed', 'active'].includes(flexibleSessionStatus(state, record)) && record.planFingerprint !== flexiblePlanFingerprint(state));
}
export function flexibleSessionStatus(state, item, today = isoDay()) {
  const combined=combinedOccurrenceState(state,item);
  if(combined)return combined;
  const id = item.logicalSessionId || item.id || identity(item);
  const matches = workout => workout && (workout.logicalSessionId === id ||
    (!workout.logicalSessionId && workout.programDayId === item.workoutId && [item.originalDate, item.scheduledDate].includes(workoutPlanDate(workout))));
  if ((state.workouts || []).some(w => w.completedAt && matches(w))) return 'completed';
  if (matches(state.activeWorkout)) return 'active';
  if (item.skipped) return 'skipped';
  if (item.optional || item.workout?.optional) return 'optional';
  return item.scheduledDate < today ? 'missed' : 'planned';
}
function materialize(state, record) {
  const source = state.program?.days.find(day => day.id === record.workoutId);
  if (!source || record.planFingerprint !== flexiblePlanFingerprint(state)) return null;
  let prescribed = source;
  if (record.blockWeekNumber && state.program.trainingBlock) {
    prescribed = prescribeTrainingBlockWorkout({ ...state, program: { ...state.program, trainingBlock: { ...state.program.trainingBlock, currentWeek: record.blockWeekNumber } } }, source);
  } else prescribed = prescribeTrainingBlockWorkout(state, source);
  const occurrence = state.workoutOccurrenceOverrides?.[record.scheduledDate]?.[record.workoutId];
  if (occurrence?.skipWorkout) return null;
  if (occurrence) {
    const excluded = new Set(occurrence.excludedEntryIds || []), order = occurrence.orderedEntryIds || [];
    prescribed = { ...prescribed, exercises: prescribed.exercises.filter(e => !excluded.has(e.id)).sort((a, b) => (order.indexOf(a.id) < 0 ? 999 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 999 : order.indexOf(b.id))) };
  }
  return { ...record, logicalSessionId: record.id, moved: record.scheduledDate !== record.originalDate,
    workout: { ...prescribed, logicalSessionId: record.id, originalScheduledDate: record.originalDate, flexibleWeekMoved: record.scheduledDate !== record.originalDate } };
}
export function effectiveWeekSchedule(state, date, {includeCombined=false} = {}) {
  const start = weekKey(date), end = addCalendarDays(start, 6);
  const stored = records(state), ids = new Set(stored.map(r => r.id));
  const base = baseWeekSchedule(state, date).filter(item => !ids.has(identity(item))).map(item => ({ ...item, logicalSessionId: identity(item) }));
  // Invalid references are quarantined, never rebound to a new/deleted template.
  const moved = stored.filter(r => !r.skipped && r.scheduledDate >= start && r.scheduledDate <= end).map(r => materialize(state, r)).filter(Boolean);
  return [...base, ...moved].filter(item=>includeCombined || !combinedOccurrenceState(state,item)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.logicalSessionId.localeCompare(b.logicalSessionId));
}
export function flexibleSourceForDate(state, date) {
  return records(state).filter(r => r.originalDate === date && (r.skipped || r.scheduledDate !== date));
}
export function flexibleSessions(state, today = isoDay()) {
  const first = addCalendarDays(weekKey(today), -7), last = addCalendarDays(today, 13);
  const all = new Map();
  for (let cursor = first; cursor <= last; cursor = addCalendarDays(cursor, 7)) {
    for (const item of effectiveWeekSchedule(state, cursor,{includeCombined:true})) if (item.originalDate <= last) all.set(item.logicalSessionId, item);
  }
  for (const record of records(state)) {
    const item = materialize(state, record);
    if (item && (record.scheduledDate <= last || record.skipped)) all.set(record.id, item);
  }
  return [...all.values()].filter(item => item.originalDate >= (state.program?.trainingBlock?.startDate || weekKey(today)) || state.flexibleWeek?.sessions?.[item.logicalSessionId]).map(item => ({ ...item, status: flexibleSessionStatus(state, item, today) })).sort((a, b) => a.originalDate.localeCompare(b.originalDate) || a.logicalSessionId.localeCompare(b.logicalSessionId));
}
const movable = item => ['planned', 'missed', 'optional'].includes(item.status);
export function missedFlexibleSessions(state, today = isoDay()) {
  return flexibleSessions(state, today).filter(item => item.status === 'missed' && !item.workout.optional && item.originalDate >= (state.program?.trainingBlock?.startDate || weekKey(today)));
}
function overlap(a, b) {
  const muscles = workout => new Set((workout?.exercises || []).flatMap(e => exerciseCatalog[e.exerciseId]?.muscles?.slice(0, 1) || [e.primaryMuscle || e.muscle]).filter(Boolean));
  const first = muscles(a.workout), second = muscles(b.workout);
  return [...first].some(m => second.has(m)) || (/lower|legs/i.test(a.workout.name) && /lower|legs/i.test(b.workout.name));
}
export function proposeFlexibleWeek(state, request, today = isoDay()) {
  if (combinedAdjustment(state)) return {status:'conflict',error:'Finish or cancel the combined workout before changing its source schedule.'};
  const fail = error => ({ status: 'conflict', error });
  if (!validDate(today) || !state.program) return fail('No current plan is available.');
  if (flexibleWeekConflict(state) && request.mode !== 'restore') return fail('Your plan changed. Review and clear the old temporary schedule first.');
  const fingerprint = flexibleReviewFingerprint(state), end = addCalendarDays(today, 13);
  const all = flexibleSessions(state, today), byId = new Map(all.map(i => [i.logicalSessionId, i]));
  const changes = [];
  let availabilitySchedule;
  const push = (item, toDate, skipped = false) => {
    const existing = state.flexibleWeek?.sessions?.[item.logicalSessionId];
    const futureWeeks = Math.max(0, Math.round((new Date(`${weekKey(item.originalDate)}T12:00:00`) - new Date(`${weekKey(today)}T12:00:00`)) / 604800000));
    changes.push({ logicalSessionId: item.logicalSessionId, workoutId: item.workoutId, name: item.workout.name, originalDate: item.originalDate, fromDate: item.scheduledDate, toDate, skipped,
      blockWeekNumber: existing?.blockWeekNumber || (item.workout.trainingBlock ? Math.min(item.workout.trainingBlock.totalWeeks, item.workout.trainingBlock.blockWeekNumber + futureWeeks) : null) });
  };
  if (request.mode === 'restore') {
    for (const record of records(state)) {
      if (['active', 'completed'].includes(flexibleSessionStatus(state, record, today))) continue;
      const item = byId.get(record.id);
      if (item && record.originalDate >= today) push(item, record.originalDate);
    }
  } else if (request.mode === 'skip' || request.mode === 'move') {
    const item = byId.get(request.sessionId);
    if (!item || !movable(item)) return fail('This session is active, completed, or no longer available.');
    if (request.mode === 'skip') push(item, item.scheduledDate, true);
    else {
      if (!validDate(request.toDate) || request.toDate < today || request.toDate > end) return fail('Choose a date within the next 14 days.');
      if (request.availableDates && !request.availableDates.includes(request.toDate)) return fail('This date is not available.');
      if (all.some(i => i.logicalSessionId !== item.logicalSessionId && i.scheduledDate === request.toDate && i.status !== 'skipped')) return fail('Another workout is on that date. Adjust remaining week to review a complete schedule, or choose another day.');
      push(item, request.toDate);
    }
  } else if (request.mode === 'available') {
    if (!Array.isArray(request.availableDates) || request.availableDates.some(date => !validDate(date) || date < today || date > end) || (request.windowDays != null && ![7, 14].includes(request.windowDays))) return fail('Choose valid dates within the temporary availability window.');
    const available = [...new Set(request.availableDates || [])].filter(d => validDate(d) && d >= today && d <= end).sort();
    // Availability constrains the rolling window shown by the picker, not the
    // calendar week (which ends today when the picker is opened on Sunday).
    const cutoff = request.carry ? addCalendarDays(weekKey(today), 6) : addCalendarDays(today, request.windowDays === 14 ? 13 : 6);
    if (!request.carry && available.some(date => date > cutoff)) return fail('Show more dates before selecting days outside this window.');
    const outstanding = all.filter(i => movable(i) && (i.scheduledDate <= cutoff || records(state).some(r => r.id === i.logicalSessionId)) && i.originalDate >= (state.program.trainingBlock?.startDate || weekKey(today)));
    const targets = request.carry ? all.filter(i => movable(i) && i.originalDate >= (outstanding[0]?.originalDate || today) && i.originalDate <= end) : outstanding;
    const targetIds = new Set(targets.map(i => i.logicalSessionId));
    const occupied = new Set(all.filter(i => !targetIds.has(i.logicalSessionId) && i.status !== 'skipped').map(i => i.scheduledDate));
    if (state.activeOptionalSession) occupied.add(state.activeOptionalSession.date);
    const dates = request.carry ? [...new Set([...available, ...Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).filter(d => d > cutoff)])].sort() : available;
    const usableDays = dates.filter(date => !occupied.has(date)).length;
    if (targets.length > usableDays) return { status: 'insufficient-capacity', remainingSessions: targets.length, selectedDays: available.length, usableDays,
      error: `${targets.length} ${targets.length === 1 ? 'session remains' : 'sessions remain'}, but you selected ${available.length} training ${available.length === 1 ? 'day' : 'days'}.${usableDays < available.length ? ` Only ${usableDays} are usable without moving other sessions.` : ''}` };
    if (targets.every(item => dates.includes(item.scheduledDate) && !occupied.has(item.scheduledDate))) return { status: 'no-change', message: 'Your current schedule already fits these days.' };
    let best = null, nodes = 0;
    function search(index, chosen, score) {
      if (++nodes > 30000 || best && score >= best.score) return;
      if (index === targets.length) { best = { chosen, score }; return; }
      const item = targets[index], previous = chosen.at(-1);
      for (const date of dates) {
        if (occupied.has(date) || previous && date <= previous || dates.length - dates.indexOf(date) < targets.length - index) continue;
        const distance = Math.abs((new Date(`${date}T12:00:00`) - new Date(`${item.scheduledDate}T12:00:00`)) / 86400000);
        const adjacent = previous && addCalendarDays(previous, 1) === date;
        const originalAdjacent = index > 0 && addCalendarDays(targets[index - 1].originalDate, 1) === item.originalDate;
        search(index + 1, [...chosen, date], score + distance + (adjacent && !originalAdjacent ? overlap(targets[index - 1], item) ? 6 : 2 : 0));
      }
    }
    search(0, [], 0);
    if (!best) return fail('Not all sessions fit. Carry forward, explicitly skip one session, or choose more available days.');
    targets.forEach((item, i) => { if (item.scheduledDate !== best.chosen[i]) push(item, best.chosen[i]); });
    availabilitySchedule = targets.map((item, i) => ({ logicalSessionId: item.logicalSessionId, name: item.workout.name, fromDate: item.scheduledDate, toDate: best.chosen[i] }));
  } else return fail('Choose how you want to adjust the week.');
  if (!changes.length && request.mode !== 'restore') return fail('No schedule changes are needed.');
  let final = all.filter(i => i.status !== 'skipped').map(i => {
    const change = changes.find(c => c.logicalSessionId === i.logicalSessionId);
    return change?.skipped ? null : { ...i, scheduledDate: change?.toDate || i.scheduledDate };
  }).filter(Boolean);
  if (request.mode === 'restore') {
    const kept = Object.fromEntries(records(state).filter(r => ['active', 'completed'].includes(flexibleSessionStatus(state, r, today))).map(r => [r.id, r]));
    final = flexibleSessions({ ...state, flexibleWeek: { ...state.flexibleWeek, sessions: kept } }, today).filter(i => i.status !== 'skipped');
  }
  const seen = new Set();
  for (const item of final) {
    if (seen.has(item.scheduledDate)) return fail('Restoring would create a collision. Adjust remaining week instead.');
    seen.add(item.scheduledDate);
  }
  const adjusted = state.todayAdaptation;
  const adaptationConflict = changes.some(c => c.workoutId === adjusted?.programDayId && c.fromDate === adjusted?.date && (c.skipped || c.toDate !== c.fromDate));
  const lastChangedDate = changes.reduce((last, change) => change.toDate > last ? change.toDate : last, today);
  const rejoinDate = final.filter(item => item.originalDate === item.scheduledDate && item.scheduledDate > lastChangedDate).sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]?.scheduledDate || null;
  return { status: 'ready', fingerprint, today, request: structuredClone(request), changes, adaptationConflict,
    availabilitySchedule,
    rejoinDate,
    warnings: final.some((i, n) => n && addCalendarDays(final[n - 1].scheduledDate, 1) === i.scheduledDate) ? ['This creates back-to-back training days.'] : [] };
}
export function applyFlexibleWeek(state, proposal, { adaptationChoice } = {}) {
  if (!proposal || proposal.status !== 'ready' || proposal.today !== isoDay() || proposal.fingerprint !== flexibleReviewFingerprint(state)) return { status: 'stale', state, error: 'The plan or sessions changed. Review the schedule again.' };
  if (proposal.adaptationConflict && !['restore', 'keep'].includes(adaptationChoice)) return { status: 'conflict', state, error: 'Choose what happens to the today-only adjustment.' };
  const checked = proposeFlexibleWeek(state, proposal.request, proposal.today);
  if (checked.status !== 'ready' || JSON.stringify(checked.changes) !== JSON.stringify(proposal.changes)) return { status: 'stale', state, error: 'The schedule changed. Review it again.' };
  const next = structuredClone(state);
  next.flexibleWeek ||= { schemaVersion: 1, revision: 0, sessions: {} };
  if (proposal.request.mode === 'restore') {
    for (const [id, record] of Object.entries(next.flexibleWeek.sessions)) if (!['active', 'completed'].includes(flexibleSessionStatus(state, record))) {
      // A past/quarantined record has no valid destination in this review.
      // Clear its date-only edits rather than leaving orphaned references.
      if (!proposal.changes.some(change => change.logicalSessionId === id)) {
        if (next.todayAdaptation?.programDayId === record.workoutId && next.todayAdaptation.date === record.scheduledDate) next.todayAdaptation = null;
        if (next.workoutOccurrenceOverrides?.[record.scheduledDate]) delete next.workoutOccurrenceOverrides[record.scheduledDate][record.workoutId];
      }
      delete next.flexibleWeek.sessions[id];
    }
  } else for (const change of proposal.changes) {
    if (next.weekScheduleOverrides?.[weekKey(change.originalDate)]) delete next.weekScheduleOverrides[weekKey(change.originalDate)][change.workoutId];
    next.flexibleWeek.sessions[change.logicalSessionId] = { id: change.logicalSessionId, workoutId: change.workoutId, name: change.name, originalDate: change.originalDate, scheduledDate: change.toDate, skipped: change.skipped, blockId: state.program?.trainingBlock?.id || null, blockWeekNumber: change.blockWeekNumber, planFingerprint: flexiblePlanFingerprint(state), updatedAt: new Date().toISOString() };
    const occurrence = next.workoutOccurrenceOverrides?.[change.fromDate]?.[change.workoutId];
    if (occurrence && change.toDate !== change.fromDate) {
      (next.workoutOccurrenceOverrides[change.toDate] ||= {})[change.workoutId] = occurrence;
      delete next.workoutOccurrenceOverrides[change.fromDate][change.workoutId];
    }
    if (next.todayAdaptation?.programDayId === change.workoutId && next.todayAdaptation.date === change.fromDate) {
      if (adaptationChoice === 'keep' && !change.skipped) next.todayAdaptation.date = change.toDate;
      else next.todayAdaptation = null;
    }
  }
  if (proposal.request.mode === 'restore') {
    for (const change of proposal.changes) {
      const occurrence = next.workoutOccurrenceOverrides?.[change.fromDate]?.[change.workoutId];
      if (occurrence && change.toDate !== change.fromDate) {
        (next.workoutOccurrenceOverrides[change.toDate] ||= {})[change.workoutId] = occurrence;
        delete next.workoutOccurrenceOverrides[change.fromDate][change.workoutId];
      }
      if (next.todayAdaptation?.programDayId === change.workoutId && next.todayAdaptation.date === change.fromDate) {
        if (adaptationChoice === 'keep') next.todayAdaptation.date = change.toDate;
        else next.todayAdaptation = null;
      }
    }
  }
  next.flexibleWeek.revision += 1;
  resolveTrainingBlockSkips(next, records(next).filter(record => record.planFingerprint === flexiblePlanFingerprint(next)));
  return { status: 'applied', state: next };
}
