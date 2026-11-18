import { workoutPersonalBests } from './performanceInsights.js';
import { loggingModeOf } from './advancedLogging.js';
import { workoutSetSummary, workoutPerformedDate } from './domain.js';

const milestones = new Set([10, 25, 50, 100, 250, 500, 1000]);

export function completionRecognition(session, history = [], { eligible = () => false } = {}) {
  const summary = workoutSetSummary(session);
  if (!session?.completedAt || session.historicalImport || !summary.completed) return null;
  const date = workoutPerformedDate(session);
  const completedAt = new Date(session.completedAt);
  const prior = [...new Map(history.filter(workout => workout.id !== session.id &&
    workout.completedAt && new Date(workout.completedAt) <= completedAt &&
    workoutPerformedDate(workout) <= date).map(workout => [workout.id, workout])).values()];

  // Keep the eligible lifts and logging modes used for completion records.
  const byExercise = workoutPersonalBests(session, prior, exercise =>
    eligible(exercise) && loggingModeOf(exercise) === 'normal');
  if (byExercise.size) return { type: 'pr', byExercise };

  if (session.endedEarly || session.status === 'ended-early' || summary.completed < summary.total) return null;
  const count = prior.filter(workout => workoutSetSummary(workout).completed > 0).length + 1;
  return milestones.has(count) ? { type: 'milestone', count, label: `${count} workouts logged` } : null;
}
