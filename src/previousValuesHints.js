// Presentation only. No loads, reps or workout records are stored here. A hint
// belongs to one occurrence of an exercise in one active session, not a catalog ID.
const KEY = 'rook.previous-values-hints.v1';
let fallback = {};
export const previousValuesHintId = (state, exercise) => JSON.stringify([
  state.profile.id, state.activeWorkout.id, exercise.id, exercise.exerciseId,
]);
export function previousValuesHint(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return fallback[id] || saved?.[id] || {};
  } catch { return fallback[id] || {}; }
}
export function updatePreviousValuesHint(id, patch) {
  let saved = fallback;
  try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) saved = {...value,...fallback}; } catch { /* UI memory still works when storage is unavailable. */ }
  fallback = Object.fromEntries(Object.entries({...saved, [id]: {...saved[id], ...patch}}).slice(-200));
  try { localStorage.setItem(KEY, JSON.stringify(fallback)); } catch { /* Never block logging for a presentation preference. */ }
  return fallback[id];
}
