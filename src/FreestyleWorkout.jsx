import React, { useMemo, useState } from 'react';
import { isoDay } from './domain.js';
import { startFreestyleWorkout, freestyleEffortLimit } from './freestyleWorkout.js';
import {PreviousValuesHelper} from './PreviousValuesHelper.jsx';
import './freestyleWorkout.css';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { importedSessionTimeLabel } from './historicalSetSemantics.js';

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
      {records.map(w => <button className="list-row" key={w.id} data-workout-id={w.id} onClick={() => setDetail({ completedWorkout: w.id })}><span>{w.name || 'Workout'}<small>{w.historicalImport?.version===2?`Imported · ${importedSessionTimeLabel(w)}`:<>{w.savedWorkoutTemplateId ? 'Saved workout' : w.source === 'freestyle' ? 'Freestyle' : 'Planned'} · Finished {new Date(w.completedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</>}</small></span><span aria-hidden="true">›</span></button>)}
    </section>}
  </div>;
}

export {FreestyleExercisePicker} from './FreestyleQueuePicker.jsx';

export function FreestyleActions({ setDetail, hideAdd = false }) {
  if (hideAdd) return null;
  return <div className="freestyle-actions"><button className="button secondary" onClick={() => setDetail({ freestylePicker: true })}>+ ADD EXERCISE</button></div>;
}
export function FreestylePrevious({ state, exercise, update, screenRef }) {
  const limit = useMemo(() => freestyleEffortLimit(state, exercise.exerciseId), [state.profile, exercise.exerciseId]);
  return <>
    {limit != null && <p className="training-limit-note">Your training limit: keep at least {limit} RIR.</p>}
    <PreviousValuesHelper key={`${state.profile.id}:${state.activeWorkout.id}:${exercise.id}:${exercise.exerciseId}`} state={state} update={update} exercise={exercise} screenRef={screenRef}/>
  </>;
}
