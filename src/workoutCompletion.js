import {completeWorkout, workoutPerformedDate} from './domain.js';

const copy = value => structuredClone(value);
const memoryFields = ['sessionNote', 'sessionFeedback'];
const presentationFields = new Set(['selectedDate', 'selectedDay', 'ai', 'conversations', 'activeCoachConversationId', 'dismissedMissedReminderKey']);
const fingerprint = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

function completionGuard(state, workoutId) {
  // A completion-screen note/rating can travel back with the session.
  // Photos keep a separate persisted completion-ID owner, so changing a photo
  // invalidates reversal instead of orphaning or relinking its blob here.
  // Any other history, plan, schedule or training-state change makes this
  // immediate reversal stale. UI selection and Coach availability do not.
  const guarded = Object.fromEntries(Object.entries(state).filter(([key]) => !presentationFields.has(key)));
  guarded.workouts = state.workouts.map(workout => workout.id !== workoutId ? workout :
    Object.fromEntries(Object.entries(workout).filter(([key]) => !memoryFields.includes(key))));
  return fingerprint(guarded);
}

// The capability lives only in the current completion context, never in saved
// state/history/backups. Capture before completeWorkout drops active-only data.
export function completeWorkoutReversibly(state) {
  const next = completeWorkout(copy(state));
  const inserted = next.workouts.filter(workout => !state.workouts.some(prior => prior.id === workout.id));
  if (!state.activeWorkout || next.activeWorkout || inserted.length !== 1)
    return {state: next, reversal: null};
  const workoutId = inserted[0].id;
  const undo = [...new Set([...Object.keys(state), ...Object.keys(next)])]
    .filter(key => !['activeWorkout', 'workouts'].includes(key) && fingerprint(state[key]) !== fingerprint(next[key]))
    .map(key => ({key, present: Object.hasOwn(state, key), value: copy(state[key])}));
  return {state: next, reversal: {
    workoutId, activeWorkout: copy(state.activeWorkout), undo,
    guard: completionGuard(next, workoutId),
  }};
}

export function canContinueWorkout(state, reversal) {
  return Boolean(reversal?.activeWorkout && !state.activeWorkout && !state.activeOptionalSession &&
    state.workouts.filter(workout => workout.id === reversal.workoutId).length === 1 &&
    completionGuard(state, reversal.workoutId) === reversal.guard);
}

export function continueWorkout(state, reversal, now = Date.now()) {
  if (!canContinueWorkout(state, reversal)) return state;
  const completed = state.workouts.find(workout => workout.id === reversal.workoutId);
  const activeWorkout = copy(reversal.activeWorkout);
  for (const key of memoryFields) {
    if (Object.hasOwn(completed, key)) activeWorkout[key] = copy(completed[key]);
    else delete activeWorkout[key];
  }
  // Absolute rest deadlines keep running while completion is open. Expired
  // rests are cleared rather than replaying a stale completion notification.
  if (activeWorkout.rest && !activeWorkout.rest.pending &&
      (!Number.isFinite(activeWorkout.rest.endsAt) || activeWorkout.rest.endsAt <= now)) activeWorkout.rest = null;
  const next = {...state, activeWorkout,
    workouts: state.workouts.filter(workout => workout.id !== reversal.workoutId),
    selectedDate: workoutPerformedDate(activeWorkout) || state.selectedDate,
    selectedDay: activeWorkout.templateId || state.selectedDay,
  };
  for (const {key, present, value} of reversal.undo) {
    if (present) next[key] = copy(value);
    else delete next[key];
  }
  return next;
}
