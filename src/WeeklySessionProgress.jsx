import {useLayoutEffect, useRef, useState} from 'react';
import {workoutPerformedDate} from './domain.js';
import {effectiveWeekSchedule, workoutMatchesOccurrence, completedWorkoutForOccurrence} from './flexibleWeek.js';
import {isCombinedAdjustment} from './combinedWorkoutLifecycle.js';
import './weeklySessionProgress.css';

// This is completion-count progress, not a calendar. The separate active
// status applies only when the workout belongs to this planned training week.
export function weeklySessionInProgress(state, start, end) {
  const active = state.activeWorkout;
  if (!state.program || !active || active.completedAt || active.optionalSessionId ||
      ['freestyle', 'repeat'].includes(active.source)) return false;
  const performed = workoutPerformedDate(active);
  if (!performed || performed < start || performed > end) return false;
  const schedule = effectiveWeekSchedule(state, start, {includeCombined: true});
  return schedule.some(item => !completedWorkoutForOccurrence(state, item) && (
    workoutMatchesOccurrence(active, item) || isCombinedAdjustment(active.adjustment) &&
    active.adjustment.sourceSessions?.some(source => source.programId === state.program.id &&
      source.logicalSessionId === item.logicalSessionId)
  ));
}

// Ephemeral display memory: existing history stays still on first visit/reload.
// Returning from another tab animates only newly completed sessions once.
const seen = new Map();
export function WeeklySessionProgress({scope, completed, planned, completionIds, active = false}) {
  const total = Math.max(0, Math.floor(Number(planned) || 0));
  const count = Math.min(total, Math.max(0, Math.floor(Number(completed) || 0)));
  const signature = JSON.stringify([count, total, completionIds]);
  const prior = useRef({scope, snapshot: seen.get(scope)});
  const [animated, setAnimated] = useState([]);
  useLayoutEffect(() => {
    const before = prior.current.scope === scope ? prior.current.snapshot : seen.get(scope);
    const snapshot = {count, signature, completionIds};
    prior.current = {scope, snapshot};
    seen.set(scope, snapshot);
    if (seen.size > 32) seen.delete(seen.keys().next().value);
    if (before?.signature === signature) return;
    const added = before && count > before.count && completionIds.some(id => !before.completionIds.includes(id));
    setAnimated(added ? Array.from({length: count - before.count}, (_, i) => before.count + i) : []);
  }, [scope, signature]);
  if (!total) return null;
  const inProgress = active && count < total;
  return <div className="weekly-session-meter">
    {inProgress && <small className="weekly-session-active">1 workout in progress</small>}
    <div className="consistency-bars weekly-session-progress" role="progressbar"
      aria-label="Weekly planned sessions" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}
      aria-valuetext={`${count} of ${total} completed${inProgress ? '. One workout in progress.' : ''}`}>
      {Array.from({length: total}, (_, index) => <span key={index} aria-hidden="true"
        data-state={index < count ? 'complete' : 'pending'}
        className={animated.includes(index) ? 'is-newly-completed' : undefined}
        style={animated.includes(index) ? {'--weekly-fill-delay': `${Math.min(index - animated[0], 3) * 70}ms`} : undefined}/>) }
    </div>
  </div>;
}

export function weeklyCompletionIds(workouts, start, end) {
  return workouts.filter(workout => workout.completedAt && !workout.historicalImport && workout.source !== 'freestyle' &&
    workoutPerformedDate(workout) >= start && workoutPerformedDate(workout) <= end).map(workout => workout.id).sort();
}
