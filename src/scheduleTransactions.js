import {isoDay,uid} from './domain.js';

const fields=['program','flexibleWeek','weekScheduleOverrides','workoutOccurrenceOverrides','todayAdaptation'];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const encode=value=>JSON.stringify(canonical(value));
const guard=state=>encode([...fields.map(key=>state[key]),state.activeWorkout,state.activeOptionalSession,state.workouts]);
export const STALE_SCHEDULE_UNDO='The schedule or workouts changed. Open Temporary schedule to review the current changes.';
export const scheduleTransactionId=()=>uid('schedule');

// One bounded inverse for the committed domain transaction, not a UI snapshot
// or a chain of inverse Move/Skip actions. History and active sessions are guards
// only: they are never restored from the inverse. Unrelated preferences survive.
export function scheduleRevisionUndo(before,after) {
  const changed=fields.filter(key=>encode(before[key])!==encode(after[key]));
  return {today:isoDay(),generation:after.flexibleWeek?.generation,guard:guard(after),
    before:structuredClone(Object.fromEntries(changed.map(key=>[key,before[key]])))};
}
export function canUndoScheduleRevision(state,inverse) {
  return Boolean(inverse && inverse.today===isoDay() && inverse.generation===state.flexibleWeek?.generation && inverse.guard===guard(state));
}
export function undoScheduleRevision(state,inverse) {
  if(!canUndoScheduleRevision(state,inverse))throw Error(STALE_SCHEDULE_UNDO);
  const next={...state,...structuredClone(inverse.before)};
  // Restoring revision contents is a new domain transaction. Never rewind the
  // monotonic revision or reuse a Hide receipt / another device's generation.
  next.flexibleWeek={...(next.flexibleWeek||{schemaVersion:1,sessions:{}}),
    revision:(state.flexibleWeek?.revision||0)+1,generation:scheduleTransactionId()};
  return next;
}
