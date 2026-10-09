import React, { useId, useRef, useState } from 'react';
import { exerciseCatalog, isoDay, saveState } from './domain.js';
import { CANONICAL_GYM_EQUIPMENT, normalizeGymEquipment } from './gymProfiles.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { applyTemporaryPlan, endTemporaryPlan, nextTemporaryPlanStart, proposeTemporaryPlan, temporaryPlanStatus } from './temporaryPlan.js';
import './temporaryPlan.css';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dateLabel = date => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
export function TemporaryPlanSheet({ state, update, Header, close, persist = saveState }) {
  const titleId = useId();
  const [weeks, setWeeks] = useState(3), [startDate, setStartDate] = useState(nextTemporaryPlanStart);
  const [days, setDays] = useState(['Mon', 'Wed', 'Fri'].slice(0, Math.min(3, state.program?.days.length || 3)));
  const [equipment, setEquipment] = useState(() => normalizeGymEquipment(state.profile?.equipment || ['full gym'])), [proposal, setProposal] = useState(null), [error, setError] = useState('');
  const [ending, setEnding] = useState(false), [busy, setBusy] = useState(false);
  const inFlight = useRef(false), completed = useRef(false);
  const period = temporaryPlanStatus(state), currentPeriod = period && period.status !== 'ended';
  const prepare = () => {
    const result = proposeTemporaryPlan(state, { weeks, startDate, days, equipment });
    setError(result.error || ''); if (result.status === 'ready') setProposal(result);
  };
  const publish = end => {
    if (inFlight.current || completed.current) return;
    const action = () => {
      if (inFlight.current || completed.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const result = end ? endTemporaryPlan(state, persist) : applyTemporaryPlan(state, proposal, persist);
        if (result.status !== 'applied') { setError(result.error); return; }
        completed.current = true;
        update(() => result.state, { planVersion: false, persistedState: result.state }); close();
      } catch { setError('This change could not be saved. Your current plan was kept.'); }
      finally { inFlight.current = false; setBusy(false); }
    };
    action();
  };
  const toggleEquipment = value => setEquipment(current => value === 'full gym' || value === 'bodyweight only' ? [value]
    : current.includes(value) ? current.filter(item => item !== value) : [...current.filter(item => item !== 'full gym' && item !== 'bodyweight only'), value]);
  const feedback = error && <p className="temporary-plan-error" role="alert">{error}</p>;
  return <main className="screen detail-screen temporary-plan-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <Header title="Temporary plan" onClose={close} closeLabel="Close temporary plan" />
    <span className="eyebrow">{proposal ? 'REVIEW BEFORE APPLYING' : 'TRAINING AROUND YOUR LIFE'}</span>
    <h1 id={titleId}>{ending ? 'Return to your usual plan?' : currentPeriod ? 'Your temporary plan' : proposal ? 'A plan for the next few weeks' : 'A different few weeks.'}</h1>
    {currentPeriod ? <>
      <p>{dateLabel(period.startDate)} – {dateLabel(period.endDate)} · {period.days.length} days a week · {period.equipment.join(', ')}.</p>
      <p>{period.planChanged ? 'Your plan or training restrictions changed. Review the affected dates before making another adjustment.' : 'Your usual plan resumes after this period. Completed workouts stay as logged.'}</p>
      {ending && <p>Only unchanged, unstarted sessions from today onward return to their previous schedule. Logged workouts and working weights are kept.</p>}
      <SheetActionFooter>{feedback}{ending ? <><button className="button primary" disabled={busy} onClick={() => publish(true)}>END TEMPORARY PLAN</button><button className="button secondary" onClick={() => setEnding(false)}>KEEP TEMPORARY PLAN</button></> : <button className="button secondary" onClick={() => setEnding(true)}>END EARLY…</button>}</SheetActionFooter>
    </> : proposal ? <>
      <p>{dateLabel(proposal.request.startDate)} – {dateLabel(proposal.request.endDate)} · {weeks} weeks · {days.length} days a week.</p>
      <p>{equipment.join(', ')}. Your usual plan resumes afterwards; history and your saved setup stay in place.</p>
      <div className="temporary-plan-changes" aria-label="Every proposed workout change">{proposal.changes.map(change => <article key={change.id}>
        <strong>{change.name}</strong><p>{dateLabel(change.originalDate)} → {change.skipped ? 'Rest day for this period' : `${dateLabel(change.toDate)} · ${change.workout.name}`}</p>
        {change.workout && <details><summary>Review exercises ({change.workout.exercises.length})</summary><ul>{change.workout.exercises.map(exercise => <li key={exercise.id}>{exercise.name || exerciseCatalog[exercise.exerciseId]?.name} · {exercise.sets.length} sets · {exercise.repMin}–{exercise.repMax} {exercise.timed ? 'seconds' : 'reps'}</li>)}</ul></details>}
      </article>)}</div>
      <SheetActionFooter>{feedback}<button className="button primary" disabled={busy} onClick={() => publish(false)}>APPLY TEMPORARY PLAN</button><button className="button secondary" onClick={() => { setProposal(null); setError(''); }}>EDIT SETTINGS</button></SheetActionFooter>
    </> : <>
      <p>Use fewer training days or different equipment for 2–4 weeks. Review every date and exercise before anything changes.</p>
      <label className="temporary-plan-start">Start on Monday<input type="date" aria-label="Temporary plan start date" min={isoDay()} value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <fieldset><legend>How long?</legend><div className="temporary-plan-choices">{[2, 3, 4].map(value => <button type="button" key={value} aria-pressed={weeks === value} onClick={() => setWeeks(value)}>{value} weeks</button>)}</div></fieldset>
      <fieldset><legend>Training days · {days.length} selected</legend><div className="temporary-plan-choices">{weekdays.map(day => <button type="button" key={day} aria-pressed={days.includes(day)} onClick={() => setDays(current => current.includes(day) ? current.filter(item => item !== day) : weekdays.filter(item => item === day || current.includes(item)))}>{day}</button>)}</div></fieldset>
      <fieldset><legend>Equipment for this period</legend><div className="temporary-plan-equipment">{CANONICAL_GYM_EQUIPMENT.map(item => <label key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={() => toggleEquipment(item)} />{item}</label>)}</div></fieldset>
      <SheetActionFooter>{feedback}<button className="button primary" onClick={prepare}>PREPARE TEMPORARY PLAN</button><button className="button secondary" onClick={close}>CANCEL</button></SheetActionFooter>
    </>}
  </main>;
}
