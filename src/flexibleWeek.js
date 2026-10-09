import { baseWeekSchedule, exerciseCatalog, isoDay, weekKey, workoutPlanDate, workoutPerformedDate } from './domain.js';
import { prescribeTrainingBlockWorkout, resolveTrainingBlockSkips } from './trainingBlocks.js';
import { combinedOccurrenceState, combinedAdjustment, isCombinedAdjustment } from './combinedWorkoutLifecycle.js';
import { temporaryOccurrenceWorkout } from './temporaryPlan.js';
import { applyCombinedProposal, combineFingerprint } from './combineWorkouts.js';
import {scheduleTransactionId} from './scheduleTransactions.js';

export const addCalendarDays = (date, amount) => {
  const value = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return isoDay(value);
};
export function remainingPlanWeekDates(today = isoDay()) {
  const end = addCalendarDays(weekKey(today), 6), dates = [];
  for (let date = today; date <= end; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
}
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
  return flexibleSessionLifecycle(state,item,today).status;
}
// The same identity/linkage resolves both scheduling eligibility and historical
// presentation. Explicit IDs win; legacy matching retains only the established
// template + exact schedule-date fallback, never a title or nearest date.
export function workoutMatchesOccurrence(workout,item) {
  if(!workout||!item||workout.source==='freestyle')return false;
  const id=item.logicalSessionId || item.id || identity(item);
  const explicit=workout.sourceOccurrenceId || workout.logicalSessionId;
  if(explicit)return explicit===id;
  if(workout.source==='repeat'||workout.historicalImport)return false;
  return Boolean((item.workoutId && workout.programDayId===item.workoutId || (!workout.programDayId && item.workout?.weekday && workout.templateId===item.workout.weekday)) &&
    (workout.originalScheduledDate ? workout.originalScheduledDate===item.originalDate : workoutPlanDate(workout)===item.scheduledDate));
}
export function completedWorkoutForOccurrence(state,item) {
  return (state.workouts||[]).find(w=>w.completedAt && (workoutMatchesOccurrence(w,item) ||
    w.combinedSourcesResolved===true && isCombinedAdjustment(w.adjustment) && w.adjustment.sourceSessions?.some(s=>s.programId===state.program?.id && s.logicalSessionId===(item.logicalSessionId||item.id||identity(item))))) || null;
}
export function flexibleSessionLifecycle(state, item, today = isoDay()) {
  const completedWorkout=completedWorkoutForOccurrence(state,item);
  const activeWorkout=workoutMatchesOccurrence(state.activeWorkout,item)?state.activeWorkout:null;
  const combined=combinedOccurrenceState(state,item);
  const status=completedWorkout ? (combined==='combined'?'combined':'completed') : activeWorkout?'active':combined || (item.skipped?'skipped':item.optional||item.workout?.optional?'optional':item.scheduledDate<today?'missed':'planned');
  return {status,logicalSessionId:item.logicalSessionId||item.id||identity(item),completedWorkout,activeWorkout,
    originalScheduledDate:item.originalDate,currentScheduledDate:item.scheduledDate,
    actualPerformedDate:completedWorkout?workoutPerformedDate(completedWorkout):activeWorkout?workoutPerformedDate(activeWorkout):null};
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
  prescribed = temporaryOccurrenceWorkout(state, occurrence, prescribed, record.scheduledDate);
  return { ...record, logicalSessionId: record.id, moved: record.scheduledDate !== record.originalDate,
    workout: { ...prescribed, logicalSessionId: record.id, originalScheduledDate: record.originalDate, flexibleWeekMoved: record.scheduledDate !== record.originalDate } };
}
// Review the saved occurrence links, not the mere presence of flexibleWeek.
// A stale link stays visible as unresolved instead of being presented as a
// successful move to a destination where materialize() cannot show it.
export function temporaryScheduleReview(state) {
  const items = records(state).map(record => {
    const lifecycle = flexibleSessionLifecycle(state, record);
    const finished = ['active', 'completed', 'combined'].includes(lifecycle.status);
    const destination = !record.skipped && materialize(state, record);
    let issue = null;
    if (!finished && !record.skipped && !destination) {
      issue = state.program?.days.some(day => day.id === record.workoutId)
        ? 'The plan changed. Choose how to restore this workout to the current schedule.'
        : 'The original workout is no longer in this plan. Clear its old temporary move.';
    }
    return {
      id: record.id, name: record.name || destination?.workout?.name || 'Workout',
      originalDate: record.originalDate, scheduledDate: record.scheduledDate,
      skipped: Boolean(record.skipped), finished, issue,
    };
  }).sort((a,b) => a.originalDate.localeCompare(b.originalDate) || a.id.localeCompare(b.id));
  const currentWeek=weekKey(isoDay());
  const activeItems=items.filter(item=>(item.issue || item.skipped || item.originalDate!==item.scheduledDate) &&
    (item.issue || !item.finished && (item.originalDate>=currentWeek || item.scheduledDate>=currentWeek)));
  const savedIds=new Set(activeItems.map(item=>item.id));
  const unchanged=effectiveWeekSchedule(state,isoDay()).filter(item=>!savedIds.has(item.logicalSessionId))
    .map(item=>({id:item.logicalSessionId,name:item.workout.name,originalDate:item.originalDate,
      scheduledDate:item.scheduledDate,skipped:false,finished:false,issue:null,unchanged:true}));
  return {
    items:activeItems,
    resultingItems:[...activeItems,...unchanged].sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)||a.id.localeCompare(b.id)),
    unresolved: activeItems.filter(item => item.issue),
    moved: activeItems.filter(item => !item.issue && !item.skipped && item.originalDate !== item.scheduledDate),
  };
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
export function flexibleOccurrencesForDate(state,date,readCache=null) {
  const all=new Map();
  const put=item=>{if(item&&(item.scheduledDate===date||item.originalDate===date)){const id=item.logicalSessionId||item.id||identity(item);all.set(id,{...item,logicalSessionId:id});}};
  const week=weekKey(date);
  let schedule=readCache?.weeks.get(week);
  if(!schedule){schedule=effectiveWeekSchedule(state,date,{includeCombined:true});readCache?.weeks.set(week,schedule);}
  schedule.forEach(put);
  if(readCache&&!readCache.materialized)readCache.materialized=records(state).map(record=>materialize(state,record));
  (readCache?.materialized || records(state).map(record=>materialize(state,record))).forEach(put);
  // A legacy explicit skip is absent from baseWeekSchedule. Materialize only
  // its known template/date for truthful read-only presentation, without editing
  // the saved override or inventing a completion.
  const overrides=state.workoutOccurrenceOverrides?.[date];
  if(overrides&&Object.values(overrides).some(o=>o.skipWorkout)){
    const unskipped=Object.fromEntries(Object.entries(overrides).map(([id,o])=>[id,{...o,skipWorkout:false}]));
    baseWeekSchedule({...state,workoutOccurrenceOverrides:{...state.workoutOccurrenceOverrides,[date]:unskipped}},date)
      .filter(item=>overrides[item.workoutId]?.skipWorkout).forEach(item=>put({...item,skipped:true}));
  }
  return [...all.values()].map(item=>({...item,...flexibleSessionLifecycle(state,item)}));
}
export function flexibleOccurrenceForDate(state,date,workoutId) {
  const items=flexibleOccurrencesForDate(state,date).filter(item=>!workoutId||item.workoutId===workoutId);
  const scheduled=items.filter(item=>item.scheduledDate===date);
  return scheduled.find(item=>['planned','missed','optional','active'].includes(item.status)) || scheduled[0] || items[0] || null;
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
// Restore applies only to still-future placements with no historical or active
// ownership. A past skip/move and an archived block resolution remain facts.
export function temporaryScheduleRestoreScope(state,today=isoDay()) {
  const removable=records(state).filter(record=>record.originalDate>=today && record.scheduledDate>=today &&
    !['active','completed','combined','reserved'].includes(flexibleSessionStatus(state,record,today)) &&
    state.activeOptionalSession?.date!==record.scheduledDate && state.activeOptionalSession?.date!==record.originalDate &&
    !state.program?.trainingBlock?.resolvedSkips?.some(skip=>skip.logicalSessionId===record.id));
  return {removable,retained:records(state).filter(record=>!removable.includes(record))};
}
export function temporaryScheduleRejoinDate(state,today=isoDay(),combined=combinedAdjustment(state),overrides=records(state)) {
  const dates=overrides.filter(record=>(record.skipped||record.originalDate!==record.scheduledDate) && !['completed','combined'].includes(flexibleSessionStatus(state,record,today)))
    .flatMap(record=>[record.originalDate,record.scheduledDate]);
  if(combined)dates.push(combined.date,...combined.sourceSessions.flatMap(source=>[source.originalDate,source.scheduledDate]));
  const last=dates.filter(Boolean).sort().at(-1);
  return last?addCalendarDays(last,1):null;
}
// The program's canonical calendar occurrence week is Monday–Sunday. Dates
// shown by the destination picker never extend this source transaction.
export function availabilityAdjustmentScope(state, today = isoDay(), sessions = flexibleSessions(state, today)) {
  const start = weekKey(today), end = addCalendarDays(start, 6);
  const sources = sessions.filter(item => {
    const ownWeek = item.originalDate >= start && item.originalDate <= end;
    const carriedIn = item.originalDate < start && item.scheduledDate >= start && item.scheduledDate <= end &&
      Boolean(state.flexibleWeek?.sessions?.[item.logicalSessionId]);
    return (ownWeek || carriedIn) && !moveSourceError(state, item, today) &&
      (item.status !== 'missed' || actionableMissedSession(state, item, today));
  });
  return { start, end, sources };
}
function scheduleChangeError(state, mode, today) {
  if (state.todayAdaptation?.mode === 'repeat') return 'Finish or cancel the repeated workout before changing the schedule.';
  if (combinedAdjustment(state)) return 'Finish or cancel the combined workout before changing its source schedule.';
  if (!validDate(today) || !state.program) return 'No current plan is available.';
  if (flexibleWeekConflict(state) && mode !== 'restore') return 'Your plan changed. Review and clear the old temporary schedule first.';
  return null;
}
function moveSourceError(state, item, today) {
  if (!item || !movable({...item, status:flexibleSessionStatus(state,item,today)})) return 'This session is active, completed, or no longer available.';
  if (state.program.trainingBlock?.completed || item.originalDate < (state.program.trainingBlock?.startDate || isoDay(state.program.createdAt || today))) return 'This session is outside the current plan.';
  if (state.activeOptionalSession?.date === item.scheduledDate) return 'An optional workout is active on that date. Finish or cancel it first.';
  return null;
}
const missedMoveIsBackward = (item, toDate, today) => item.status === 'missed' && (toDate < today || toDate < item.originalDate);
// Shared Move chooser sources. Keep the canonical missed-backlog horizon, and
// include upcoming occurrences throughout the existing rolling 14-day window.
// Explicit old-calendar moves still use flexibleSessionById, not a revived backlog.
export function moveWorkoutCandidates(state, today = isoDay()) {
  if (scheduleChangeError(state, 'move', today)) return [];
  const end = addCalendarDays(today, 13), adjustment = state.todayAdaptation;
  return flexibleSessions(state,today).filter(item =>
    !moveSourceError(state,item,today) &&
    !(adjustment?.programDayId === item.workoutId && adjustment.date === item.scheduledDate) &&
    (actionableMissedSession(state,item,today) ||
      ['planned','optional'].includes(item.status) && item.scheduledDate >= today && item.scheduledDate <= end))
    .filter(item=>hasMoveWorkoutDestination(state,item.logicalSessionId,today))
    .sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.originalDate.localeCompare(b.originalDate) || a.logicalSessionId.localeCompare(b.logicalSessionId));
}
// An occurrence's visible status is not scheduling permission. Resolve the exact
// identity and validate a real destination before advertising the operation.
// Stop at the first valid choice; the picker still enumerates the full window.
export function hasMoveWorkoutDestination(state, sessionId, today = isoDay()) {
  for(let index=0;index<14;index++) {
    if(proposeFlexibleWeek(state,{mode:'move',sessionId,toDate:addCalendarDays(today,index)},today).status==='ready')return true;
  }
  return false;
}
// The Adjust week entry opens the existing mode surface. Offer it only when
// that surface has an eligible operation or a saved change to inspect/resolve.
export function hasTemporaryScheduleAction(state,today=isoDay()) {
  if(temporaryScheduleReview(state).items.length || combinedAdjustment(state))return true;
  if(proposeFlexibleWeek(state,{mode:'available',availableDates:remainingPlanWeekDates(today),dateScope:'current-week'},today).remainingSessions)return true;
  if(missedFlexibleSessions(state,today).some(item=>proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId},today).status==='ready'))return true;
  return moveWorkoutCandidates(state,today).length>0;
}
// Destination affordances use the same full validation as review and Apply.
// A freestyle session is not a planned occurrence and occupies no schedule slot.
export function moveWorkoutDestinations(state, sessionId, today = isoDay(), availabilityRequest = null) {
  const moveState = availabilityRequest ? availabilityMoveState(state, availabilityRequest, sessionId,today) : state;
  return Array.from({length:14}, (_, index) => {
    const date = addCalendarDays(today, index);
    const proposal = proposeFlexibleWeek(moveState, {mode:'move', sessionId, toDate:date}, today);
    const draft = proposal.status === 'ready' && availabilityRequest ? proposeFlexibleWeek(state, {...availabilityRequest,
      resolutions:[...(availabilityRequest.resolutions || []).filter(r=>r.sessionId!==sessionId),{mode:'move',sessionId,toDate:date}]},today) : proposal;
    return {date, available:proposal.status === 'ready' && ['ready','insufficient-capacity'].includes(draft.status), reason:proposal.error || draft.error || ''};
  });
}
// Project only explicitly reviewed occurrence changes for the shared Move
// validator. This never persists a draft or removes an unresolved source.
function availabilityMoveState(state, request, exceptId,today=isoDay()) {
  const changes = (request.resolutions || []).filter(r=>r.sessionId!==exceptId).flatMap(r=>{
    const item=flexibleSessionById(state,r.sessionId,today);
    return item && ['move','skip'].includes(r.mode) ? [{logicalSessionId:item.logicalSessionId,workoutId:item.workoutId,
      name:item.workout.name,originalDate:item.originalDate,fromDate:item.scheduledDate,toDate:r.mode==='skip'?item.scheduledDate:r.toDate,
      skipped:r.mode==='skip',blockWeekNumber:item.workout.trainingBlock?.blockWeekNumber || null}] : [];
  });
  return projectFlexibleWeek(state,{request:{mode:'available'},changes},{resolveSkips:false});
}
// Explicit calendar selection may open a closed-week fact. It does not extend
// Today's backlog, nor scan old weeks unless that exact identity was requested.
export function flexibleSessionById(state, id, today=isoDay()) {
  const current=flexibleSessions(state,today).find(item=>item.logicalSessionId===id);
  if(current)return current;
  const originalDate=String(id||'').slice(-10);
  if(!validDate(originalDate) || originalDate < (state.program?.trainingBlock?.startDate || isoDay(state.program?.createdAt || today)))return null;
  const item=effectiveWeekSchedule(state,originalDate,{includeCombined:true}).find(item=>item.logicalSessionId===id);
  return item?{...item,status:flexibleSessionStatus(state,item,today)}:null;
}
export function missedFlexibleSessions(state, today = isoDay()) {
  return flexibleSessions(state, today).filter(item => actionableMissedSession(state, item, today))
    .sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.originalDate.localeCompare(b.originalDate) || a.logicalSessionId.localeCompare(b.logicalSessionId));
}
// Status is factual; actionability expires at the end of the destination week.
// An explicitly carried occurrence belongs to that week, without changing its ID.
export function actionableMissedSession(state, item, today = isoDay()) {
  const adjustment=state.todayAdaptation;
  if(adjustment && adjustment.mode!=='repeat' && adjustment.programDayId===item.workoutId && adjustment.date===item.scheduledDate)return false;
  return Boolean(state.program && !state.program.trainingBlock?.completed && flexibleSessionStatus(state,item,today) === 'missed' && !item.workout?.optional &&
    item.scheduledDate >= weekKey(today) && item.scheduledDate < today &&
    item.originalDate >= (state.program.trainingBlock?.startDate || isoDay(state.program.createdAt || today)));
}
function overlap(a, b) {
  const muscles = workout => new Set((workout?.exercises || []).flatMap(e => exerciseCatalog[e.exerciseId]?.muscles?.slice(0, 1) || [e.primaryMuscle || e.muscle]).filter(Boolean));
  const first = muscles(a.workout), second = muscles(b.workout);
  return [...first].some(m => second.has(m)) || (/lower|legs/i.test(a.workout.name) && /lower|legs/i.test(b.workout.name));
}
export function proposeFlexibleWeek(state, request, today = isoDay()) {
  const fail = error => ({ status: 'conflict', error });
  const scheduleError = scheduleChangeError(state,request.mode,today);
  if (scheduleError) return fail(scheduleError);
  const fingerprint = flexibleReviewFingerprint(state), end = addCalendarDays(today, 13);
  const all = flexibleSessions(state, today);
  if(request.sessionId && !all.some(i=>i.logicalSessionId===request.sessionId)){
    const explicit=flexibleSessionById(state,request.sessionId,today);if(explicit)all.push(explicit);
  }
  const byId = new Map(all.map(i => [i.logicalSessionId, i]));
  const changes = [];
  let availabilitySchedule, availabilityDetails;
  const push = (item, toDate, skipped = false) => {
    const existing = state.flexibleWeek?.sessions?.[item.logicalSessionId];
    const futureWeeks = Math.max(0, Math.round((new Date(`${weekKey(item.originalDate)}T12:00:00`) - new Date(`${weekKey(today)}T12:00:00`)) / 604800000));
    changes.push({ logicalSessionId: item.logicalSessionId, workoutId: item.workoutId, name: item.workout.name, originalDate: item.originalDate, fromDate: item.scheduledDate, toDate, skipped,
      blockWeekNumber: existing?.blockWeekNumber || (item.workout.trainingBlock ? Math.min(item.workout.trainingBlock.totalWeeks, item.workout.trainingBlock.blockWeekNumber + futureWeeks) : null) });
  };
  if (request.mode === 'restore') {
    for (const record of temporaryScheduleRestoreScope(state,today).removable) {
      const item = byId.get(record.id);
      if (item && record.originalDate >= today) push(item, record.originalDate);
    }
  } else if (request.mode === 'swap') {
    const first = byId.get(request.sessionId), second = byId.get(request.otherSessionId);
    const eligible = item => item && movable(item) && item.status !== 'optional' &&
      item.scheduledDate >= weekKey(today) && item.scheduledDate <= end &&
      item.originalDate >= (state.program.trainingBlock?.startDate || isoDay(state.program.createdAt || today)) &&
      !state.program.trainingBlock?.completed && state.activeOptionalSession?.date !== item.scheduledDate &&
      !(state.todayAdaptation?.programDayId === item.workoutId && state.todayAdaptation.date === item.scheduledDate);
    if (!eligible(first) || !eligible(second) || first.logicalSessionId === second.logicalSessionId || first.scheduledDate === second.scheduledDate)
      return fail('Choose two uncompleted, unreserved sessions within this week and the next 14 days.');
    if (missedMoveIsBackward(first,second.scheduledDate,today) || missedMoveIsBackward(second,first.scheduledDate,today))
      return fail('Move missed workouts forward to today or a later date, on or after their original scheduled date.');
    push(first, second.scheduledDate);
    push(second, first.scheduledDate);
  } else if (request.mode === 'skip' || request.mode === 'move') {
    const item = byId.get(request.sessionId);
    if (!item || !movable(item)) return fail('This session is active, completed, or no longer available.');
    if (request.mode === 'skip') push(item, item.scheduledDate, true);
    else {
      const sourceError = moveSourceError(state,item,today);
      if (sourceError) return fail(sourceError);
      if (!validDate(request.toDate) || request.toDate < today || request.toDate > end) return fail('Choose a date within the next 14 days.');
      if (request.toDate === item.scheduledDate) return fail('This workout is already scheduled on that date.');
      if (missedMoveIsBackward(item,request.toDate,today)) return fail('Choose a date on or after this missed workout’s original scheduled date.');
      if (request.availableDates && !request.availableDates.includes(request.toDate)) return fail('This date is not available.');
      if (state.activeOptionalSession?.date === request.toDate) return fail('An optional workout is active on that date. Finish or cancel it first.');
      const occupied = all.find(i => i.logicalSessionId !== item.logicalSessionId && i.scheduledDate === request.toDate && i.status !== 'skipped' && !(request.allowCompletedToday && request.toDate===today && i.status==='completed'));
      if (occupied) {
        if (request.toDate === today && occupied.status === 'active') return fail('Today already has an active planned workout. Choose another day.');
        if (request.toDate === today && occupied.status === 'completed') return fail('Today already has a completed planned workout. Choose another day.');
        return fail('Another workout is on that date. Adjust remaining week to review a complete schedule, or choose another day.');
      }
      push(item, request.toDate);
    }
  } else if (request.mode === 'available') {
    if (!Array.isArray(request.availableDates) || request.availableDates.some(date => !validDate(date) || date < today || date > end) ||
      (request.windowDays != null && ![7, 14].includes(request.windowDays)) ||
      (request.dateScope != null && request.dateScope !== 'current-week') ||
      (request.dateScope === 'current-week' && (request.windowDays != null || request.carry)))
      return fail('Choose valid dates within the temporary availability window.');
    const available = [...new Set(request.availableDates || [])].filter(d => validDate(d) && d >= today && d <= end).sort();
    const cutoff = request.dateScope === 'current-week' || request.carry ? addCalendarDays(weekKey(today), 6) : addCalendarDays(today, request.windowDays === 14 ? 13 : 6);
    if (!request.carry && available.some(date => date > cutoff)) return fail(request.dateScope === 'current-week'
      ? 'Adjust week can only use dates through this Sunday. Move a workout to choose a later date.'
      : 'Show more dates before selecting days outside this window.');
    const scope = availabilityAdjustmentScope(state, today, all), sources = scope.sources;
    const targetIds = new Set(sources.map(i => i.logicalSessionId));
    const resolutions=request.resolutions || [], resolved=new Map();
    if (!Array.isArray(resolutions)) return fail('Review the workout resolutions again.');
    if(new Set(resolutions.map(r=>r?.sessionId)).size!==resolutions.length || resolutions.some(r=>!r || !targetIds.has(r.sessionId) ||
      !['move','skip'].includes(r.mode) || r.mode==='move' && (!validDate(r.toDate) || r.toDate<today || r.toDate>end)))
      return fail('Review valid occurrence resolutions within the next 14 days.');
    for (const resolution of resolutions) {
      if (!targetIds.has(resolution.sessionId) || resolved.has(resolution.sessionId) || !['move','skip'].includes(resolution.mode))
        return fail('Resolve only remaining workouts from this plan week, once each.');
      const item=byId.get(resolution.sessionId);
      const checked=proposeFlexibleWeek(availabilityMoveState(state,request,resolution.sessionId,today),resolution,today);
      if (checked.status!=='ready') return fail(checked.error);
      resolved.set(resolution.sessionId,{toDate:resolution.mode==='skip'?null:resolution.toDate,skipped:resolution.mode==='skip',resolution:resolution.mode});
      push(item,resolution.mode==='skip'?item.scheduledDate:resolution.toDate,resolution.mode==='skip');
    }
    const combined=request.combinedProposal;
    if (combined) {
      const ids=Array.isArray(combined.sourceSessions)?combined.sourceSessions.map(s=>s.logicalSessionId):[];
      if (combined.mode!=='combine' || combined.schemaVersion!==1 || ids.length!==2 || ids.some(id=>!targetIds.has(id) || resolved.has(id)) || !available.includes(combined.date))
        return fail('Choose two remaining workouts and a selected day for the combined session.');
      try { applyCombinedProposal(state,combined,()=>true); } catch(error) { return fail(error.message); }
      ids.forEach(id=>resolved.set(id,{toDate:combined.date,combined:true,resolution:'combine'}));
    }
    const targets=sources.filter(item=>!resolved.has(item.logicalSessionId));
    const occupied = new Map(all.filter(i => !targetIds.has(i.logicalSessionId) && i.status !== 'skipped').map(i => [i.scheduledDate, i]));
    if (state.activeOptionalSession) occupied.set(state.activeOptionalSession.date, {workout:{name:'Active optional workout'}});
    for (const [id,resolution] of resolved) if (resolution.toDate) {
      const owner=occupied.get(resolution.toDate);
      if (owner && !(resolution.combined && owner.combined)) return fail('Two workouts cannot use the same date. Review their destinations.');
      occupied.set(resolution.toDate,{workout:{name:resolution.combined?'Combined workout':byId.get(id).workout.name},combined:resolution.combined,logicalSessionId:id});
    }
    const dates = request.carry ? [...new Set([...available, ...Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).filter(d => d > cutoff)])].sort() : available;
    const usable = dates.filter(date => !occupied.has(date)), placeCount = Math.min(targets.length, usable.length);
    availabilityDetails = { sourceScope:{start:scope.start,end:scope.end,sessionIds:sources.map(i=>i.logicalSessionId)},
      remainingSessions:sources.length, selectedDays:available.length, usableDays:usable.length,
      placedCount:placeCount+resolved.size, unresolvedCount:targets.length-placeCount, canApplySchedule:placeCount===targets.length && sources.length>0,
      dateConflicts:available.filter(date=>occupied.has(date) && !targetIds.has(occupied.get(date).logicalSessionId)).map(date=>({date,name:occupied.get(date).workout.name,logicalSessionId:occupied.get(date).logicalSessionId||null})) };
    if (!sources.length) return {status:'no-change',...availabilityDetails,message:'No remaining workouts in this plan week.'};
    let best = null, nodes = 0;
    // Keep unchanged valid schedules exactly as accepted. Otherwise use the same
    // displacement/recovery scoring for the longest placeable canonical prefix;
    // every remaining source receives an explicit unresolved review row.
    if (targets.every(item => usable.includes(item.scheduledDate))) best = {chosen:targets.map(item=>item.scheduledDate),score:0};
    function search(index, chosen, score) {
      if (++nodes > 30000 || best && score >= best.score) return;
      if (index === placeCount) { best = { chosen, score }; return; }
      const item = targets[index], previous = chosen.at(-1);
      for (const [dateIndex, date] of usable.entries()) {
        if (previous && date <= previous || usable.length - dateIndex < placeCount - index) continue;
        const distance = Math.abs((new Date(`${date}T12:00:00`) - new Date(`${item.scheduledDate}T12:00:00`)) / 86400000);
        const adjacent = previous && addCalendarDays(previous, 1) === date;
        const originalAdjacent = index > 0 && addCalendarDays(targets[index - 1].originalDate, 1) === item.originalDate;
        search(index + 1, [...chosen, date], score + distance + (adjacent && !originalAdjacent ? overlap(targets[index - 1], item) ? 6 : 2 : 0));
      }
    }
    search(0, [], 0);
    if (!best) return fail('Review the selected dates again.');
    targets.forEach((item, i) => { if (best.chosen[i] && item.scheduledDate !== best.chosen[i]) push(item, best.chosen[i]); });
    availabilitySchedule = sources.map(item => ({ logicalSessionId:item.logicalSessionId, name:item.workout.name,
      originalDate:item.originalDate, fromDate:item.scheduledDate,
      ...(resolved.get(item.logicalSessionId) || {toDate:best.chosen[targets.indexOf(item)] || null}) }));
    // Order is an optional part of this same availability transaction. Keep the
    // validated date slots; only permute the placed, individual occurrences.
    // Combined/skipped sources stay fixed and next week's sources never enter.
    if (request.workoutOrder != null) {
      const rows=availabilitySchedule.filter(row=>row.toDate && !row.skipped && !row.combined)
        .sort((a,b)=>a.toDate.localeCompare(b.toDate));
      const order=request.workoutOrder, ids=new Set(rows.map(row=>row.logicalSessionId));
      if (availabilityDetails.unresolvedCount || rows.length<2 || !Array.isArray(order) ||
          order.length!==rows.length || new Set(order).size!==rows.length || order.some(id=>!ids.has(id)))
        return fail('Resolve the remaining workouts before reordering the placed sessions.');
      const assignments=new Map(order.map((id,index)=>[id,rows[index].toDate]));
      for (const row of rows) {
        const item=byId.get(row.logicalSessionId), date=assignments.get(row.logicalSessionId);
        if (moveSourceError(state,item,today) || missedMoveIsBackward(item,date,today))
          return fail('This workout can no longer use that date. Review the schedule again.');
        row.toDate=date;
      }
      // Replace, rather than append, changes for these identities. Final
      // collision/adaptation checks and Apply revalidation below still run.
      for (let index=changes.length-1;index>=0;index--) if(ids.has(changes[index].logicalSessionId))changes.splice(index,1);
      for(const item of sources)if(ids.has(item.logicalSessionId) && item.scheduledDate!==assignments.get(item.logicalSessionId))
        push(item,assignments.get(item.logicalSessionId));
    }
    if (availabilityDetails.unresolvedCount) return {status:'insufficient-capacity',fingerprint,today,request:structuredClone(request),
      changes,availabilitySchedule,...availabilityDetails,adaptationConflict:false,warnings:[]};
  } else return fail('Choose how you want to adjust the week.');
  if (!changes.length && !availabilitySchedule && request.mode !== 'restore') return fail('No schedule changes are needed.');
  let final = all.filter(i => i.status !== 'skipped').map(i => {
    const change = changes.find(c => c.logicalSessionId === i.logicalSessionId);
    return change?.skipped ? null : { ...i, scheduledDate: change?.toDate || i.scheduledDate };
  }).filter(Boolean);
  if (request.combinedProposal) {
    const ids=request.combinedProposal.sourceSessions.map(s=>s.logicalSessionId);
    final=final.filter(item=>!ids.includes(item.logicalSessionId));
    final.push({scheduledDate:request.combinedProposal.date,originalDate:request.combinedProposal.date});
    // Reuse the canonical assembler/apply validation on the complete in-memory
    // schedule. Its fingerprint changes only because these reviewed moves were
    // staged; the original combined review was verified above against state.
    const staged=projectFlexibleWeek(state,{request,changes});
    try { applyCombinedProposal(staged,{...request.combinedProposal,fingerprint:combineFingerprint(staged)},()=>true); }
    catch(error) { return fail(error.message); }
  }
  if (request.mode === 'restore') {
    const kept = Object.fromEntries(temporaryScheduleRestoreScope(state,today).retained.map(r => [r.id, r]));
    final = flexibleSessions({ ...state, flexibleWeek: { ...state.flexibleWeek, sessions: kept } }, today).filter(i => i.status !== 'skipped');
  }
  const seen = new Set();
  for (const item of final) {
    if(request.allowCompletedToday && item.scheduledDate===today && item.status==='completed')continue;
    if (seen.has(item.scheduledDate)) return fail('Restoring would create a collision. Adjust remaining week instead.');
    seen.add(item.scheduledDate);
  }
  const adjusted = state.todayAdaptation;
  const adaptationConflict = changes.some(c => c.workoutId === adjusted?.programDayId && c.fromDate === adjusted?.date && (c.skipped || c.toDate !== c.fromDate));
  // Derive the scope from canonical occurrence changes without cloning the
  // entire workout history for every candidate date in the Move picker.
  const changedIds=new Set(changes.map(change=>change.logicalSessionId));
  const overrides=request.mode==='restore'?temporaryScheduleRestoreScope(state,today).retained:
    [...records(state).filter(record=>!changedIds.has(record.id)),...changes.map(change=>({...change,id:change.logicalSessionId,scheduledDate:change.toDate}))];
  const rejoinDate = temporaryScheduleRejoinDate(state,today,request.combinedProposal||combinedAdjustment(state),overrides);
  final.sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
  return { status: 'ready', fingerprint, today, request: structuredClone(request), changes, adaptationConflict,
    availabilitySchedule,
    ...availabilityDetails,
    rejoinDate,
    warnings: final.some((i, n) => n && addCalendarDays(final[n - 1].scheduledDate, 1) === i.scheduledDate) ? ['This creates back-to-back training days.'] : [] };
}
export function flexibleReorderRows(proposal) {
  if(proposal?.request?.mode!=='available' || proposal.status!=='ready' || proposal.unresolvedCount)return [];
  const rows=(proposal.availabilitySchedule||[]).filter(row=>row.toDate && !row.skipped && !row.combined)
    .sort((a,b)=>a.toDate.localeCompare(b.toDate));
  return rows.length>=2 ? rows : [];
}
export function applyFlexibleWeek(state, proposal, { adaptationChoice } = {}) {
  if (!proposal || proposal.status !== 'ready' || proposal.today !== isoDay() || proposal.fingerprint !== flexibleReviewFingerprint(state)) return { status: 'stale', state, error: 'The plan or sessions changed. Review the schedule again.' };
  if (proposal.adaptationConflict && !['restore', 'keep'].includes(adaptationChoice)) return { status: 'conflict', state, error: 'Choose what happens to the today-only adjustment.' };
  const checked = proposeFlexibleWeek(state, proposal.request, proposal.today);
  if (checked.status !== 'ready' || JSON.stringify(checked.changes) !== JSON.stringify(proposal.changes) ||
      JSON.stringify(checked.availabilitySchedule) !== JSON.stringify(proposal.availabilitySchedule) ||
      JSON.stringify(checked.sourceScope) !== JSON.stringify(proposal.sourceScope)) return { status: 'stale', state, error: 'The schedule changed. Review it again.' };
  if (proposal.request.mode === 'available' && !proposal.changes.length && !proposal.request.combinedProposal) return {status:'applied',state};
  let next=projectFlexibleWeek(state,proposal,{adaptationChoice});
  if (proposal.request.combinedProposal) {
    try { next=applyCombinedProposal(next,{...proposal.request.combinedProposal,fingerprint:combineFingerprint(next)},()=>true); }
    catch(error) { return {status:'conflict',state,error:error.message}; }
  }
  next.flexibleWeek.generation=scheduleTransactionId();
  return { status: 'applied', state: next };
}
function projectFlexibleWeek(state,proposal,{adaptationChoice,resolveSkips=true}={}) {
  const next = structuredClone(state);
  next.flexibleWeek ||= { schemaVersion: 1, revision: 0, sessions: {} };
  if (proposal.request.mode === 'restore') {
    const removableIds=new Set(temporaryScheduleRestoreScope(state,proposal.today||isoDay()).removable.map(record=>record.id));
    for (const [id, record] of Object.entries(next.flexibleWeek.sessions)) if (removableIds.has(id)) {
      // A future quarantined reference has no materialized destination in this
      // review. Clear its orphaned edits; historical records were excluded above.
      if (!proposal.changes.some(change => change.logicalSessionId === id)) {
        if (next.todayAdaptation?.programDayId === record.workoutId && next.todayAdaptation.date === record.scheduledDate) next.todayAdaptation = null;
        if (next.workoutOccurrenceOverrides?.[record.scheduledDate]) delete next.workoutOccurrenceOverrides[record.scheduledDate][record.workoutId];
      }
      delete next.flexibleWeek.sessions[id];
    }
  } else {
    for (const change of proposal.changes) {
      if (change.toDate !== change.fromDate && next.workoutOccurrenceOverrides?.[change.fromDate])
        delete next.workoutOccurrenceOverrides[change.fromDate][change.workoutId];
    }
    for (const change of proposal.changes) {
    if (next.weekScheduleOverrides?.[weekKey(change.originalDate)]) delete next.weekScheduleOverrides[weekKey(change.originalDate)][change.workoutId];
    next.flexibleWeek.sessions[change.logicalSessionId] = { id: change.logicalSessionId, workoutId: change.workoutId, name: change.name, originalDate: change.originalDate, scheduledDate: change.toDate, skipped: change.skipped, blockId: state.program?.trainingBlock?.id || null, blockWeekNumber: change.blockWeekNumber, planFingerprint: flexiblePlanFingerprint(state), updatedAt: new Date().toISOString() };
    const occurrence = state.workoutOccurrenceOverrides?.[change.fromDate]?.[change.workoutId];
    if (occurrence && change.toDate !== change.fromDate) {
      (next.workoutOccurrenceOverrides[change.toDate] ||= {})[change.workoutId] = structuredClone(occurrence);
    }
    if (next.todayAdaptation?.programDayId === change.workoutId && next.todayAdaptation.date === change.fromDate) {
      if (adaptationChoice === 'keep' && !change.skipped) next.todayAdaptation.date = change.toDate;
      else next.todayAdaptation = null;
    }
  }
  }
  if (proposal.request.mode === 'restore') {
    for (const change of proposal.changes) {
      const occurrence = next.workoutOccurrenceOverrides?.[change.fromDate]?.[change.workoutId];
      if (occurrence && change.toDate !== change.fromDate) {
        (next.workoutOccurrenceOverrides[change.toDate] ||= {})[change.workoutId] = structuredClone(occurrence);
        delete next.workoutOccurrenceOverrides[change.fromDate][change.workoutId];
      }
      if (next.todayAdaptation?.programDayId === change.workoutId && next.todayAdaptation.date === change.fromDate) {
        if (adaptationChoice === 'keep') next.todayAdaptation.date = change.toDate;
        else next.todayAdaptation = null;
      }
    }
  }
  next.flexibleWeek.revision += 1;
  if(resolveSkips) resolveTrainingBlockSkips(next, records(next).filter(record => record.planFingerprint === flexiblePlanFingerprint(next)));
  return next;
}
