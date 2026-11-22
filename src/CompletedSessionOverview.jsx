import React, { forwardRef, useLayoutEffect, useState } from 'react';
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

// Counts up once on the live finish entry. Only runs when the browser says
// motion is welcome; otherwise (and for screen readers after ~1s) the final
// number is what renders.
export function CountUp({ value, animate, delay = 320, duration = 720 }) {
  const [shown, setShown] = useState(value);
  useLayoutEffect(() => {
    const motionOk = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: no-preference)')?.matches;
    if (!animate || !motionOk || !(value > 0) || typeof requestAnimationFrame !== 'function') { setShown(value); return undefined; }
    let frame, start;
    setShown(0);
    const tick = time => {
      const now = time ?? performance.now();
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start - delay) / duration));
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); setShown(value); };
  }, [value, animate, delay, duration]);
  return shown;
}

export const CompletedSessionOverview = forwardRef(function CompletedSessionOverview(
  { workout, exerciseProgress, recognitionId, live = false }, headingRef,
) {
  const metrics = completedSessionMetrics(workout);
  return <section className="completed-session-overview" aria-label={exerciseProgress ? "Logged workout" : "Completed workout"}>
    <div className="completion-hero">
      <div className="completion-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path className="completion-badge-check" pathLength="1" d="M5.5 12.5l4 4 9-9.5" /></svg>
      </div>
      {exerciseProgress
        ? <span className="completion-eyebrow completion-logged-status">Workout logged · {exerciseProgress}</span>
        : <span className="completion-eyebrow">WORKOUT COMPLETE</span>}
      <h1 ref={headingRef} tabIndex={-1} aria-describedby={recognitionId}>
        {workout.name || 'Workout'}
      </h1>
    </div>
    <dl className="completion-summary" aria-label={exerciseProgress ? "Logged session summary" : "Completed session summary"}>
      {!exerciseProgress && <div><dt>Exercises</dt><dd><CountUp value={metrics.exercises} animate={live} /></dd></div>}
      <div><dt>{exerciseProgress ? "Sets logged" : "Sets"}</dt><dd><CountUp value={metrics.sets} animate={live} delay={380} /></dd></div>
      <div><dt>Elapsed</dt><dd>{metrics.elapsed}</dd></div>
    </dl>
  </section>;
});
