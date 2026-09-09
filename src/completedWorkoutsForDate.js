import { workoutPlanDate } from './domain.js';

// A read-only view: never reorder history or treat an extra session as plan completion.
export function completedWorkoutsForDate(workouts, date) {
  const timestamp = workout => new Date(workout.completedAt).getTime() || 0;
  return workouts.filter(workout => workout.completedAt && workoutPlanDate(workout) === date)
    .sort((a, b) => timestamp(b) - timestamp(a) || String(a.id).localeCompare(String(b.id)));
}
