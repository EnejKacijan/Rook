// Presentation only. Canonical occurrence and workout classifications stay in
// their existing owners; a metadata line gets one visible status.
export function workoutVisibleStatus({ workout, summary, status, destination } = {}) {
  if (workout) {
    return workout.endedEarly || workout.status === 'ended-early' ||
      (summary && summary.completed < summary.total) || summary?.completed === 0
      ? 'Ended early' : 'Completed';
  }
  if (status === 'moved' && destination) return `Moved to ${destination}`;
  return { missed: 'Missed', skipped: 'Skipped', active: 'Workout in progress',
    reserved: 'Included in a combined workout', combined: 'Completed in a combined workout' }[status] || '';
}
