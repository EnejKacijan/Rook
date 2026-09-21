import React, { useEffect,useId,useMemo,useRef,useState } from 'react';
import {createPortal} from 'react-dom';
import {useDurableAction} from './useDurableAction.js';
import { exerciseMeasure, displayWeight, workoutSetSummary, isoDay } from './domain.js';
import { startFreestyleWorkout, freestylePreviousSets, cancelUnloggedFreestyle, freestyleEffortLimit } from './freestyleWorkout.js';
import {PreviousValuesHelper} from './PreviousValuesHelper.jsx';
import './freestyleWorkout.css';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { importedSessionTimeLabel } from './historicalSetSemantics.js';

export function FreestyleEntry({ state, update, setPage, setDetail, date, historyOnly = false, hideHistory = false, representedWorkoutId = null, tertiary = false }) {
  const [error, setError] = useState('');
  const today = date === isoDay();
  const records = hideHistory ? [] : completedWorkoutsForDate(state.workouts, date).filter(workout => workout.id !== representedWorkoutId);
  const available = !historyOnly && today && !state.activeWorkout && !state.activeOptionalSession;
  if (!available && !records.length) return null;
  return <div className="freestyle-entry">
    {available && <>
      <button className={tertiary ? 'text-button rest-freestyle-action' : 'button secondary'} onClick={() => {
        try { startFreestyleWorkout(state); update(current => {
          if (current.activeWorkout || current.activeOptionalSession) return current;
          try { return startFreestyleWorkout(current); } catch { return current; }
        }); setPage('workout'); }
        catch (e) { setError(e.message); }
      }}>{tertiary && <span aria-hidden="true">+ </span>}Start freestyle workout</button>
      {!tertiary && <small>Choose exercises as you go. Your plan won’t change.</small>}
      {error && <p role="alert">{error}</p>}
    </>}
    {records.length > 0 && <section className="today-completed-workouts" aria-label="Completed workouts">
      {records.length > 1 && <div className="eyebrow">Completed workouts · {records.length}</div>}
      {records.map(w => <button className="list-row" key={w.id} data-workout-id={w.id} onClick={() => setDetail({ completedWorkout: w.id })}><span>{w.name || 'Workout'}<small>{w.historicalImport?.version===2?`Imported · ${importedSessionTimeLabel(w)}`:<>{w.source === 'freestyle' ? 'Freestyle' : 'Planned'} · Finished {new Date(w.completedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</>}</small></span><span aria-hidden="true">›</span></button>)}
    </section>}
  </div>;
}

export {FreestyleExercisePicker} from './FreestyleQueuePicker.jsx';

export function FreestyleActions({ state, update, setDetail, setPage, hideAdd = false, Modal, Header, backgroundRef, preserveDraftsRef }) {
  const logged = workoutSetSummary(state.activeWorkout).completed;
  const [confirmSession,setConfirmSession]=useState(null),[error,setError]=useState('');
  const trigger=useRef(null),titleId=useId(),detailId=useId();
  const {commit,latest}=useDurableAction(state,update);
  useEffect(()=>()=>{if(preserveDraftsRef)preserveDraftsRef.current=false;},[preserveDraftsRef]);
  const keep=()=>{setConfirmSession(null);setError('');if(preserveDraftsRef)preserveDraftsRef.current=false;};
  const cancel=sessionId=>{
    setError('');
    try {
      const result=commit(current=>current.activeWorkout?.id===sessionId?cancelUnloggedFreestyle(current):current);
      if(!result.changed){setError('This workout can no longer be cancelled. Keep the workout to continue.');return;}
      setPage('today');
    } catch(e){setError(e.message);}
  };
  const requestCancel=()=>{
    const active=latest.current.activeWorkout;
    if(active?.source!=='freestyle'||workoutSetSummary(active).completed)return;
    if(!active.exercises.length){cancel(active.id);return;}
    if(preserveDraftsRef)preserveDraftsRef.current=true;
    setError('');setConfirmSession(active.id);
  };
  return <div className="freestyle-actions">
    {!hideAdd && <button className="button secondary" onClick={() => setDetail({ freestylePicker: true })}>+ ADD EXERCISE</button>}
    {state.activeWorkout?.source==='freestyle' && !logged && <button ref={trigger} type="button" data-freestyle-cancel className="text-button freestyle-cancel"
      onPointerDown={event=>{if(event.button===0)event.preventDefault();}} onClick={requestCancel}>Cancel workout</button>}
    {!confirmSession&&error&&<p role="alert">{error}</p>}
    {confirmSession&&createPortal(<Modal backgroundRef={backgroundRef} returnFocusRef={trigger} close={keep}>
      {requestClose=><section className="screen detail-screen workout-confirm freestyle-cancel-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={detailId}>
        <Header title="END WORKOUT" onBack={requestClose}/>
        <h2 id={titleId}>Cancel workout?</h2>
        <p id={detailId}>Your added exercises and any unlogged entries will be discarded.</p>
        {error&&<p role="alert">{error}</p>}
        <div className="workout-confirm-actions">
          <button type="button" className="button primary" data-sheet-initial-focus onClick={requestClose}>KEEP WORKOUT</button>
          <button type="button" className="button danger" onClick={()=>cancel(confirmSession)}>CANCEL WORKOUT</button>
        </div>
      </section>}
    </Modal>,document.body)}
  </div>;
}

export function FreestylePrevious({ state, exercise, update, setDetail, screenRef }) {
  const limit = useMemo(() => freestyleEffortLimit(state, exercise.exerciseId), [state.profile, exercise.exerciseId]);
  const previous = useMemo(()=>freestylePreviousSets(state, exercise),[state.workouts,exercise.exerciseId,exercise.loggingMode]);
  const index = exercise.sets.findIndex(s => !s.completed);
  const set = exercise.sets[index];
  const prior = previous[index];
  const canCopy = prior && set && !set.setType && !set.segments?.length;
  const label = s => `${s.weight != null ? `${displayWeight(s.weight, state.profile.units)} ${state.profile.units} × ` : ''}${s.sides ? `${s.sides.left?.reps} / ${s.sides.right?.reps} per side` : `${s.reps} ${exerciseMeasure(exercise) === 'seconds' ? 'sec' : 'reps'}`}`;
  return <div className="freestyle-previous">
    {limit != null && <p className="training-limit-note">Your training limit: keep at least {limit} RIR.</p>}
    <div className={canCopy ? 'freestyle-history-aid' : ''}>
    <button className="text-button" onClick={() => setDetail({ exercise })}>View exercise history</button>
    {canCopy && <PreviousValuesHelper key={`${state.activeWorkout.id}:${exercise.id}:${set.id}`} state={state} update={update} exercise={exercise} set={set} prior={prior} index={index} label={label(prior)} screenRef={screenRef}/>}
    </div>
  </div>;
}
