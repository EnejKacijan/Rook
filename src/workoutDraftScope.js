// A value resolver names set IDs and optional field paths, never button copy or
// layout. Omitting fields means that the action owns the complete set draft.
export function workoutDraftScope(action) {
  if (!action || action.disabled) return null;
  try {
    const scope = JSON.parse(action.getAttribute('data-workout-replaces'));
    return Array.isArray(scope?.sets) && scope.sets.length ? scope : null;
  } catch { return null; }
}

export function ownsWorkoutDraft(input, scope) {
  if (!scope || !input?.matches('[data-workout-draft]')) return false;
  return scope.sets.includes(input.closest('[data-set-id]')?.dataset.setId) &&
    (!scope.fields || scope.fields.includes(input.closest('[data-workout-field]')?.dataset.workoutField));
}
