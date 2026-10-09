import {NavigationChevron} from './NavigationChevron.jsx';
import {missedRecoveryUndo,skipMissedOccurrence} from './missedWorkoutActions.js';
import {useMissedWorkoutFeedback} from './MissedWorkoutFeedback.jsx';
import {UseWorkoutTodaySheet} from './UseWorkoutTodaySheet.jsx';
import {canUseWorkoutToday} from './useWorkoutToday.js';
import {useCalendarDay} from './useCalendarDay.js';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {FlexibleWeekReorder} from './FlexibleWeekReorder.jsx';
import {flexibleReorderRows} from './flexibleWeek.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { useSheetBack } from './useSheetBack.js';
import { focusNavigationTarget } from './navigationFocus.js';
import { buildCombinedProposal, combineFingerprint } from './combineWorkouts.js';
import { CoachCombineCard } from './CoachCombine.jsx';
import { isoDay, saveState, weekKey, weekday,calendarDate } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, flexibleSessions, flexibleSessionById, flexibleWeekConflict, flexibleReviewFingerprint, temporaryScheduleReview, proposeFlexibleWeek, missedFlexibleSessions, moveWorkoutCandidates, moveWorkoutDestinations, remainingPlanWeekDates } from './flexibleWeek.js';
import {hasMoveWorkoutDestination,temporaryScheduleRestoreScope,temporaryScheduleRejoinDate} from './flexibleWeek.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import './flexibleWeekChooser.css';

const dateLabel = date => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
const profileWeekBaseline=(state,dates,sessions)=>dates.filter(date=>Array.isArray(state.profile?.availableDays) &&
  state.profile.availableDays.includes(weekday(calendarDate(date))) && !sessions.some(s=>['active','completed'].includes(s.status) && s.scheduledDate===date));
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
export function FlexibleWeekSheet({ state, update, close, Header, request = {}, setDetail, onBack }) {
  const feedback=useMissedWorkoutFeedback();
  const [useToday,setUseToday]=useState(null);
  const today = useCalendarDay(), sessions = useMemo(()=>flexibleSessions(state,today),[state,today]);
  const remainingWeekDates = remainingPlanWeekDates(today);
  const missed = useMemo(()=>missedFlexibleSessions(state,today),[state,today]);
  const initialSessionId = request.sessionId || (request.missed && missed.length===1 ? missed[0].logicalSessionId : null);
  const initialSwap = request.swap && request.otherSessionId ? proposeFlexibleWeek(state,{mode:'swap',sessionId:request.sessionId,otherSessionId:request.otherSessionId},today) : null;
  const [steps, setSteps] = useState(initialSwap?.status==='ready' ? ['mode','swap','review'] : request.reviewExisting ? ['mode','existing'] : initialSessionId ? ['mode', request.swap ? 'swap' : !request.destination && missed.some(s=>s.logicalSessionId===initialSessionId) ? 'recovery' : 'destination'] : request.missed ? ['mode','missed'] : request.move ? ['pick'] : ['mode']);
  const step = steps.at(-1);
  const setStep = next => setSteps(current => {
    const existing = current.lastIndexOf(next);
    return existing >= 0 ? current.slice(0, existing + 1) : [...current, next];
  });
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [available, setAvailable] = useState(()=>profileWeekBaseline(state,remainingWeekDates,sessions));
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [resolutions,setResolutions]=useState([]);
  const [workoutOrder,setWorkoutOrder]=useState(null);
  const [combinedProposal,setCombinedProposal]=useState(null);
  const [resolutionSessionId,setResolutionSessionId]=useState(null);
  const [combinePreview,setCombinePreview]=useState(null);
  const availabilityRequest=useMemo(()=>({mode:'available',availableDates:available,dateScope:'current-week',resolutions,
    ...(combinedProposal?{combinedProposal}:{}),...(workoutOrder?{workoutOrder}:{})}),[available,resolutions,combinedProposal,workoutOrder]);
  const availabilityPreview = useMemo(()=>['available','review'].includes(step) ? proposeFlexibleWeek(state,
    availabilityRequest,today) : null,[state,today,availabilityRequest,step]);
  const canReviewSchedule = Boolean(availabilityPreview?.remainingSessions);
  const [proposal, setProposal] = useState(initialSwap?.status==='ready' ? initialSwap : null);
  const [error, setError] = useState('');
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const [adaptationChoice, setAdaptationChoice] = useState('restore');
  const applied = useRef(false);
  const screenRef = useRef(null);
  const returnAction = useRef(null);
  const previousView = useRef({step,useToday});
  const staleAvailabilityReview=()=>proposal?.availabilitySchedule && (proposal.today!==today || proposal.fingerprint!==flexibleReviewFingerprint(state) ||
    proposal.request.combinedProposal && proposal.request.combinedProposal.fingerprint!==combineFingerprint(state));
  const reorderRows=staleAvailabilityReview()?[]:flexibleReorderRows(proposal);
  useEffect(()=>{
    if(step==='reorder' && !reorderRows.length){
      setStep('review');setError('The plan or sessions changed. Review the schedule again.');
    }
  },[step,state,today,proposal]);
  const reorderWorkouts=order=>{
    if(staleAvailabilityReview()) {setStep('review');setError('The plan or sessions changed. Review the schedule again.');return false;}
    const result=proposeFlexibleWeek(state,{...proposal.request,workoutOrder:order},today);
    if(result.status!=='ready'){setError(result.error);setStep('review');return false;}
    setWorkoutOrder(order);setProposal(result);setError('');return true;
  };
  const editDays=()=>{
    if(staleAvailabilityReview()){
      setResolutions([]);setWorkoutOrder(null);setCombinedProposal(null);setProposal(null);setResolutionSessionId(null);
      setAvailable(profileWeekBaseline(state,remainingWeekDates,sessions));setSteps(['mode','available']);
    }else setStep('available');
    setError('');
  };
  const goBack = () => {
    if(onBack && steps.length<=2){onBack();return;}
    const parent=steps.at(-2);
    if(parent==='available' && staleAvailabilityReview()){editDays();return;}
    if(parent==='review')setResolutionSessionId(null);
    if(parent==='recovery')returnAction.current=step==='destination'?'move':'more';
    setSteps(current => current.length > 1 ? current.slice(0, -1) : current); setError('');
  };
  useSheetBack(screenRef, step, steps.at(-2), goBack);
  useLayoutEffect(() => {
    const changed=previousView.current.step!==step || previousView.current.useToday!==useToday;
    previousView.current={step,useToday};
    const screen=screenRef.current;
    if(!screen)return;
    screen.scrollTop=0;
    if(changed)focusNavigationTarget(step==='existing' && request.focusSessionId
      ? [...screen.querySelectorAll('[data-session-id]')].find(node=>node.dataset.sessionId===request.focusSessionId)
      : screen.querySelector(step==='recovery' && returnAction.current ? `[data-recovery-action="${returnAction.current}"]` : '.detail-header-back') || screen.querySelector('button'));
    returnAction.current=null;
  }, [step,useToday]);
  const item = useMemo(()=>sessionId ? flexibleSessionById(state,sessionId,today) : null,[state,sessionId,today]);
  const missedDestination = step==='destination' && item?.status==='missed';
  const recoveryView = ['recovery','more'].includes(step);
  const selectSession = session => {setResolutionSessionId(null);setSessionId(session.logicalSessionId);setStep(session.status==='missed'?'recovery':'destination');};
  // More options is a disclosure, not an extra navigation level for its children.
  const openRecoveryOption = next => {setError('');setSteps(current=>[...current.slice(0,current.lastIndexOf('recovery')+1),next]);};
  const resolutionMove=step==='destination' && Boolean(resolutionSessionId);
  const destinations = useMemo(() => step === 'destination' ? moveWorkoutDestinations(state,sessionId,today,resolutionSessionId?availabilityRequest:null) : [], [state,sessionId,today,step,resolutionSessionId,availabilityRequest]);
  const validDates = destinations.filter(destination=>destination.available).map(destination=>destination.date);
  const todayDestination = destinations.find(destination=>destination.date===today);
  const destinationReasonId = useId();
  const dateWeeks = [...new Set(validDates.map(date=>weekKey(date)))];
  const candidates = useMemo(()=>['mode','pick'].includes(step) ? moveWorkoutCandidates(state,today) : [],[state,today,step]);
  const canMove = useMemo(()=>item && ['recovery','more'].includes(step) && hasMoveWorkoutDestination(state,sessionId,today),[state,item,sessionId,today,step]);
  const canTrainToday = useMemo(()=>item && canUseWorkoutToday(state,{sessionId},today),[state,item,sessionId,today]);
  const existingReview = useMemo(()=>temporaryScheduleReview(state),[state,today]);
  const eligibleMissed=useMemo(()=>missed.filter(item=>proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId},today).status==='ready'),[state,today,missed]);
  const hasMissed = eligibleMissed.length > 0;
  const canAdjustWeek=useMemo(()=>Boolean(proposeFlexibleWeek(state,{mode:'available',availableDates:remainingPlanWeekDates(today),dateScope:'current-week'},today).remainingSessions),[state,today]);
  const remainingMoves=useMemo(()=>step==='available'&&!canAdjustWeek?moveWorkoutCandidates(state,today):[],[state,today,step,canAdjustWeek]);
  const restoreScope=useMemo(()=>temporaryScheduleRestoreScope(state,today),[state,today]);
  const rejoinDate=useMemo(()=>temporaryScheduleRejoinDate(state,today),[state,today]);
  const combinedSchedule=combinedAdjustment(state);
  const existingChangeCount=existingReview.items.length+(combinedSchedule?1:0);
  const skippedLabel=date=>weekKey(date)===weekKey(today)?'Skipped this week':'Skipped this occurrence';
  const openRestore=()=>{const next=proposeFlexibleWeek(state,{mode:'restore'},today);if(next.status!=='ready'){setError(next.error);return;}setProposal(next);setError('');setStep('restore-confirm');};
  const swapCandidates = useMemo(()=>item && ['more','swap','destination'].includes(step) ? sessions.filter(s=>proposeFlexibleWeek(state,{mode:'swap',sessionId,otherSessionId:s.logicalSessionId},today).status==='ready') : [],[state,today,item,step,sessions,sessionId]);
  const simpleSwap = proposal?.request.mode === 'swap';
  const simpleMove = proposal?.request.mode === 'move' && !proposal.adaptationConflict;
  const resolutionRow=proposal?.availabilitySchedule?.find(c=>c.logicalSessionId===resolutionSessionId);
  const combineOptions=useMemo(()=>{
    if(!proposal?.availabilitySchedule || !available.includes(today) || combinedProposal)return [];
    const rows=proposal.availabilitySchedule.filter(c=>!c.resolution);
    return rows.flatMap((first,index)=>rows.slice(index+1).flatMap(second=>{
      if(first.toDate && second.toDate)return [];
      const result=buildCombinedProposal(state,{sourceIds:[first.logicalSessionId,second.logicalSessionId],minutes:null,date:today});
      return result.status==='ready'?[result.proposal]:[];
    }));
  },[state,proposal,available,today,combinedProposal]);
  const changeResolution=(nextResolutions,nextCombined=combinedProposal)=>{
    const result=proposeFlexibleWeek(state,{...availabilityRequest,workoutOrder:null,resolutions:nextResolutions,combinedProposal:nextCombined},today);
    if(!['ready','insufficient-capacity'].includes(result.status)){setError(result.error);return false;}
    setResolutions(nextResolutions);setWorkoutOrder(null);setCombinedProposal(nextCombined);setProposal(result);setResolutionSessionId(null);setError('');setStep('review');return true;
  };
  const chooseDestination=date=>{
    if(resolutionMove){changeResolution([...resolutions.filter(r=>r.sessionId!==sessionId),{mode:'move',sessionId,toDate:date}]);return;}
    review({mode:'move',sessionId,toDate:date});
  };
  const openResolution=(id,next)=>{setResolutionSessionId(id);setSessionId(id);setError('');setStep(next);};
  const openCombine=id=>{
    setResolutionSessionId(id);setError('');
    const options=combineOptions.filter(p=>p.sourceSessions.some(s=>s.logicalSessionId===id));
    if(options.length===1){setCombinePreview(options[0]);setStep('combine-preview');}
    else setStep('combine-choice');
  };
  const review = action => {
    setResolutionSessionId(null);
    setError(''); const result = action.mode==='available' ? availabilityPreview : proposeFlexibleWeek(state, action, today);
    if (action.mode === 'available' && !result.availabilitySchedule?.length) { setAvailabilityResult(result); setStep('availability-result'); return; }
    if (action.mode === 'available') {setProposal(result);setStep('review');return;}
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
    if(feedback?.scheduleApplied){feedback.scheduleApplied(state,result.state);close();return;}
    if(item?.status==='missed' && proposal.request.mode==='move' && feedback) {
      feedback.applied({message:`${item.workout.name} moved to ${dateLabel(proposal.request.toDate)}`,undo:missedRecoveryUndo(state,result.state,sessionId)});
      close();return;
    }
    if(simpleMove)setStep('done');else close();
  };
  const skipMissed = () => {
    if (applied.current || item?.status !== 'missed') return;
    setError('');
    try {
      const result=skipMissedOccurrence(state,sessionId);
      applied.current=true;
      update(()=>result.state,{persistedState:result.state});
      feedback?.applied({message:`${item.workout.name} skipped`,undo:result.undo});
    } catch(error) { setError(error.message); return; }
    close();
  };
  const invalidSelection=!applied.current && sessionId && ['recovery','more','destination','swap'].includes(step) && (!item || !['planned','missed','optional'].includes(item.status));
  const reviewCurrentSchedule=()=>{setUseToday(null);setSessionId(null);setProposal(null);setSteps(['mode']);setError('');};
  // A stale Move source must never be rerouted into an unrelated Train Today
  // error sheet. Recover to the current schedule without mutating any history.
  if(invalidSelection)return <main className="screen detail-screen flexible-week-sheet">
    <Header title="Adjust week" onClose={close} onBack={reviewCurrentSchedule}/>
    <p role="status">This workout is no longer available to reschedule.</p>
    <button className="button secondary" onClick={reviewCurrentSchedule}>Review current schedule</button>
  </main>;
  if(useToday)return <UseWorkoutTodaySheet state={state} update={update} close={close} Header={Header} setDetail={setDetail} className={steps.includes('recovery')?'missed-recovery-today':''} request={{sessionId:useToday}} onBack={()=>{setUseToday(null);returnAction.current='train';setError('');}}/>;
  return <main ref={screenRef} className={`screen detail-screen flexible-week-sheet${missedDestination?' content-fit-screen missed-destination-sheet':''}${recoveryView?' content-fit-screen missed-recovery-sheet':''}${['skip-confirm','restore-confirm','existing','mode'].includes(step)?' content-fit-screen flexible-compact-sheet':''}`}>
    <Header title={step==='restore-confirm'?'Restore original schedule':step==='existing'?'Temporary schedule':step==='more'?'More options':recoveryView?'Missed workout':missedDestination?'Move workout':request.move ? 'Move a workout' : 'Adjust week'} onClose={close} onBack={step!=='done' && steps.length > 1 ? goBack : undefined} />
    {!recoveryView && !missedDestination && !['existing','restore-confirm'].includes(step) && <p className="eyebrow">{step==='pick'?'MOVE A WORKOUT':'TEMPORARY SCHEDULE'}</p>}
    {step==='recovery' && item && <>
      <h1>{item.workout.name}</h1><p>Missed · {dateLabel(item.scheduledDate)}</p>
      <div className="missed-recovery-actions">
        {canTrainToday && <button className="button primary" data-recovery-action="train" onClick={()=>setUseToday(sessionId)}>TRAIN TODAY</button>}
        {canMove && <button className="button secondary" data-recovery-action="move" onClick={()=>setStep('destination')}>MOVE TO ANOTHER DAY</button>}
        <button className="text-button" data-recovery-action="more" onClick={()=>setStep('more')}>More options</button>
      </div>
    </>}
    {step==='more' && item && <>
      <h1>{item.workout.name}</h1><p>Missed · {dateLabel(item.scheduledDate)}</p>
      <div className="missed-recovery-options">
        {swapCandidates.length>0 && <button className="list-row" onClick={()=>openRecoveryOption('swap')}>Swap with another workout<NavigationChevron/></button>}
        {canAdjustWeek&&<button className="list-row" onClick={()=>openRecoveryOption('available')}>Adjust remaining week<NavigationChevron/></button>}
        <button className="list-row" onClick={skipMissed}>Skip this session</button>
      </div>
    </>}
    {step === 'mode' && <>
      <h1>What changed?</h1>
      <p>Make temporary changes. Keep your plan.</p>
      {flexibleWeekConflict(state) && <p role="status">Your plan changed. Clear the old temporary schedule before adjusting again. Completed and active workouts stay fixed.</p>}
      <div className="adjust-option-list">
        {existingChangeCount>0 && <button className="choice-row" onClick={()=>setStep('existing')}><strong>{existingReview.unresolved.length ? 'Review temporary schedule' : 'View current schedule'}</strong><small>{existingReview.unresolved.length ? `${existingReview.unresolved.length} need attention` : `${existingChangeCount} ${existingChangeCount===1?'change':'changes'}`}</small></button>}
        {hasMissed&&<button className="choice-row" onClick={() => { if(eligibleMissed.length===1)selectSession(eligibleMissed[0]);else setStep('missed'); }}><strong>I missed a workout</strong><small>Move or skip an unstarted session.</small></button>}
        {canAdjustWeek&&<button className="choice-row" onClick={() => setStep('available')}><strong>My available days changed</strong><small>Rearrange workouts through this Sunday.</small></button>}
        {candidates.length>0 && <button className="choice-row" onClick={() => setStep('pick')}><strong>Move a workout</strong><small>Choose one session and another date.</small></button>}
      </div>
      {!hasMissed&&!canAdjustWeek&&!candidates.length&&!existingChangeCount&&<p role="status">Your schedule is already set. No unstarted workouts can be changed right now.</p>}
    </>}
    {step === 'existing' && <>
      <h1>Temporary schedule</h1>
      <p>{existingChangeCount} {existingChangeCount===1?'change':'changes'}</p>
      {existingReview.unresolved.length>0&&<p role="status">{existingReview.unresolved.length} {existingReview.unresolved.length===1?'workout needs':'workouts need'} attention.</p>}
      <div className="flexible-week-review flexible-schedule-changes">{existingReview.items.map(entry=><article key={entry.id} data-session-id={entry.id} tabIndex={-1}>
        <small className="eyebrow">{entry.issue?'NEEDS ATTENTION':entry.skipped?'SKIPPED':'MOVED'}</small>
        <strong>{entry.name}</strong>
        <span>{entry.skipped?dateLabel(entry.originalDate):<>{dateLabel(entry.originalDate)} <span aria-label="to">→</span> {dateLabel(entry.scheduledDate)}</>}</span>
        {entry.skipped&&entry.scheduledDate!==entry.originalDate&&<small>Last scheduled {dateLabel(entry.scheduledDate)}</small>}
        {entry.issue && <small>{entry.issue}</small>}
      </article>)}{combinedSchedule&&<article>
        <small className="eyebrow">COMBINED</small><strong>{combinedSchedule.workout.name}</strong>
        {combinedSchedule.sourceSessions.map(source=><span key={source.logicalSessionId}>{source.name} · {dateLabel(source.originalDate)} → {dateLabel(combinedSchedule.date)}</span>)}
        <small>Source workouts stay reserved until the combined workout ends or is canceled.</small>
      </article>}</div>
      <p className="sheet-footnote">All other workouts keep their dates.{rejoinDate&&` Normal schedule resumes ${dateLabel(rejoinDate)}.`}</p>
      <SheetActionFooter className="flexible-week-footer">
        <button className="button secondary" disabled={!hasMissed&&!canAdjustWeek&&!moveWorkoutCandidates(state,today).length} onClick={()=>setSteps(['mode'])}>EDIT SCHEDULE</button>
        <button className="text-button flexible-restore-action" disabled={!restoreScope.removable.length} onClick={openRestore}>Restore original schedule</button>
        {!restoreScope.removable.length&&<p className="sheet-footnote">Past, completed and active changes stay unchanged.</p>}
      </SheetActionFooter>
    </>}
    {step==='restore-confirm'&&<>
      <h1>Restore original schedule?</h1>
      <p>This removes your temporary schedule changes. Completed workouts and workout history stay unchanged.</p>
      {restoreScope.retained.length>0&&<p className="sheet-footnote">Past, completed, active and already-resolved changes stay in place. Only safely restorable future workouts return to their original dates.</p>}
      {proposal?.status!=='ready'&&<p role="status">{proposal?.error}</p>}
      {proposal?.adaptationConflict&&<p className="sheet-footnote">The affected today-only adjustment will be cleared.</p>}
      <SheetActionFooter className="flexible-week-footer">
        {error&&<p role="alert">{error}</p>}
        <button className="button primary" disabled={proposal?.status!=='ready'||!restoreScope.removable.length} onClick={apply}>RESTORE ORIGINAL SCHEDULE</button>
        <button className="button quiet" data-sheet-initial-focus onClick={goBack}>KEEP TEMPORARY SCHEDULE</button>
      </SheetActionFooter>
    </>}
    {['pick', 'missed'].includes(step) && <>
      <h1>{step === 'missed' ? 'Choose a missed session' : 'Choose a workout'}</h1>
      {step === 'pick' ? <>
        <p>Select a missed or upcoming workout to move.</p>
        <div className="flexible-workout-list">{groupRescheduleCandidates(candidates).map(group=><section className="flexible-workout-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.sessions.map(s=><button className="list-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>selectSession(s)}>
            <span><strong>{s.workout.name}</strong><small>{s.status==='missed'?'Missed · ':''}{dateLabel(s.scheduledDate)}{s.moved?` · Originally ${dateLabel(s.originalDate)}`:''}</small></span><NavigationChevron/>
          </button>)}
        </section>)}</div>
      </> : <div className="adjust-option-list missed-session-choices">{eligibleMissed.map(s => <button className="choice-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={() => selectSession(s)}><strong>{s.workout.name}</strong><small>Missed · {dateLabel(s.scheduledDate)}</small>{s.moved&&<small>Originally scheduled for {dateLabel(s.originalDate)}</small>}</button>)}</div>}
      {step==='pick' ? !candidates.length && <p role="status">No missed or upcoming workouts can be moved.</p> : !missed.length && <p>No unstarted sessions need moving.</p>}
    </>}
    {step === 'swap' && item && <>
      <h1>Swap with another workout</h1><p>{item.workout.name} · {dateLabel(item.scheduledDate)}</p>
      <div className="adjust-option-list">{swapCandidates.map(s=><button className="choice-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>review({mode:'swap',sessionId,otherSessionId:s.logicalSessionId})}><strong>{s.workout.name}</strong><small>{dateLabel(s.scheduledDate)}</small></button>)}</div>
      {!swapCandidates.length && <p>No eligible workouts to swap. Completed, active, skipped and reserved sessions stay fixed.</p>}
    </>}
    {step === 'destination' && item && <>
      <h1>Move {item.workout.name}</h1><p>{missedDestination ? `From ${dateLabel(item.scheduledDate)}` : `Currently ${dateLabel(item.scheduledDate)}. Choose a new date.`}</p>
      {error && <p role="alert" className="flexible-week-error">{error}</p>}
      {missedDestination ? <>
        {dateWeeks.length>0 && <p className="eyebrow">AVAILABLE DATES</p>}
        {dateWeeks.map(week=><section key={week} className="missed-date-group"><h2>{week===weekKey(today)?'This week':week===addCalendarDays(weekKey(today),7)?'Next week':`Week of ${dateLabel(week)}`}</h2><div className="flexible-week-dates">{validDates.filter(date=>weekKey(date)===week).map(date=><button key={date} data-move-date={date} aria-pressed={proposal?.request.mode==='move' && proposal.request.sessionId===sessionId && proposal.request.toDate===date} onClick={()=>chooseDestination(date)}>{dateLabel(date)}</button>)}</div></section>)}
        {!validDates.length && <><p role="status">No available dates in the next 14 days.</p><button className="button secondary" onClick={()=>setStep('more')}>Review other options</button></>}
      </> : <>
      {!todayDestination?.available && <p id={destinationReasonId} className="sheet-footnote">Today: {todayDestination?.reason}</p>}
      <div className="flexible-week-dates">{Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).map(d => {
        const occupied = sessions.some(s => s.logicalSessionId !== sessionId && s.scheduledDate === d && s.status !== 'skipped');
        return <button key={d} data-move-date={d} disabled={!validDates.includes(d)} aria-label={`${dateLabel(d)}${occupied ? ', another workout scheduled' : ''}`} aria-describedby={d===today&&!todayDestination?.available?destinationReasonId:undefined} onClick={() => chooseDestination(d)}>{dateLabel(d)}</button>;
      })}</div></>}
      {!missedDestination && !resolutionMove && <>{swapCandidates.length>0 && <button className="text-button" onClick={()=>setStep('swap')}>Swap with another workout</button>}
      {canAdjustWeek&&<button className="text-button" onClick={() => setStep('available')}>Adjust remaining week{item.originalDate>addCalendarDays(weekKey(today),6)?' (through this Sunday)':''}</button>}
      <button className="text-button" onClick={() => review({ mode: 'skip', sessionId })}>Skip this session</button></>}
    </>}
    {step === 'available' && !canAdjustWeek && <>
      <h1>Your remaining week is already set</h1>
      <p role="status">{availabilityPreview?.error||'No unstarted workouts remain to rearrange through this Sunday.'}</p>
      {remainingMoves.length>0&&<><p>Move a workout if you want to change another session.</p><button className="button secondary" onClick={()=>{setSessionId(null);setResolutionSessionId(null);setSteps(['mode','pick']);}}>MOVE A WORKOUT</button></>}
      <button className="button quiet" onClick={close}>CLOSE</button>
    </>}
    {step === 'available' && canAdjustWeek && <>
      <h1>When can you train this week?</h1><p>Choose from today through Sunday for the workouts remaining in this plan week.</p>
      <p className="flexible-availability-note">Your profile availability stays unchanged.</p>
      <section>
        <p className="eyebrow">REMAINING THIS WEEK</p>
        <div className="flexible-week-dates flexible-availability-dates">{remainingWeekDates.map(d => {
          const scheduled = sessions.find(s => s.scheduledDate === d && s.status !== 'skipped');
          return <button key={d} data-available-date={d} aria-label={dateLabel(d)} aria-pressed={available.includes(d)} className={available.includes(d) ? 'is-selected' : ''} disabled={sessions.some(s => ['active', 'completed'].includes(s.status) && s.scheduledDate === d)} onClick={() => {setWorkoutOrder(null);if(combinedProposal?.date===d && available.includes(d))setCombinedProposal(null);setAvailable(list => list.includes(d) ? list.filter(x => x !== d) : [...list, d]);}}><span>{dateLabel(d)}</span>{scheduled && <small>{scheduled.workout.name}</small>}</button>;
        })}</div>
      </section>
      <p className="flexible-availability-note" role="status">{availabilityPreview?.remainingSessions
        ? availabilityPreview.unresolvedCount ? `${availabilityPreview.placedCount} of ${availabilityPreview.remainingSessions} ${availabilityPreview.remainingSessions===1?'workout':'workouts'} resolved · ${availabilityPreview.unresolvedCount} still ${availabilityPreview.unresolvedCount===1?'needs':'need'} a day.`
          : `${availabilityPreview.remainingSessions} ${availabilityPreview.remainingSessions===1?'workout':'workouts'} · ${available.length} selected ${available.length===1?'day':'days'}`
        : availabilityPreview?.message || availabilityPreview?.error}</p>
      {availabilityPreview?.unresolvedCount>0 && <p className="flexible-availability-note">Review to move later, combine where possible, or skip a workout.</p>}
      <button className="button primary" disabled={!canReviewSchedule} onClick={() => review({ mode: 'available' })}>REVIEW SCHEDULE</button>
    </>}
    {step === 'availability-result' && availabilityResult && <>
      <h1>{availabilityResult.status === 'no-change' ? 'No workouts to rearrange' : 'Review these dates'}</h1>
      <p role="status">{availabilityResult.message || availabilityResult.error}</p>
      <button className="button secondary" onClick={() => setStep('available')}>EDIT DAYS</button>
      <button className="button quiet" onClick={close}>{availabilityResult.status === 'no-change' ? 'DONE' : 'CANCEL'}</button>
    </>}
    {step === 'review' && proposal && <>
      <h1>{simpleSwap ? `Swap ${proposal.changes[0].name} and ${proposal.changes[1].name}?` : simpleMove ? `Move ${proposal.changes[0].name}?` : proposal.request.mode === 'restore' ? 'Restore the schedule?' : 'Review your schedule'}</h1>
      <p>{proposal.request.combinedProposal?'Your combined workout is temporary. Your permanent plan stays unchanged.':'Temporary changes only. Your exercises and permanent plan stay unchanged.'}</p>
      <div className="flexible-week-review">{proposal.availabilitySchedule ? proposal.availabilitySchedule.map(c => <article key={c.logicalSessionId} data-session-id={c.logicalSessionId}>
        <strong>{c.name}</strong><span><small>ORIGINAL</small> {dateLabel(c.originalDate)}</span>{c.fromDate!==c.originalDate && <span><small>CURRENT</small> {dateLabel(c.fromDate)}</span>}
        <span className={!c.toDate&&!c.skipped?'flexible-needs-day':''}>{c.skipped?skippedLabel(c.originalDate):c.combined?`Combined · ${dateLabel(c.toDate)}`:c.toDate?`${dateLabel(c.toDate)}${c.fromDate===c.toDate?' · Unchanged':''}`:'Needs a day'}</span>
        {c.skipped && <small>No completed work or progression credit.</small>}
        {!c.toDate && !c.skipped && <div className="flexible-resolution-actions" aria-label={`Resolve ${c.name}`}>
          <button className="flexible-move-later" onClick={()=>openResolution(c.logicalSessionId,'destination')}>MOVE LATER <span aria-hidden="true">›</span></button>
          {combineOptions.some(p=>p.sourceSessions.some(s=>s.logicalSessionId===c.logicalSessionId)) && <button className="text-button" onClick={()=>openCombine(c.logicalSessionId)}>Combine with another workout</button>}
          <button className="text-button" onClick={()=>openResolution(c.logicalSessionId,'skip-confirm')}>Skip this workout</button>
        </div>}
        {c.resolution && <button className="text-button flexible-resolution-edit" aria-label={`Change resolution for ${c.name}`} onClick={()=>changeResolution(resolutions.filter(r=>r.sessionId!==c.logicalSessionId),c.combined?null:combinedProposal)}>Change</button>}
      </article>) : proposal.changes.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span>{dateLabel(c.fromDate)} → {c.skipped ? skippedLabel(c.originalDate) : dateLabel(c.toDate)}</span><small>{c.skipped ? 'No completed work or progression credit.' : weekKey(c.toDate) > weekKey(c.originalDate) ? 'Carried forward' : c.toDate === c.originalDate ? 'Original date restored' : 'Moved'}{c.blockWeekNumber ? ` · Program week ${c.blockWeekNumber}` : ''}</small></article>)}</div>
      {combinedProposal && <button className="text-button" onClick={()=>{setCombinePreview(combinedProposal);setStep('combine-preview');}}>Review combined workout</button>}
      {proposal.dateConflicts?.map(conflict=><p className="sheet-footnote" key={conflict.date}>{dateLabel(conflict.date)} already has {conflict.name}. That workout stays in place; this date is not used.{proposal.unresolvedCount>0?' Choose another date.':''}</p>)}
      {!proposal.changes.length && !proposal.availabilitySchedule && <p>Clear stale or past unstarted overrides. Completed and active sessions remain fixed.</p>}
      {proposal.changes.length > 0 && <p className="sheet-footnote">All other workouts keep their dates.{proposal.rejoinDate && ` Normal schedule resumes ${dateLabel(proposal.rejoinDate)}.`}</p>}
      {proposal.warnings.map(w => <p className="sheet-footnote" key={w}>{w}</p>)}
      {proposal.adaptationConflict && (proposal.request.mode === 'skip' ? <p className="sheet-footnote">Skipping also clears this session’s today-only adjustment.</p> : <fieldset className="flexible-adjustment-choice"><legend>This workout has a today-only adjustment.</legend>{[['restore', 'Restore original workout'], ['keep', 'Keep adjusted workout']].map(([value, label]) => <label key={value}><input type="radio" name="move-adjustment" checked={adaptationChoice === value} onChange={() => setAdaptationChoice(value)} />{label}</label>)}</fieldset>)}
      <SheetActionFooter className="flexible-week-footer" separate={Boolean(proposal.unresolvedCount)}>{error && <p role="alert" className="flexible-week-error">{error}</p>}
        {proposal.unresolvedCount>0 && <p role="status">{proposal.unresolvedCount} {proposal.unresolvedCount===1?'workout still needs':'workouts still need'} a date.</p>}
        {proposal.availabilitySchedule && <div className="flexible-review-controls"><button className="button quiet" onClick={editDays}>EDIT DAYS</button><button className="button quiet" onClick={close}>CANCEL</button></div>}
        {reorderRows.length>0 && <button className="text-button flexible-reorder-action" onClick={()=>{setError('');setStep('reorder');}}>Reorder workouts <NavigationChevron/></button>}
        <button className={`button ${proposal.unresolvedCount?'secondary':'primary'}`} disabled={proposal.status!=='ready' || proposal.canApplySchedule===false} onClick={apply}>{error && persistenceFailed ? 'TRY AGAIN' : simpleSwap ? 'SWAP WORKOUTS' : simpleMove ? 'APPLY MOVE' : 'USE THIS SCHEDULE'}</button>{!proposal.availabilitySchedule && <button className="button quiet" onClick={close}>CANCEL</button>}</SheetActionFooter>
    </>}
    {step==='reorder' && reorderRows.length>0 && <>
      <h1>Reorder workouts</h1>
      <FlexibleWeekReorder rows={reorderRows} identity={proposal.fingerprint} scrollRef={screenRef} onReorder={reorderWorkouts}/>
      <SheetActionFooter><button className="button primary" onClick={()=>setStep('review')}>REVIEW SCHEDULE</button></SheetActionFooter>
    </>}
    {step==='skip-confirm' && resolutionRow && <div className="flexible-skip-confirm">
      <h1>Skip {resolutionRow.name} this week?</h1>
      <p>This skips only this scheduled workout. Your plan and future {resolutionRow.name} workouts stay unchanged.</p>
      <button className="button secondary" onClick={()=>changeResolution([...resolutions.filter(r=>r.sessionId!==resolutionSessionId),{mode:'skip',sessionId:resolutionSessionId}])}>SKIP WORKOUT</button>
      <button className="button quiet" data-sheet-initial-focus onClick={()=>setStep('review')}>KEEP IT</button>
    </div>}
    {step==='combine-choice' && <><h1>Combine with which workout?</h1><p>Choose a compatible workout for {dateLabel(today)}.</p>
      <div className="flexible-combine-choices">{combineOptions.filter(p=>p.sourceSessions.some(s=>s.logicalSessionId===resolutionSessionId)).map(p=>{
        const other=p.sourceSessions.find(s=>s.logicalSessionId!==resolutionSessionId);
        return <button className="list-row" key={other.logicalSessionId} onClick={()=>{setCombinePreview(p);setStep('combine-preview');}}>{other.name}<NavigationChevron/></button>;
      })}</div>
    </>}
    {step==='combine-preview' && combinePreview && <><h1>Combined session preview</h1><p>{dateLabel(combinePreview.date)} · ~{Math.round(combinePreview.estimatedMinutes)} min</p>
      <CoachCombineCard key={combinePreview.id} state={state} action={{proposal:combinePreview}} initialReviewing draftSchedule
        onAccept={({proposal:combined})=>{if(!changeResolution(resolutions,combined))throw new Error('The schedule changed. Review the workouts again.');}} onReviewCancelled={cancelled=>{if(cancelled)setStep('review');}}/>
    </>}
    {step==='done' && <><h1>Workout moved</h1><p role="status">{proposal.changes[0].name} moved to {dateLabel(proposal.changes[0].toDate)}.</p><p>Still uncompleted. Your permanent plan is unchanged.</p><button className="button primary" onClick={close}>DONE</button></>}
    {error && !['review','destination','restore-confirm'].includes(step) && <p role="alert" className="flexible-week-error">{error}</p>}
  </main>;
}
