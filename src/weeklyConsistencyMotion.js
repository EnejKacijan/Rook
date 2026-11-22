import { weekKey } from './domain.js';
import { effectiveWeekSchedule } from './flexibleWeek.js';

// One newly completed planned session fills its Weekly Review bar once, the
// next time the card is visible. The pending fill lives only in memory, so a
// reload, revisit or any change to the week's truth shows the real state.
export const WEEKLY_BAR_FILL_MS = 250;
export const WEEKLY_MARK_EMPHASIS_MS = 360;

let pending = null;

export function weeklyConsistencyKey(state, consistency, date = new Date()) {
  if (!state?.program || !(consistency?.planned > 0)) return null;
  let schedule = '';
  try {
    schedule = effectiveWeekSchedule(state, date, { includeCombined: true })
      .map(item => `${item.scheduledDate}:${item.logicalSessionId}`)
      .join(',');
  } catch { return null; }
  return [state.profile?.id || '', weekKey(date), consistency.planned, consistency.completed, schedule].join('|');
}

// Called after a planned session is saved. `before`/`after` are the counters
// computed with the same rules the Weekly Review card uses.
export function noteWeeklyConsistencyChange({ before, after, beforeKey, afterKey }) {
  if (!afterKey || !(after?.planned > 0) || !(after.completed > (before?.completed ?? 0))) {
    pending = null;
    return;
  }
  // Two sessions finished before Progress was opened fill in order.
  const from = pending && pending.key === beforeKey ? pending.from : before.completed;
  pending = { key: afterKey, from: Math.max(0, from), to: after.completed, planned: after.planned };
}

export function peekWeeklyConsistencyMotion(key) {
  if (!pending) return null;
  if (!key || pending.key !== key) { pending = null; return null; }
  return pending;
}

export function consumeWeeklyConsistencyMotion(motion) {
  if (pending === motion) pending = null;
}

export function clearWeeklyConsistencyMotion() {
  pending = null;
}

export function prefersReducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}
