import {skipMissedOccurrence} from './missedWorkoutActions.js';
import {UseWorkoutTodaySheet} from './UseWorkoutTodaySheet.jsx';
import {canUseWorkoutToday} from './useWorkoutToday.js';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { useSheetBack } from './useSheetBack.js';
import { isoDay, saveState, weekKey, weekday,calendarDate } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, flexibleSessions, flexibleSessionById, flexibleWeekConflict, proposeFlexibleWeek, missedFlexibleSessions, moveWorkoutCandidates, moveWorkoutDestinations } from './flexibleWeek.js';
import './flexibleWeekChooser.css';

const dateLabel = date => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
export function groupRescheduleCandidates(candidates) {
  const sorted=[...candidates].sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)||a.logicalSessionId.localeCompare(b.logicalSessionId));
  return [['MISSED',sorted.filter(s=>s.status==='missed')],['UPCOMING',sorted.filter(s=>s.status!=='missed')]]
    .filter(([,sessions])=>sessions.length).map(([label,sessions])=>({label,sessions}));
}
export function missedSessionDestinations(state, sessionId, today=isoDay()) {
  const item=flexibleSessionById(state,sessionId,today);
  if(!item || item.status!=='missed')return [];
  return moveWorkoutDestinations(state,sessionId,today).filter(destination=>destination.available).map(destination=>destination.date);
}
export function FlexibleWeekSheet({ state, update, close, Header, request = {}, setDetail }) {
  const [useToday,setUseToday]=useState(null);
  const today = isoDay(), sessions = flexibleSessions(state, today);
  const missed = missedFlexibleSessions(state,today);
  const initialSessionId = request.sessionId || (request.missed && missed.length===1 ? missed[0].logicalSessionId : null);
  const initialSwap = request.swap && request.otherSessionId ? proposeFlexibleWeek(state,{mode:'swap',sessionId:request.sessionId,otherSessionId:request.otherSessionId},today) : null;
  const [steps, setSteps] = useState(initialSwap?.status==='ready' ? ['mode','swap','review'] : initialSessionId ? ['mode', request.swap ? 'swap' : 'destination'] : request.missed ? ['mode','missed'] : request.move ? ['pick'] : ['mode']);
  const step = steps.at(-1);
  const setStep = next => setSteps(current => {
    const existing = current.lastIndexOf(next);
    return existing >= 0 ? current.slice(0, existing + 1) : [...current, next];
  });
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [baseline] = useState(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(today, i)).filter(date =>
    Array.isArray(state.profile?.availableDays) && state.profile.availableDays.includes(weekday(calendarDate(date))) && !sessions.some(s => ['active', 'completed'].includes(s.status) && s.scheduledDate === date)));
  const [available, setAvailable] = useState(baseline);
  const [expandedAvailability, setExpandedAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const availabilityChanged = available.length !== baseline.length || available.some(date => !baseline.includes(date));
  const [proposal, setProposal] = useState(initialSwap?.status==='ready' ? initialSwap : null);
  const [error, setError] = useState('');
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const [adaptationChoice, setAdaptationChoice] = useState('restore');
  const applied = useRef(false);
  const screenRef = useRef(null);
  const goBack = () => { setSteps(current => current.length > 1 ? current.slice(0, -1) : current); setError(''); };
  useSheetBack(screenRef, step, steps.at(-2), goBack);
  useLayoutEffect(() => { if (screenRef.current) screenRef.current.scrollTop = 0; }, [step]);
  const item = flexibleSessionById(state,sessionId,today);
  const missedDestination = step==='destination' && item?.status==='missed';
  const destinations = useMemo(() => step === 'destination' ? moveWorkoutDestinations(state,sessionId,today) : [], [state,sessionId,today,step]);
  const validDates = destinations.filter(destination=>destination.available).map(destination=>destination.date);
  const todayDestination = destinations.find(destination=>destination.date===today);
  const destinationReasonId = useId();
  const dateWeeks = [...new Set(Array.from({length:13},(_,i)=>addCalendarDays(today,i+1)).map(date=>weekKey(date)))];
  const occupiedToday = sessions.find(s=>s.logicalSessionId!==sessionId && s.scheduledDate===today && s.status!=='skipped');
  const candidates = moveWorkoutCandidates(state,today);
  const hasMissed = missed.length > 0;
  const swapCandidates = item ? sessions.filter(s=>proposeFlexibleWeek(state,{mode:'swap',sessionId,otherSessionId:s.logicalSessionId},today).status==='ready') : [];
  const simpleSwap = proposal?.request.mode === 'swap';
  const simpleMove = proposal?.request.mode === 'move' && !proposal.adaptationConflict;
  const review = action => {
    setError(''); const result = proposeFlexibleWeek(state, action, today);
    if (action.mode === 'available' && result.status !== 'ready') { setAvailabilityResult(result); setStep('availability-result'); return; }
    if (result.status !== 'ready') { setError(result.error); return; }
    setProposal(result); setStep('review');
  };
  const apply = () => {
    if (applied.current) return;
    setError('');
    setPersistenceFailed(false);
    const result = applyFlexibleWeek(state, proposal, { adaptationChoice });
    if (result.status !== 'applied') { setError(result.error); return; }
    if (!saveState(result.state)) { setPersistenceFailed(true); setError('ROOK couldn’t save the schedule. Your previous schedule is unchanged. Try again.'); return; }
    applied.current = true; update(() => result.state, {persistedState:result.state});
    if(simpleMove)setStep('done');else close();
  };
  const skipMissed = () => {
    if (applied.current || item?.status !== 'missed') return;
    setError('');
    try {
      const result=skipMissedOccurrence(state,sessionId);
      applied.current=true;
      update(()=>result.state,{persistedState:result.state});
    } catch(error) { setError(error.message); return; }
    close();
  };
  if(useToday || !applied.current && sessionId && ['destination','swap'].includes(step) && (!item || !['planned','missed','optional'].includes(item.status)))return <UseWorkoutTodaySheet state={state} update={update} close={close} Header={Header} setDetail={setDetail} request={{sessionId:useToday||sessionId}}/>;
  return <main ref={screenRef} className={`screen detail-screen flexible-week-sheet${missedDestination?' content-fit-screen missed-destination-sheet':''}`}>
    <Header title={request.move ? 'Move a workout' : 'Adjust week'} onClose={close} onBack={step!=='done' && steps.length > 1 ? goBack : undefined} />
    <p className="eyebrow">{step==='pick'?'MOVE A WORKOUT':'TEMPORARY SCHEDULE'}</p>
    {step === 'mode' && <>
      <h1>What changed?</h1>
      <p>Move training dates. Keep your plan.</p>
      {flexibleWeekConflict(state) && <p role="status">Your plan changed. Clear the old temporary schedule before adjusting again. Completed and active workouts stay fixed.</p>}
      <div className="adjust-option-list">
        <button className="choice-row" disabled={!hasMissed} onClick={() => { if(missed.length===1){setSessionId(missed[0].logicalSessionId);setStep('destination');}else if(hasMissed)setStep('missed'); }}><strong>I missed a workout</strong><small>{hasMissed ? 'Move or skip an unstarted session.' : 'No missed workouts to move.'}</small></button>
        <button className="choice-row" onClick={() => setStep('available')}><strong>My available days changed</strong><small>Review the remaining week together.</small></button>
        <button className="choice-row" onClick={() => setStep('pick')}><strong>Move a workout</strong><small>Choose one session and another date.</small></button>
      </div>
      {state.flexibleWeek && <button className="text-button" onClick={() => review({ mode: 'restore' })}>Restore original schedule</button>}
    </>}
    {['pick', 'missed'].includes(step) && <>
      <h1>{step === 'missed' ? 'Choose a missed session' : 'Choose a workout'}</h1>
      {step === 'pick' ? <>
        <p>Select a missed or upcoming workout to move.</p>
        <div className="flexible-workout-list">{groupRescheduleCandidates(candidates).map(group=><section className="flexible-workout-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.sessions.map(s=><button className="list-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>{setSessionId(s.logicalSessionId);setStep('destination');}}>
            <span><strong>{s.workout.name}</strong><small>{s.status==='missed'?'Missed · ':''}{dateLabel(s.scheduledDate)}{s.moved?` · Originally ${dateLabel(s.originalDate)}`:''}</small></span><span aria-hidden="true">›</span>
          </button>)}
        </section>)}</div>
      </> : <div className="adjust-option-list missed-session-choices">{missed.map(s => <button className="choice-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={() => { setSessionId(s.logicalSessionId); setStep('destination'); }}><strong>{s.workout.name}</strong><small>Missed · {dateLabel(s.scheduledDate)}</small>{s.moved&&<small>Originally scheduled for {dateLabel(s.originalDate)}</small>}</button>)}</div>}
      {step==='pick' ? !candidates.length && <p role="status">No missed or upcoming workouts can be moved.</p> : !missed.length && <p>No unstarted sessions need moving.</p>}
    </>}
    {step === 'swap' && item && <>
      <h1>Swap with another workout</h1><p>{item.workout.name} · {dateLabel(item.scheduledDate)}</p>
      <div className="adjust-option-list">{swapCandidates.map(s=><button className="choice-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>review({mode:'swap',sessionId,otherSessionId:s.logicalSessionId})}><strong>{s.workout.name}</strong><small>{dateLabel(s.scheduledDate)}</small></button>)}</div>
      {!swapCandidates.length && <p>No eligible workouts to swap. Completed, active, skipped and reserved sessions stay fixed.</p>}
    </>}
    {step === 'destination' && item && <>
      <h1>Move {item.workout.name}</h1><p>Currently {dateLabel(item.scheduledDate)}. Choose a new date.</p>
      {error && <p role="alert" className="flexible-week-error">{error}</p>}
      {item.scheduledDate!==today && canUseWorkoutToday(state,{sessionId}) && <button className="text-button" onClick={()=>setUseToday(sessionId)}>Use this workout today</button>}
      {missedDestination ? <>
        {occupiedToday && <p className="sheet-footnote">Today already has {occupiedToday.workout.name}. {canUseWorkoutToday(state,{sessionId}) ? 'Use this workout today to choose where that session moves, or choose another date below.' : 'Choose another date below.'}</p>}
        {!occupiedToday && todayDestination?.reason && <p className="sheet-footnote">{todayDestination.reason}</p>}
        {validDates.includes(today) && <button className="text-button" data-move-date={today} onClick={()=>review({mode:'move',sessionId,toDate:today})}>Move to today</button>}
        {dateWeeks.length>0 && <p className="eyebrow">AVAILABLE DATES</p>}
        {dateWeeks.map(week=><section key={week} className="missed-date-group"><h2>{week===weekKey(today)?'This week':week===addCalendarDays(weekKey(today),7)?'Next week':`Week of ${dateLabel(week)}`}</h2><div className="flexible-week-dates">{Array.from({length:14},(_,i)=>addCalendarDays(today,i)).filter(date=>date!==today&&weekKey(date)===week).map(date=>{const occupied=sessions.find(s=>s.logicalSessionId!==sessionId&&s.scheduledDate===date&&s.status!=='skipped');return <button key={date} data-move-date={date} disabled={!validDates.includes(date)} aria-label={`${dateLabel(date)}${occupied?`, ${occupied.workout.name} already scheduled`:''}`} onClick={()=>review({mode:'move',sessionId,toDate:date})}>{dateLabel(date)}{occupied&&<small>{occupied.workout.name} · occupied</small>}</button>;})}</div></section>)}
        {!validDates.length && <p>No available dates in the next 14 days. Adjust the remaining week or skip this session.</p>}
      </> : <><button className="text-button" data-move-date={today} disabled={!todayDestination?.available} aria-describedby={!todayDestination?.available ? destinationReasonId : undefined} onClick={() => review({ mode: 'move', sessionId, toDate: today })}>Move to today</button>
      {!todayDestination?.available && <p id={destinationReasonId} className="sheet-footnote">{todayDestination?.reason}</p>}
      <div className="flexible-week-dates">{Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).map(d => {
        const occupied = sessions.some(s => s.logicalSessionId !== sessionId && s.scheduledDate === d && s.status !== 'skipped');
        return <button key={d} data-move-date={d} disabled={!validDates.includes(d)} aria-label={`${dateLabel(d)}${occupied ? ', another workout scheduled' : ''}`} onClick={() => review({ mode: 'move', sessionId, toDate: d })}>{dateLabel(d)}</button>;
      })}</div></>}
      {swapCandidates.length>0 && <button className="text-button" onClick={()=>setStep('swap')}>Swap with another workout</button>}
      <button className="text-button" onClick={() => setStep('available')}>Adjust remaining week</button>
      <button className="text-button" onClick={missedDestination ? skipMissed : () => review({ mode: 'skip', sessionId })}>Skip this session</button>
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
      {availabilityResult.status === 'insufficient-capacity' && !expandedAvailability && <div className="flexible-week-conflict-actions">
        <button className="text-button" onClick={() => { setExpandedAvailability(true); setStep('available'); }}>SHOW MORE DATES</button>
      </div>}
      <button className="button secondary" onClick={() => setStep('available')}>EDIT DAYS</button>
      <button className="button quiet" onClick={close}>{availabilityResult.status === 'no-change' ? 'DONE' : 'CANCEL'}</button>
    </>}
    {step === 'review' && proposal && <>
      <h1>{simpleSwap ? `Swap ${proposal.changes[0].name} and ${proposal.changes[1].name}?` : simpleMove ? `Move ${proposal.changes[0].name}?` : proposal.request.mode === 'restore' ? 'Restore the schedule?' : 'Review your schedule'}</h1>
      <p>Dates only. Your exercises and permanent plan stay unchanged.</p>
      <div className="flexible-week-review">{proposal.availabilitySchedule ? proposal.availabilitySchedule.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span><small>ORIGINAL</small> {dateLabel(c.fromDate)}</span><span><small>ADJUSTED</small> {dateLabel(c.toDate)}{c.fromDate === c.toDate ? ' · Unchanged' : ''}</span></article>) : proposal.changes.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span>{dateLabel(c.fromDate)} → {c.skipped ? 'Skipped this week' : dateLabel(c.toDate)}</span><small>{c.skipped ? 'No completed work or progression credit.' : weekKey(c.toDate) > weekKey(c.originalDate) ? 'Carried forward' : c.toDate === c.originalDate ? 'Original date restored' : 'Moved'}{c.blockWeekNumber ? ` · Program week ${c.blockWeekNumber}` : ''}</small></article>)}</div>
      {!proposal.changes.length && <p>Clear stale or past unstarted overrides. Completed and active sessions remain fixed.</p>}
      {proposal.changes.length > 0 && <p className="sheet-footnote">All other sessions keep their dates.{proposal.rejoinDate && ` Normal schedule resumes ${dateLabel(proposal.rejoinDate)}.`}</p>}
      {proposal.warnings.map(w => <p className="sheet-footnote" key={w}>{w}</p>)}
      {proposal.adaptationConflict && (proposal.request.mode === 'skip' ? <p className="sheet-footnote">Skipping also clears this session’s today-only adjustment.</p> : <fieldset className="flexible-adjustment-choice"><legend>This workout has a today-only adjustment.</legend>{[['restore', 'Restore original workout'], ['keep', 'Keep adjusted workout']].map(([value, label]) => <label key={value}><input type="radio" name="move-adjustment" checked={adaptationChoice === value} onChange={() => setAdaptationChoice(value)} />{label}</label>)}</fieldset>)}
      <SheetActionFooter className="flexible-week-footer">{error && <p role="alert" className="flexible-week-error">{error}</p>}<button className="button primary" onClick={apply}>{error && persistenceFailed ? 'TRY AGAIN' : simpleSwap ? 'SWAP WORKOUTS' : simpleMove ? 'APPLY MOVE' : 'USE THIS SCHEDULE'}</button><button className="button quiet" onClick={close}>CANCEL</button></SheetActionFooter>
    </>}
    {step==='done' && <><h1>Workout moved</h1><p role="status">{proposal.changes[0].name} moved to {dateLabel(proposal.changes[0].toDate)}.</p><p>Still uncompleted. Your permanent plan is unchanged.</p><button className="button primary" onClick={close}>DONE</button></>}
    {error && !['review','destination'].includes(step) && <p role="alert" className="flexible-week-error">{error}</p>}
  </main>;
}
