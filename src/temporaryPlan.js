import { sha256 } from '@noble/hashes/sha2.js';
import { buildProgram, hydrateStoredState, serializeState, isoDay, weekKey, validateProgram, exerciseCatalog, isExerciseAllowed } from './domain.js';
import { addCalendarDays, effectiveWeekSchedule, flexiblePlanFingerprint, flexibleSessionStatus, temporaryScheduleReview } from './flexibleWeek.js';
import { equipmentProfile, normalizeGymEquipment } from './gymProfiles.js';
import { prescribeTrainingBlockWorkout } from './trainingBlocks.js';
import { planStructure } from './planHistory.js';
import { isCombinedAdjustment } from './combinedWorkoutLifecycle.js';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
const digest = value => Array.from(sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))), n => n.toString(16).padStart(2, '0')).join('');
export const temporaryPlanSignature = state => digest({ plan: planStructure(state.program), version: state.program?.version,
  safety: { avoid: state.profile?.avoid, analysis: state.profile?.trainingSafetyAnalysis, limits: state.profile?.trainingSafetySupplementalLimits },
  rotationStartDate: state.program?.rotationStartDate, block: state.program?.trainingBlock && { id: state.program.trainingBlock.id, startDate: state.program.trainingBlock.startDate } });
const reviewDigest = state => digest([state.profile, state.program, state.flexibleWeek, state.weekScheduleOverrides,
  state.workoutOccurrenceOverrides, state.todayAdaptation, state.activeWorkout, state.activeOptionalSession, state.workouts]);
const dateValid = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && isoDay(new Date(`${date}T12:00:00`)) === date;
const failure = error => ({ status: 'conflict', error });
const pendingAdjustment = (state, today) => state.todayAdaptation &&
  (isCombinedAdjustment(state.todayAdaptation) || state.todayAdaptation.mode === 'repeat' || !dateValid(state.todayAdaptation.date) || state.todayAdaptation.date >= today);
export const nextTemporaryPlanStart = (today = isoDay()) => weekKey(today) === today ? today : addCalendarDays(weekKey(today), 7);
export function temporaryPlanStatus(state, today = isoDay()) {
  const period = state.program?.temporaryPlanAdjustment;
  if (!period) return null;
  return { ...period, status: period.endedAt || today > period.endDate ? 'ended' : today < period.startDate ? 'upcoming' : 'active',
    planChanged: period.planSignature !== temporaryPlanSignature(state) };
}
export const temporaryPlanScheduleUntouched = state => Boolean(state.program?.temporaryPlanAdjustment?.changes.every(change =>
  digest([state.flexibleWeek?.sessions?.[change.id], state.workoutOccurrenceOverrides?.[change.toDate]?.[change.workoutId] || null]) === change.afterDigest));
// Uses the existing dated override, never changes the recurring program.
export function temporaryOccurrenceWorkout(state, occurrence, template, date) {
  const period = state.program?.temporaryPlanAdjustment, value = occurrence?.temporaryWorkout;
  if (!value || !period || period.endedAt || value.adjustmentId !== period.id || date < period.startDate || date > period.endDate ||
      period.planSignature !== temporaryPlanSignature(state)) return template;
  return { ...prescribeTrainingBlockWorkout(state, { ...structuredClone(value.workout), id: template.id }),
    logicalSessionId: template.logicalSessionId, originalScheduledDate: template.originalScheduledDate,
    flexibleWeekMoved: template.flexibleWeekMoved, temporaryPlanAdjustment: { id: period.id, startDate: period.startDate, endDate: period.endDate,
      equipment: [...period.equipment], originalName: value.originalName } };
}
export function proposeTemporaryPlan(state, request, today = isoDay()) {
  if (!state.program || state.program.trainingBlock?.completed) return failure('An active training plan is needed.');
  if (state.activeWorkout || state.activeOptionalSession || pendingAdjustment(state, today)) return failure('Finish or cancel your active or adjusted session first.');
  if (temporaryScheduleReview(state).unresolved.length) return failure('Review the existing temporary schedule first.');
  const existing = temporaryPlanStatus(state, today);
  if (existing && existing.status !== 'ended') return failure('End the current temporary plan before creating another.');
  const { startDate, weeks } = request;
  const days = weekdays.filter(day => request.days?.includes(day)), equipment = normalizeGymEquipment(request.equipment);
  if (!dateValid(startDate) || startDate < today || weekKey(startDate) !== startDate || startDate > addCalendarDays(today, 28))
    return failure('Choose a Monday within the next four weeks.');
  if (![2, 3, 4].includes(weeks)) return failure('Choose two, three or four weeks.');
  if (days.length < 2 || days.length > state.program.days.length) return failure(`Choose 2–${state.program.days.length} training days.`);
  if (!equipment.length) return failure('Choose the equipment you will have.');
  const endDate = addCalendarDays(startDate, weeks * 7 - 1);
  const block = state.program.trainingBlock;
  if (block?.startDate && block.totalWeeks && endDate > addCalendarDays(block.startDate.slice(0, 10), block.totalWeeks * 7 - 1))
    return failure('Choose a period that fits within your current training block.');
  const profile = { ...equipmentProfile(state.profile, equipment), availableDays: days, daysPerWeek: days.length,
    trainingSplitChoice: 'auto', trainingPreferences: '', specificSplit: null };
  let candidate;
  try { candidate = buildProgram(profile); } catch { return failure('A valid plan could not be prepared with these settings. Try different days or equipment.'); }
  if (!validateProgram(candidate, profile, { requireProgramQuality: true }).valid) return failure('These settings need review before a temporary plan can be used.');
  const changes = [];
  for (let index = 0; index < weeks; index++) {
    const monday = addCalendarDays(startDate, index * 7), sunday = addCalendarDays(monday, 6);
    const sources = effectiveWeekSchedule(state, monday, { includeCombined: true });
    if (sources.length !== state.program.days.length || new Set(sources.map(item => item.workoutId)).size !== sources.length ||
        sources.some(item => item.originalDate < monday || item.originalDate > sunday || item.scheduledDate < monday || item.scheduledDate > sunday ||
          !['planned', 'optional'].includes(flexibleSessionStatus(state, item, today))))
      return failure('Existing skips, completed sessions or moves cross this period. Review those dates before adapting it.');
    const rotated = [...sources.slice(index % sources.length), ...sources.slice(0, index % sources.length)];
    for (const [position, source] of rotated.entries()) {
      const skipped = position >= days.length, toDate = skipped ? source.originalDate : addCalendarDays(monday, weekdays.indexOf(days[position]));
      const beforeOverride = state.workoutOccurrenceOverrides?.[source.scheduledDate]?.[source.workoutId] || null;
      if (beforeOverride && Object.keys(beforeOverride).some(key => key !== 'temporaryWorkout')) return failure('A workout in this period has individual edits. Review those edits before adapting it.');
      const targetOverride = state.workoutOccurrenceOverrides?.[toDate]?.[source.workoutId];
      if (toDate !== source.scheduledDate && targetOverride) return failure('A destination has existing workout edits. Choose another period.');
      const workout = skipped ? null : { ...structuredClone(candidate.days[position]), id: source.workoutId };
      changes.push({ id: source.logicalSessionId, workoutId: source.workoutId, name: source.workout.name, originalDate: source.originalDate,
        fromDate: source.scheduledDate, toDate, skipped, workout, beforeRecord: structuredClone(state.flexibleWeek?.sessions?.[source.logicalSessionId] || null),
        beforeOverride: structuredClone(beforeOverride), beforeWeekOverride: state.weekScheduleOverrides?.[monday]?.[source.workoutId] || null });
    }
  }
  return { status: 'ready', reviewDigest: reviewDigest(state), changesDigest: digest(changes), reviewedOn: today, request: { startDate, endDate, weeks, days, equipment }, changes,
    planSignature: temporaryPlanSignature(state) };
}
export function applyTemporaryPlan(state, proposal, persist, today = isoDay()) {
  if (proposal?.status !== 'ready' || proposal.reviewedOn !== today || proposal.reviewDigest !== reviewDigest(state) || proposal.changesDigest !== digest(proposal.changes))
    return failure('Your training context changed. Prepare and review the temporary plan again.');
  const checked = proposeTemporaryPlan(state, proposal.request, today);
  if (checked.status !== 'ready') return checked;
  // Newly generated plans have not necessarily crossed the hydration boundary.
  // Normalize before linking dated workouts so defaults added on reload cannot
  // invalidate their saved fingerprint. Only an exact old match can be upgraded.
  const next = hydrateStoredState(serializeState(state)), id = `temporary-plan-${globalThis.crypto.randomUUID()}`;
  next.flexibleWeek ||= { schemaVersion: 1, revision: 0, sessions: {} };
  const originalFingerprint = flexiblePlanFingerprint(state), fingerprint = flexiblePlanFingerprint(next);
  for (const record of Object.values(next.flexibleWeek.sessions)) if (record.planFingerprint === originalFingerprint) record.planFingerprint = fingerprint;
  const owned = [];
  for (const change of proposal.changes) {
    const record = { id: change.id, workoutId: change.workoutId, name: change.workout?.name || change.name, originalDate: change.originalDate,
      scheduledDate: change.toDate, skipped: change.skipped, blockId: state.program.trainingBlock?.id || null,
      planFingerprint: fingerprint, updatedAt: new Date().toISOString(), temporaryAdjustmentId: id };
    delete next.weekScheduleOverrides?.[weekKey(change.originalDate)]?.[change.workoutId];
    if (next.workoutOccurrenceOverrides?.[change.fromDate]) delete next.workoutOccurrenceOverrides[change.fromDate][change.workoutId];
    const override = change.workout ? { temporaryWorkout: { adjustmentId: id, equipment: [...proposal.request.equipment], originalName: change.name, workout: structuredClone(change.workout) } } : null;
    if (override) (next.workoutOccurrenceOverrides[change.toDate] ||= {})[change.workoutId] = override;
    next.flexibleWeek.sessions[change.id] = record;
    const beforeRecord = change.beforeRecord && { ...change.beforeRecord,
      planFingerprint: change.beforeRecord.planFingerprint === originalFingerprint ? fingerprint : change.beforeRecord.planFingerprint };
    owned.push({ ...change, beforeRecord, workout: undefined, afterDigest: digest([record, override]) });
  }
  next.flexibleWeek.revision++;
  next.program.temporaryPlanAdjustment = { schemaVersion: 1, id, ...proposal.request, planSignature: proposal.planSignature, changes: owned,
    createdAt: new Date().toISOString() };
  if (!persist(next)) return failure('The temporary plan could not be saved. Your current schedule is unchanged.');
  return { status: 'applied', state: next };
}
export function endTemporaryPlan(state, persist, today = isoDay()) {
  const period = temporaryPlanStatus(state, today);
  if (!period || period.endedAt) return failure('There is no temporary plan to end.');
  if (period.planChanged || state.activeWorkout || state.activeOptionalSession || pendingAdjustment(state, today)) return failure('Finish your active session or review the changed plan first.');
  const upcoming = period.changes.filter(change => change.toDate >= today && !['active', 'completed', 'combined'].includes(flexibleSessionStatus(state, { ...change, id: change.id, scheduledDate: change.toDate }, today)));
  if (upcoming.some(change => digest([state.flexibleWeek?.sessions?.[change.id], state.workoutOccurrenceOverrides?.[change.toDate]?.[change.workoutId] || null]) !== change.afterDigest))
    return failure('A temporary workout was changed after applying this plan. Review its schedule before ending early.');
  const next = structuredClone(state);
  for (const change of upcoming) {
    if (change.beforeRecord) next.flexibleWeek.sessions[change.id] = structuredClone(change.beforeRecord);
    else delete next.flexibleWeek.sessions[change.id];
    if (next.workoutOccurrenceOverrides[change.toDate]) delete next.workoutOccurrenceOverrides[change.toDate][change.workoutId];
    if (change.beforeOverride) (next.workoutOccurrenceOverrides[change.fromDate] ||= {})[change.workoutId] = structuredClone(change.beforeOverride);
    if (change.beforeWeekOverride) (next.weekScheduleOverrides[weekKey(change.originalDate)] ||= {})[change.workoutId] = change.beforeWeekOverride;
  }
  next.flexibleWeek.revision++;
  next.program.temporaryPlanAdjustment.endedAt = new Date().toISOString();
  if (!persist(next)) return failure('Your current schedule was kept because the change could not be saved.');
  return { status: 'applied', state: next };
}
// The block advances by resolved sessions, not by guessed future calendar phases.
// Resolve this week's reviewed rest slots with the block context of the workout
// actually performed. Future rest slots never advance a block in advance.
export function temporaryPlanBlockSkipRecords(state, session) {
  const records = Object.values(state.flexibleWeek?.sessions || {}), period = state.program?.temporaryPlanAdjustment;
  if (!session?.temporaryPlanAdjustment || period?.id !== session.temporaryPlanAdjustment.id || !session.trainingBlock) return records;
  const calendarWeek = weekKey(session.originalScheduledDate || session.workoutDateKey), fingerprint = flexiblePlanFingerprint(state);
  return records.map(record => record.skipped && record.temporaryAdjustmentId === period.id && record.planFingerprint === fingerprint &&
    weekKey(record.originalDate) === calendarWeek && record.blockId === session.trainingBlock.blockId
      ? { ...record, blockWeekNumber: session.trainingBlock.blockWeekNumber } : record);
}
export function assertTemporaryPlanState(state) {
  const period = state.program?.temporaryPlanAdjustment;
  if (!period) return;
  if (period.schemaVersion !== 1 || typeof period.id !== 'string' || !period.id || !dateValid(period.startDate) || !dateValid(period.endDate) ||
      ![2, 3, 4].includes(period.weeks) || !Array.isArray(period.changes) || !Array.isArray(period.equipment) || !period.equipment.length ||
      !Array.isArray(period.days) || period.days.length < 2 || period.days.length > 6 || new Set(period.days).size !== period.days.length || period.days.some(day => !weekdays.includes(day)) ||
      !/^[a-f0-9]{64}$/.test(period.planSignature || '') || weekKey(period.startDate) !== period.startDate ||
      period.endDate !== addCalendarDays(period.startDate, period.weeks * 7 - 1) ||
      period.changes.some(change => !change || typeof change.workoutId !== 'string' || change.id !== `${change.workoutId}:${change.originalDate}` ||
        !dateValid(change.originalDate) || !dateValid(change.fromDate) || !dateValid(change.toDate) || typeof change.skipped !== 'boolean' || !/^[a-f0-9]{64}$/.test(change.afterDigest || '')))
    throw new Error('Saved temporary plan could not be safely loaded.');
  for (const overrides of Object.values(state.workoutOccurrenceOverrides || {})) for (const occurrence of Object.values(overrides)) {
    const value = occurrence?.temporaryWorkout;
    const equipment = value?.equipment || (value?.adjustmentId === period.id ? period.equipment : null);
    if (value && (!value.adjustmentId || !Array.isArray(equipment) || !equipment.length || !value.workout?.exercises?.length || value.workout.exercises.some(exercise =>
        !Array.isArray(exercise.sets) || !exercise.sets.length || !exerciseCatalog[exercise.exerciseId] ||
        !isExerciseAllowed(exerciseCatalog[exercise.exerciseId], equipmentProfile({ ...state.profile, avoid: '', ignoreTrainingSafety: true }, equipment)))))
      throw new Error('Saved temporary workout could not be safely loaded.');
  }
}
