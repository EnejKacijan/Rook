import React from 'react';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { importedSessionTimeLabel } from './historicalSetSemantics.js';
import { isConditioning, optionalActivitySummary } from './optionalActivity.js';
import { completedSessionMetrics } from './CompletedSessionOverview.jsx';
import { ExerciseNavigationButton } from './ExerciseNavigationButton.jsx';
import { NavigationChevron } from './NavigationChevron.jsx';
import { pluralize } from './domain.js';
import './todayDoneExtras.css';

const optionalOnDay = (state, date) => (state.optionalSessions || []).filter(item => item.date === date && item.status === 'completed'
  && (['Cardio', 'Mobility'].includes(item.kind) || isConditioning(item)));
const time = value => new Date(value).getTime() || 0;
const workoutSource = w => w.planWorkoutOrigin ? 'Extra from plan' : w.savedWorkoutTemplateId ? 'Saved workout' : w.source === 'freestyle' ? 'Freestyle' : w.source === 'repeat' ? 'Repeat' : 'Planned';
const workoutMeta = w => {
  if (w.historicalImport?.version === 2) return `Imported · ${importedSessionTimeLabel(w)}`;
  const { sets, elapsed } = completedSessionMetrics(w);
  return [workoutSource(w), elapsed !== 'Not recorded' && elapsed, pluralize(sets, 'set')].filter(Boolean).join(' · ');
};
const activityName = a => `${a.activity || a.kind}${isConditioning(a) && a.format === 'intervals' ? ' intervals' : ''}`;
const activityMeta = activity => `${activity.kind} · ${optionalActivitySummary(activity)}`;

// Everything else finished on a day whose main workout is already done: extra
// workouts and optional activities share one list, newest first, so the day
// reads as one record instead of two differently styled lists.
export function TodayDoneExtras({ state, date, viewingToday, representedWorkoutId, setDetail }) {
  const items = [
    ...completedWorkoutsForDate(state.workouts, date).filter(w => w.id !== representedWorkoutId)
      .map(w => ({ key: `w:${w.id}`, at: time(w.completedAt), workout: w })),
    ...optionalOnDay(state, date).map(a => ({ key: `a:${a.id}`, at: time(a.completedAt || a.endedAt), activity: a })),
  ].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  if (!items.length) return null;
  return <section className="today-done-extras" aria-labelledby="today-done-extras-title">
    <div className="eyebrow" id="today-done-extras-title">{viewingToday ? 'Also today' : 'Also that day'}{items.length > 1 ? ` · ${items.length}` : ''}</div>
    <div className="today-done-extras-list">
      {items.map(item => item.workout
        ? <ExerciseNavigationButton key={item.key} className="today-done-extra" data-workout-id={item.workout.id} onClick={() => setDetail({ completedWorkout: item.workout.id })}>
            <span className="today-done-extra-mark" aria-hidden="true" />
            <span className="today-done-extra-text"><strong>{item.workout.name || 'Workout'}</strong><small>{workoutMeta(item.workout)}</small></span>
            <NavigationChevron />
          </ExerciseNavigationButton>
        : <ExerciseNavigationButton key={item.key} className="today-done-extra" data-activity-id={item.activity.id} onClick={() => setDetail({ optionalActivity: item.activity.id })}>
            <span className="today-done-extra-mark" aria-hidden="true" />
            <span className="today-done-extra-text"><strong>{activityName(item.activity)}</strong><small>{activityMeta(item.activity)}</small></span>
            <NavigationChevron />
          </ExerciseNavigationButton>)}
    </div>
  </section>;
}
