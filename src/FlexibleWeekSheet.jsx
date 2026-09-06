import { useLayoutEffect, useRef, useState } from 'react';
import { useSheetBack } from './useSheetBack.js';
import { isoDay, saveState, weekKey, weekday } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, flexibleSessions, flexibleWeekConflict, proposeFlexibleWeek } from './flexibleWeek.js';

const dateLabel = date => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
export function FlexibleWeekSheet({ state, update, close, Header, request = {} }) {
  const today = isoDay(), sessions = flexibleSessions(state, today);
  const [steps, setSteps] = useState(request.sessionId ? ['mode', 'destination'] : ['mode']);
  const step = steps.at(-1);
  const setStep = next => setSteps(current => {
    const existing = current.lastIndexOf(next);
    return existing >= 0 ? current.slice(0, existing + 1) : [...current, next];
  });
  const [sessionId, setSessionId] = useState(request.sessionId || null);
  const [baseline] = useState(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(today, i)).filter(date =>
    Array.isArray(state.profile?.availableDays) && state.profile.availableDays.includes(weekday(date)) && !sessions.some(s => ['active', 'completed'].includes(s.status) && s.scheduledDate === date)));
  const [available, setAvailable] = useState(baseline);
  const [expandedAvailability, setExpandedAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const availabilityChanged = available.length !== baseline.length || available.some(date => !baseline.includes(date));
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');
  const [adaptationChoice, setAdaptationChoice] = useState('restore');
  const applied = useRef(false);
  const screenRef = useRef(null);
  const goBack = () => { setSteps(current => current.length > 1 ? current.slice(0, -1) : current); setError(''); };
  useSheetBack(screenRef, step, steps.at(-2), goBack);
  useLayoutEffect(() => { if (screenRef.current) screenRef.current.scrollTop = 0; }, [step]);
  const item = sessions.find(s => s.logicalSessionId === sessionId);
  const candidates = sessions.filter(s => ['planned', 'missed', 'optional'].includes(s.status) && s.scheduledDate <= addCalendarDays(today, 13));
  const hasMissed = candidates.some(s => s.status === 'missed');
  const review = action => {
    setError(''); const result = proposeFlexibleWeek(state, action, today);
    if (action.mode === 'available' && result.status !== 'ready') { setAvailabilityResult(result); setStep('availability-result'); return; }
    if (result.status !== 'ready') { setError(result.error); return; }
    setProposal(result); setStep('review');
  };
  const apply = () => {
    if (applied.current) return;
    const result = applyFlexibleWeek(state, proposal, { adaptationChoice });
    if (result.status !== 'applied') { setError(result.error); return; }
    if (!saveState(result.state)) { setError('ROOK couldn’t save the schedule. Your previous schedule is unchanged. Try again.'); return; }
    applied.current = true; update(() => result.state); close();
  };
  return <main ref={screenRef} className="screen detail-screen flexible-week-sheet">
    <Header title="Adjust week" onClose={close} onBack={steps.length > 1 ? goBack : undefined} />
    <p className="eyebrow">TEMPORARY SCHEDULE</p>
    {step === 'mode' && <>
      <h1>What changed?</h1>
      <p>Move training dates. Keep your plan.</p>
      {flexibleWeekConflict(state) && <p role="status">Your plan changed. Clear the old temporary schedule before adjusting again. Completed and active workouts stay fixed.</p>}
      <div className="adjust-option-list">
        <button className="choice-row" disabled={!hasMissed} onClick={() => { if (hasMissed) setStep('missed'); }}><strong>I missed a workout</strong><small>{hasMissed ? 'Move or skip an unstarted session.' : 'No missed workouts to move.'}</small></button>
        <button className="choice-row" onClick={() => setStep('available')}><strong>My available days changed</strong><small>Review the remaining week together.</small></button>
        <button className="choice-row" onClick={() => setStep('pick')}><strong>Move a workout</strong><small>Choose one session and another date.</small></button>
      </div>
      {state.flexibleWeek && <button className="text-button" onClick={() => review({ mode: 'restore' })}>Restore original schedule</button>}
    </>}
    {['pick', 'missed'].includes(step) && <>
      <h1>{step === 'missed' ? 'Choose a missed session' : 'Choose a workout'}</h1>
      <div className={step === 'pick' ? 'flexible-workout-list' : 'adjust-option-list'}>{candidates.filter(s => step !== 'missed' || s.status === 'missed').map(s => <button className="choice-row" key={s.logicalSessionId} onClick={() => { setSessionId(s.logicalSessionId); setStep('destination'); }}><strong>{s.workout.name}</strong><small>{dateLabel(s.scheduledDate)}{s.moved ? ` · Originally ${dateLabel(s.originalDate)}` : ''}</small></button>)}</div>
      {!candidates.some(s => step !== 'missed' || s.status === 'missed') && <p>No unstarted sessions need moving.</p>}
    </>}
    {step === 'destination' && item && <>
      <h1>Move {item.workout.name}</h1><p>Currently {dateLabel(item.scheduledDate)}. Choose a new date.</p>
      <button className="text-button" onClick={() => review({ mode: 'move', sessionId, toDate: today })}>Move to today</button>
      <div className="flexible-week-dates">{Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).map(d => {
        const occupied = sessions.some(s => s.logicalSessionId !== sessionId && s.scheduledDate === d && s.status !== 'skipped');
        return <button key={d} disabled={occupied || d === item.scheduledDate} aria-label={`${dateLabel(d)}${occupied ? ', another workout scheduled' : ''}`} onClick={() => review({ mode: 'move', sessionId, toDate: d })}>{dateLabel(d)}</button>;
      })}</div>
      <button className="text-button" onClick={() => setStep('available')}>Adjust remaining week</button>
      <button className="text-button" onClick={() => review({ mode: 'skip', sessionId })}>Skip this session</button>
    </>}
    {step === 'available' && <>
      <h1>When can you train?</h1><p>Select the days you're available over the next {expandedAvailability ? 14 : 7} days.</p>
      <p className="flexible-availability-note">Your profile availability stays unchanged.</p>
      {[0, ...(expandedAvailability ? [7] : [])].map(offset => <section key={offset}>
        {offset > 0 && <p className="eyebrow">FOLLOWING 7 DAYS</p>}
        <div className="flexible-week-dates flexible-availability-dates">{Array.from({ length: 7 }, (_, i) => addCalendarDays(today, i + offset)).map(d => {
          const scheduled = sessions.find(s => s.scheduledDate === d && s.status !== 'skipped');
          return <button key={d} aria-label={dateLabel(d)} aria-pressed={available.includes(d)} className={available.includes(d) ? 'is-selected' : ''} disabled={sessions.some(s => ['active', 'completed'].includes(s.status) && s.scheduledDate === d)} onClick={() => setAvailable(list => list.includes(d) ? list.filter(x => x !== d) : [...list, d])}><span>{dateLabel(d)}</span>{scheduled && <small>{scheduled.workout.name}</small>}</button>;
        })}</div>
      </section>)}
      <button className="button primary" disabled={!availabilityChanged} onClick={() => review({ mode: 'available', availableDates: available, windowDays: expandedAvailability ? 14 : 7 })}>REVIEW SCHEDULE</button>
    </>}
    {step === 'availability-result' && availabilityResult && <>
      <h1>{availabilityResult.status === 'no-change' ? 'Your schedule fits' : availabilityResult.status === 'insufficient-capacity' ? 'More training days needed' : 'Review these dates'}</h1>
      <p role="status">{availabilityResult.message || availabilityResult.error}</p>
      {availabilityResult.status === 'insufficient-capacity' && <div className="flexible-week-conflict-actions">
        {!expandedAvailability && <button className="text-button" onClick={() => { setExpandedAvailability(true); setStep('available'); }}>SHOW MORE DATES</button>}
        <button className="text-button" onClick={() => setStep('pick')}>Choose a session to skip</button>
      </div>}
      <button className="button secondary" onClick={() => setStep('available')}>EDIT DAYS</button>
      <button className="button quiet" onClick={close}>DONE</button>
    </>}
    {step === 'review' && proposal && <>
      <h1>{proposal.request.mode === 'restore' ? 'Restore the schedule?' : 'Review your schedule'}</h1>
      <p>Dates only. Your exercises and permanent plan stay unchanged.</p>
      <div className="flexible-week-review">{proposal.availabilitySchedule ? proposal.availabilitySchedule.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span><small>ORIGINAL</small> {dateLabel(c.fromDate)}</span><span><small>ADJUSTED</small> {dateLabel(c.toDate)}{c.fromDate === c.toDate ? ' · Unchanged' : ''}</span></article>) : proposal.changes.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span>{dateLabel(c.fromDate)} → {c.skipped ? 'Skipped this week' : dateLabel(c.toDate)}</span><small>{c.skipped ? 'No completed work or progression credit.' : weekKey(c.toDate) > weekKey(c.originalDate) ? 'Carried forward' : c.toDate === c.originalDate ? 'Original date restored' : 'Moved'}{c.blockWeekNumber ? ` · Program week ${c.blockWeekNumber}` : ''}</small></article>)}</div>
      {!proposal.changes.length && <p>Clear stale or past unstarted overrides. Completed and active sessions remain fixed.</p>}
      {proposal.changes.length > 0 && <p className="sheet-footnote">All other sessions keep their dates.{proposal.rejoinDate && ` Normal schedule resumes ${dateLabel(proposal.rejoinDate)}.`}</p>}
      {proposal.warnings.map(w => <p className="sheet-footnote" key={w}>{w}</p>)}
      {proposal.adaptationConflict && (proposal.request.mode === 'skip' ? <p className="sheet-footnote">Skipping also clears this session’s today-only adjustment.</p> : <fieldset className="flexible-adjustment-choice"><legend>This workout has a today-only adjustment.</legend>{[['restore', 'Restore original workout'], ['keep', 'Keep adjusted workout']].map(([value, label]) => <label key={value}><input type="radio" name="move-adjustment" checked={adaptationChoice === value} onChange={() => setAdaptationChoice(value)} />{label}</label>)}</fieldset>)}
      <div className="flexible-week-footer"><button className="button primary" onClick={apply}>USE THIS SCHEDULE</button><button className="button quiet" onClick={close}>CANCEL</button></div>
    </>}
    {error && <p role="alert" className="flexible-week-error">{error}</p>}
  </main>;
}
