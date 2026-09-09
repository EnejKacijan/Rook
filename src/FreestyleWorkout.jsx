import React, { useMemo, useState } from 'react';
import { SearchInput } from './SearchInput.jsx';
import { exerciseMatchesQuery, rankExerciseSearch, exerciseMeasure, displayWeight, workoutSetSummary, isoDay } from './domain.js';
import { startFreestyleWorkout, addFreestyleExercise, freestyleCatalog, freestylePreviousSets, copyFreestylePrevious, cancelUnloggedFreestyle, freestyleEffortLimit } from './freestyleWorkout.js';
import './freestyleWorkout.css';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';

export function FreestyleEntry({ state, update, setPage, setDetail, date, historyOnly = false, hideHistory = false, representedWorkoutId = null }) {
  const [error, setError] = useState('');
  const today = date === isoDay();
  const records = hideHistory ? [] : completedWorkoutsForDate(state.workouts, date).filter(workout => workout.id !== representedWorkoutId);
  const available = !historyOnly && today && !state.activeWorkout && !state.activeOptionalSession;
  if (!available && !records.length) return null;
  return <div className="freestyle-entry">
    {available && <>
      <button className="button secondary" onClick={() => {
        try { startFreestyleWorkout(state); update(current => {
          if (current.activeWorkout || current.activeOptionalSession) return current;
          try { return startFreestyleWorkout(current); } catch { return current; }
        }); setPage('workout'); }
        catch (e) { setError(e.message); }
      }}>Start freestyle workout</button>
      <small>Choose exercises as you go. Your plan won’t change.</small>
      {error && <p role="alert">{error}</p>}
    </>}
    {records.length > 0 && <section className="today-completed-workouts" aria-label="Completed workouts">
      {records.length > 1 && <div className="eyebrow">Completed workouts · {records.length}</div>}
      {records.map(w => <button className="list-row" key={w.id} data-workout-id={w.id} onClick={() => setDetail({ completedWorkout: w.id })}><span>{w.name || 'Workout'}<small>{w.source === 'freestyle' ? 'Freestyle' : 'Planned'} · Finished {new Date(w.completedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</small></span><span aria-hidden="true">›</span></button>)}
    </section>}
  </div>;
}

export function FreestyleExercisePicker({ state, update, close, Header }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const catalog = useMemo(() => freestyleCatalog(state), [state]);
  const recent = useMemo(() => {
    const ids = new Set();
    for (const w of [...state.workouts].reverse()) for (const e of w.exercises || [])
      if (w.completedAt && e.sets.some(s => s.completed) && catalog.some(i => i.id === e.exerciseId)) ids.add(e.exerciseId);
    return [...ids].slice(0, 6).map(id => catalog.find(i => i.id === id));
  }, [state.workouts, catalog]);
  const matches = rankExerciseSearch(catalog.filter(item => exerciseMatchesQuery(item, query)).sort((a, b) => a.name.localeCompare(b.name)), query);
  const row = item => {
    const added = state.activeWorkout?.exercises.some(e => e.exerciseId === item.id);
    return <button className="list-row" key={item.id} disabled={added} onClick={() => {
      try { addFreestyleExercise(state, item.id); update(current => {
        try { return addFreestyleExercise(current, item.id); } catch { return current; }
      }); close(); }
      catch (e) { setError(e.message); }
    }}><span>{item.name}<small>{item.equipment?.join(' · ')}{item.custom ? ' · Custom' : ''}</small></span><span>{added ? 'Added' : '+'}</span></button>;
  };
  return <main className="screen detail-screen freestyle-picker">
    <Header title="Add exercise" onClose={close} />
    <SearchInput className="exercise-search" aria-label="Search exercises" placeholder="Search exercises" value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} />
    {error && <p role="alert">{error}</p>}
    {!query && recent.length > 0 && <section><h3>Recent</h3>{recent.map(row)}</section>}
    <section><h3>{query ? 'Matching exercises' : 'All exercises'}</h3>{matches.map(row)}
      {!matches.length && <p>No compatible exercises found. Try another search or review your equipment and restrictions in Profile.</p>}
    </section>
  </main>;
}

export function FreestyleActions({ state, update, setDetail, setPage, empty = false, hideAdd = false }) {
  const logged = workoutSetSummary(state.activeWorkout).completed;
  return <div className="freestyle-actions">
    {!hideAdd && <button className="button secondary" onClick={() => setDetail({ freestylePicker: true })}>+ ADD EXERCISE</button>}
    {!logged && <button className="text-button freestyle-cancel" onClick={() => { update(cancelUnloggedFreestyle); setPage('today'); }}>Cancel workout</button>}
  </div>;
}

export function FreestylePrevious({ state, exercise, update, setDetail }) {
  const limit = useMemo(() => freestyleEffortLimit(state, exercise.exerciseId), [state.profile, exercise.exerciseId]);
  const previous = freestylePreviousSets(state, exercise);
  const index = exercise.sets.findIndex(s => !s.completed);
  const set = exercise.sets[index];
  const prior = previous[index];
  const canCopy = prior && set && !set.setType && !set.segments?.length;
  const label = s => `${s.weight != null ? `${displayWeight(s.weight, state.profile.units)} ${state.profile.units} × ` : ''}${s.sides ? `${s.sides.left?.reps} / ${s.sides.right?.reps} per side` : `${s.reps} ${exerciseMeasure(exercise) === 'seconds' ? 'sec' : 'reps'}`}`;
  return <div className="freestyle-previous">
    {limit != null && <p className="training-limit-note">Your training limit: keep at least {limit} RIR.</p>}
    <div className={canCopy ? 'freestyle-history-aid' : ''}>
    <button className="text-button" onClick={() => setDetail({ exercise })}>View exercise history</button>
    {canCopy && <button className="freestyle-copy" onClick={() => update(current => copyFreestylePrevious(current, exercise.id, set.id, index))}><span>Previous workout · set {index + 1}<strong>{label(prior)}</strong></span><span>USE VALUES</span></button>}
    </div>
  </div>;
}
