import React, { forwardRef } from 'react';
import { workoutSetSummary } from './domain.js';
import './completedSessionOverview.css';

// Presentation reads the saved record, never the current plan or estimates.
export function completedSessionMetrics(workout) {
  const exercises = (workout.exercises || []).filter(exercise =>
    exercise.sets?.length && exercise.sets.every(set => set.completed),
  ).length;
  const seconds = workout.durationSeconds;
  const elapsed = seconds != null && Number.isFinite(Number(seconds)) && Number(seconds) >= 0
    ? `${seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0} min`
    : 'Not recorded';
  return { exercises, sets: workoutSetSummary(workout).completed, elapsed };
}

export const CompletedSessionOverview = forwardRef(function CompletedSessionOverview(
  { workout, recognitionId }, headingRef,
) {
  const metrics = completedSessionMetrics(workout);
  return <section className="completed-session-overview" aria-label="Completed workout">
    <div className="completion-hero">
      <div className="completion-badge" aria-hidden="true"><span>✓</span></div>
      <span className="completion-eyebrow">WORKOUT COMPLETE</span>
      <h1 ref={headingRef} tabIndex={-1} aria-describedby={recognitionId}>
        {workout.name || 'Workout'}
      </h1>
    </div>
    <dl className="completion-summary" aria-label="Completed session summary">
      <div><dt>Exercises</dt><dd>{metrics.exercises}</dd></div>
      <div><dt>Sets</dt><dd>{metrics.sets}</dd></div>
      <div><dt>Elapsed</dt><dd>{metrics.elapsed}</dd></div>
    </dl>
  </section>;
});
