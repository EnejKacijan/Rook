import { isoDay, weekday, workoutPlanDate, workoutSetSummary } from './domain.js';
import { restartBaseline } from './workoutSessionStart.js';
import { isCombinedAdjustment } from './combinedWorkoutLifecycle.js';
import { isRepeatAdjustment } from './useWorkoutToday.js';

// Compare current content with its prepared baseline, not historical "touched"
// flags. Reverting a value/order or undoing an addition removes that difference.
const bookkeeping = new Set([
  'touched', 'started', 'startedAt', 'updatedAt', 'completedAt', 'skippedAt',
  'parked', 'parkedAt', 'partialProgress', 'lastActiveAt',
  'completedSetCount', 'completedPlannedSetCount', 'performedSetCount',
  'weightEntryMode', 'repsEntryMode', 'rirEntryMode', 'sideRepsEntryMode',
  'weightSourceSetId', 'repsSourceSetId', 'weightProvenance', 'queueAdditionId',
]);
function content(value) {
  if (Array.isArray(value)) return value.map(content);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => !bookkeeping.has(key) && value[key] != null && value[key] !== false && value[key] !== '')
    .map(key => [key, content(value[key])]));
  return value;
}
export function hasMeaningfulSessionWork(active) {
  if (!active) return false;
  if (workoutSetSummary(active).completed || active.sessionNote?.trim() || active.sessionFeedback) return true;
  const baseline = restartBaseline(active);
  // A legacy session without a reliable baseline must not silently lose data.
  if (!baseline) return Boolean(active.exercises?.length);
  return JSON.stringify(content({exercises: active.exercises, warmup: active.warmup || null})) !==
    JSON.stringify(content(baseline));
}

// Pure discard transaction. The caller must durably save before publishing or
// navigating. Completion/progression functions must never participate here.
export function cancelActiveWorkout(state, sessionId, today = isoDay()) {
  const active = state.activeWorkout;
  if (!sessionId || active?.id !== sessionId) return state;
  const selectedDate = active.source === 'freestyle' || active.source === 'repeat'
    ? today : workoutPlanDate(active) || today;
  const next = {...state, activeWorkout: null, selectedDate, selectedDay: weekday(`${selectedDate}T12:00:00`)};
  // Release only reservations owned by this execution, never an unrelated
  // adjustment, schedule override, completed record or remembered preference.
  if ((isCombinedAdjustment(active.adjustment) || isRepeatAdjustment(active.adjustment)) &&
      next.todayAdaptation?.id === active.adjustment.id) next.todayAdaptation = null;
  // Older resumed optional-strength sessions can carry an explicit active flag.
  if (active.optionalSessionId && state.optionalSessions?.some(item => item.id === active.optionalSessionId && item.status === 'active'))
    next.optionalSessions = state.optionalSessions.map(item => item.id === active.optionalSessionId && item.status === 'active'
      ? {...item, status: 'planned', completedAt: null} : item);
  return next;
}
