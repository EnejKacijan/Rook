import {NavigationChevron} from './NavigationChevron.jsx';
import React, { useMemo, useState } from 'react';
import { exerciseMeasure, displayWeight, isoDay } from './domain.js';
import { startFreestyleWorkout, freestylePreviousSets, freestyleEffortLimit, previousValuesSetEligible, previousWorkingSetValues } from './freestyleWorkout.js';
import {PreviousValuesHelper} from './PreviousValuesHelper.jsx';
import './freestyleWorkout.css';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { importedSessionTimeLabel } from './historicalSetSemantics.js';
import { ExerciseNavigationButton } from './ExerciseNavigationButton.jsx';

export function FreestyleEntry({ state, update, setPage, setDetail, date, historyOnly = false, hideHistory = false, representedWorkoutId = null, tertiary = false, primary = false, noPlan = false }) {
  const [error, setError] = useState('');
  const today = date === isoDay();
  const records = hideHistory ? [] : completedWorkoutsForDate(state.workouts, date).filter(workout => workout.id !== representedWorkoutId);
  const available = !historyOnly && today && !state.activeWorkout && !state.activeOptionalSession;
  if (!available && !records.length) return null;
  return <div className="freestyle-entry">
    {available && <>
      <button className={tertiary ? 'text-button rest-freestyle-action' : primary ? 'button primary' : 'button secondary'} onClick={() => {
        try { startFreestyleWorkout(state); update(current => {
          if (current.activeWorkout || current.activeOptionalSession) return current;
          try { return startFreestyleWorkout(current); } catch { return current; }
        }); setPage('workout'); }
        catch (e) { setError(e.message); }
      }}>{tertiary && <span aria-hidden="true">+ </span>}Start freestyle workout</button>
      {!tertiary && !noPlan && <small>Choose exercises as you go. Your plan won’t change.</small>}
      {error && <p role="alert">{error}</p>}
    </>}
    {records.length > 0 && <section className="today-completed-workouts" aria-label="Completed workouts">
      {records.length > 1 && <div className="eyebrow">Completed workouts · {records.length}</div>}
      {records.map(w => <ExerciseNavigationButton className="list-row" key={w.id} data-workout-id={w.id} onClick={() => setDetail({ completedWorkout: w.id })}><span>{w.name || 'Workout'}<small>{w.historicalImport?.version===2?`Imported · ${importedSessionTimeLabel(w)}`:<>{w.savedWorkoutTemplateId ? 'Saved workout' : w.source === 'freestyle' ? 'Freestyle' : 'Planned'} · Finished {new Date(w.completedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</>}</small></span><NavigationChevron/></ExerciseNavigationButton>)}
    </section>}
  </div>;
}

export {FreestyleExercisePicker} from './FreestyleQueuePicker.jsx';

export function FreestyleActions({ setDetail, hideAdd = false }) {
  if (hideAdd) return null;
  return <div className="freestyle-actions"><button className="button secondary" onClick={() => setDetail({ freestylePicker: true })}>+ ADD EXERCISE</button></div>;
}
export function FreestylePrevious({ state, exercise, update, setDetail, screenRef }) {
  const limit = useMemo(() => freestyleEffortLimit(state, exercise.exerciseId), [state.profile, exercise.exerciseId]);
  const previous = freestylePreviousSets(state, exercise);
  const index = exercise.sets.findIndex(s => !s.completed);
  const set = exercise.sets[index];
  const prior = previous[index];
  const values = previousWorkingSetValues(exercise,prior);
  const canCopy = previousValuesSetEligible(set) && Object.keys(values).length > 0;
  const label = s => [s.weight != null ? `${displayWeight(s.weight, state.profile.units)} ${state.profile.units}` : null,
    s.sides ? `${s.sides.left?.reps ?? '—'} / ${s.sides.right?.reps ?? '—'} per side` : s.reps != null ? `${s.reps} ${exerciseMeasure(exercise) === 'seconds' ? 'sec' : 'reps'}` : null].filter(Boolean).join(' × ');
  return <div className="freestyle-previous">
    {limit != null && <p className="training-limit-note">Your training limit: keep at least {limit} RIR.</p>}
    <div className={canCopy ? 'freestyle-history-aid' : ''}>
    <button className="text-button" onClick={() => setDetail({ exercise })}>View exercise history</button>
    {canCopy && <PreviousValuesHelper key={`${state.profile.id}:${state.activeWorkout.id}:${exercise.id}:${exercise.exerciseId}:${set.id}`} state={state} update={update} exercise={exercise} set={set} prior={prior} index={index} label={label(values)} screenRef={screenRef}/>}
    </div>
  </div>;
}
