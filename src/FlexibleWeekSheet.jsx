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
import { addCalendarDays, applyFlexibleWeek, createFlexibleWeekPlanner, flexibleSessionById, flexibleWeekConflict, flexibleReviewFingerprint, temporaryScheduleReview, proposeFlexibleWeek, missedFlexibleSessions, moveWorkoutDestinations, remainingPlanWeekDates } from './flexibleWeek.js';
import {linkedScheduleChanges,temporaryScheduleRestoreScope,temporaryScheduleRejoinDate} from './flexibleWeek.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import './flexibleWeekChooser.css';
import {reviewScheduleRecovery,applyScheduleRecovery,scheduleRecoveryIsCurrent} from './scheduleRecovery.js';
import {useDurableAction} from './useDurableAction.js';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {displayWeight,exerciseMeasure,exerciseName,weightUnit} from './domain.js';
import {ReviewDetails} from './ReviewDetails.jsx';

const dateLabel = date => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
function RecoveryWorkoutPreview({workout,label,units}) {
  if(!workout?.exercises?.length)return null;
  return <AnimatedDetails><summary>{label} · {workout.exercises.length} {workout.exercises.length===1?'exercise':'exercises'}</summary>
    <ul>{workout.exercises.map(e=>{
      const reps=e.repMin?` × ${e.repMin}${e.repMax!=null&&e.repMax!==e.repMin?`–${e.repMax}`:''}${exerciseMeasure(e)==='seconds'?' sec':''}`:'';
      const weights=e.sets.map(set=>Number.isFinite(set.weight)?displayWeight(set.weight,units):'—');
      const loads=weights.some(weight=>weight!=='—')?` · ${new Set(weights).size===1?weights[0]:weights.join(' / ')} ${weightUnit(units)}`:'';
      return <li key={e.id}><strong>{exerciseName(e)}</strong> · {reps?`${e.sets.length}${reps}`:`${e.sets.length} ${e.sets.length===1?'set':'sets'}`}{loads}</li>;
    })}</ul></AnimatedDetails>;
}
function ScheduleHistory({entries,onRevert,canRevert}) {
  return <section className="flexible-schedule-history" aria-labelledby="recent-schedule-changes">
    <h2 id="recent-schedule-changes" className="eyebrow">Earlier this week</h2>
    <div className="flexible-week-review">{entries.map(entry=><article key={entry.id}>
      <strong>{entry.name}</strong>
      <span>{entry.skipped?dateLabel(entry.scheduledDate):`${dateLabel(entry.originalDate)} → ${dateLabel(entry.scheduledDate)}`} · {entry.status==='completed'?'Completed':entry.status==='combined'?'Combined':'Skipped'}</span>
      {onRevert&&canRevert?.(entry)&&<button className="text-button schedule-revert-action" onClick={()=>onRevert(entry.id)}>Revert skip</button>}
    </article>)}</div>
  </section>;
}
const countChanges=count=>`${count} ${count===1?'change':'changes'}`;
const profileWeekBaseline=(state,dates,sessions)=>dates.filter(date=>Array.isArray(state.profile?.availableDays) &&
  state.profile.availableDays.includes(weekday(calendarDate(date))) && !sessions.some(s=>['active','completed'].includes(s.status) && s.scheduledDate===date));
export function groupRescheduleCandidates(candidates) {
  const sorted=[...candidates].sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)||a.logicalSessionId.localeCompare(b.logicalSessionId));
  return [["THIS WEEK'S PLAN",sorted.filter(s=>s.firstPlanWeek)],['MISSED',sorted.filter(s=>!s.firstPlanWeek&&s.status==='missed')],['UPCOMING',sorted.filter(s=>!s.firstPlanWeek&&s.status!=='missed')]]
    .filter(([,sessions])=>sessions.length).map(([label,sessions])=>({label,sessions}));
}
export function missedSessionDestinations(state, sessionId, today=isoDay()) {
  const item=flexibleSessionById(state,sessionId,today);
  if(!item || item.status!=='missed')return [];
  return moveWorkoutDestinations(state,sessionId,today).filter(destination=>destination.available).map(destination=>destination.date);
}
export function FlexibleWeekSheet({ state, update, close, Header, request = {}, setDetail, onBack }) {
  const recoveryAction=useDurableAction(state,update);
  const [recovery,setRecovery]=useState(null);
  const recoveryChange=recovery?.record.skipped?'skip':'move';
  const feedback=useMissedWorkoutFeedback();
  const [useToday,setUseToday]=useState(null);
  const today = useCalendarDay();
  const recoveryIsCurrent=useMemo(()=>scheduleRecoveryIsCurrent(state,recovery),[state,recovery,today]);
  const planner = useMemo(()=>createFlexibleWeekPlanner(state,today),[state,today]);
  const sessions = planner.sessions();
  const remainingWeekDates = remainingPlanWeekDates(today);
  const missed = useMemo(()=>missedFlexibleSessions(state,today,sessions),[state,today,sessions]);
  const initialSessionId = request.sessionId || (request.missed && missed.length===1 ? missed[0].logicalSessionId : null);
  const [initialSwap] = useState(()=>request.swap && request.otherSessionId ? proposeFlexibleWeek(state,{mode:'swap',sessionId:request.sessionId,otherSessionId:request.otherSessionId},today) : null);
  const [initialWeekShift]=useState(()=>request.shift?proposeFlexibleWeek(state,{mode:'recover-week',sessionId:request.sessionId},today):null);
  const [steps, setSteps] = useState(request.shift?['mode','shift-review']:initialSwap?.status==='ready' ? ['mode','swap','review'] : request.reviewExisting ? request.focusSessionId?['existing']:['mode','existing'] : initialSessionId ? ['mode', request.swap ? 'swap' : !request.destination && missed.some(s=>s.logicalSessionId===initialSessionId) ? 'recovery' : 'destination'] : request.missed ? ['mode','missed'] : request.move ? ['pick'] : ['mode']);
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
  const availabilityPreview = useMemo(()=>step==='available' ? planner.check(availabilityRequest) : null,[planner,availabilityRequest,step]);
  const canReviewSchedule = Boolean(availabilityPreview?.remainingSessions);
  const [proposal, setProposal] = useState(initialWeekShift || (initialSwap?.status==='ready' ? initialSwap : null));
  const [shiftExtraDates,setShiftExtraDates]=useState([]);
  const [focusedChangeId,setFocusedChangeId]=useState(request.focusSessionId||null);
  const [revertBlocked,setRevertBlocked]=useState(null);
  const [revertMessage,setRevertMessage]=useState('');
  const [error, setError] = useState('');
  const openRecovery=id=>{try{setRecovery(reviewScheduleRecovery(state,id));setError('');setStep('repair');}catch(e){setError(e.message);}};
  const repair=(mode,toDate)=>{
    try{
      const result=recoveryAction.commit(current=>applyScheduleRecovery(current,recovery,mode,{toDate}));
      if(mode==='one-off'||!temporaryScheduleReview(result.state).unresolved.length){close();return;}
      setRecovery(null);setFocusedChangeId(null);setError('');setSteps(['mode','existing']);
    }catch(e){setError(e.message);}
  };
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const [adaptationChoice, setAdaptationChoice] = useState('keep');
  const applied = useRef(false);
  useEffect(()=>{if(step==='existing')applied.current=false;},[state,step]);
  const screenRef = useRef(null);
  const returnAction = useRef(null);
  const previousView = useRef({step,useToday,focusedChangeId});
  const staleAvailabilityReview=()=>proposal?.availabilitySchedule && (proposal.today!==today || proposal.fingerprint!==flexibleReviewFingerprint(state) ||
    proposal.request.combinedProposal && proposal.request.combinedProposal.fingerprint!==combineFingerprint(state));
  const reorderRows=useMemo(()=>['review','reorder'].includes(step) && !staleAvailabilityReview() ? flexibleReorderRows(proposal) : [],[step,state,today,proposal]);
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
    const changed=previousView.current.step!==step || previousView.current.useToday!==useToday || previousView.current.focusedChangeId!==focusedChangeId;
    previousView.current={step,useToday,focusedChangeId};
    const screen=screenRef.current;
    if(!screen)return;
    screen.scrollTop=0;
    if(changed)focusNavigationTarget(step==='restore-confirm'
      ? screen.querySelector('#schedule-restore-title')
      : step==='existing'?screen.querySelector('.schedule-change-title')
      : screen.querySelector(step==='recovery' && returnAction.current ? `[data-recovery-action="${returnAction.current}"]` : '.detail-header-back') || screen.querySelector('button'));
    returnAction.current=null;
  }, [step,useToday,focusedChangeId]);
  const item = useMemo(()=>sessionId ? flexibleSessionById(state,sessionId,today,{sessions,includeDuration:false}) : null,[state,sessionId,today,sessions]);
  const missedDestination = step==='destination' && item?.status==='missed';
  const firstWeekDestination=step==='destination'&&item?.firstPlanWeek;
  const recoveryView = ['recovery','more'].includes(step);
  const shiftView=['shift-review','shift-extra'].includes(step);
  const shiftCurrent=useMemo(()=>Boolean(proposal?.today===today&&proposal.fingerprint===flexibleReviewFingerprint(state)&&
    (!proposal.recoveryShift||JSON.stringify(proposal.recoveryShift.availableDays)===JSON.stringify([...(state.profile.availableDays||[])].sort()))),[state,today,proposal]);
  const selectSession = session => {setResolutionSessionId(null);setSessionId(session.logicalSessionId);setStep(session.status==='missed'?'recovery':'destination');};
  // More options is a disclosure, not an extra navigation level for its children.
  const openRecoveryOption = next => {setError('');setSteps(current=>[...current.slice(0,current.lastIndexOf('recovery')+1),next]);};
  const resolutionMove=step==='destination' && Boolean(resolutionSessionId);
  const destinations = useMemo(() => step === 'destination' ? moveWorkoutDestinations(state,sessionId,today,resolutionSessionId?availabilityRequest:null) : [], [state,sessionId,today,step,resolutionSessionId,availabilityRequest]);
  const validDates = destinations.filter(destination=>destination.available).map(destination=>destination.date);
  const todayDestination = destinations.find(destination=>destination.date===today);
  const destinationReasonId = useId();
  const dateWeeks = [...new Set(validDates.map(date=>weekKey(date)))];

  const canMove = useMemo(()=>item && ['recovery','more'].includes(step) && planner.hasMove(sessionId),[planner,item,sessionId,step]);
  const canTrainToday = useMemo(()=>item && canUseWorkoutToday(state,{sessionId},today,planner),[state,item,sessionId,today,planner]);
  const canShiftWeek=useMemo(()=>Boolean(recoveryView&&item?.status==='missed'&&planner.check({mode:'recover-week',sessionId}).status==='ready'),[planner,item,sessionId,recoveryView]);
  const existingReview = useMemo(()=>temporaryScheduleReview(state,today),[state,today]);
  const eligibleMissed=useMemo(()=>missed.filter(item=>planner.check({mode:'skip',sessionId:item.logicalSessionId}).status==='ready'),[planner,missed]);
  const scheduleNeedsAttention=existingReview.unresolved.length>0;
  const hasMissed = eligibleMissed.length > 0;
  const canAdjustWeek=useMemo(()=>Boolean(planner.check({mode:'available',availableDates:remainingPlanWeekDates(today),dateScope:'current-week'}).remainingSessions),[planner,today]);
  const findMoves=['mode','pick'].includes(step) || step==='available'&&!canAdjustWeek || step==='existing'&&!canAdjustWeek&&!hasMissed;
  const candidates=useMemo(()=>findMoves ? planner.moveCandidates() : [],[planner,findMoves]);
  const remainingMoves=step==='available'&&!canAdjustWeek?candidates:[];
  const canEditSchedule=hasMissed||canAdjustWeek||candidates.length>0;
  const rejoinDate=useMemo(()=>temporaryScheduleRejoinDate(state,today),[state,today]);
  const combinedSchedule=combinedAdjustment(state);
  const existingChangeCount=existingReview.items.length+(combinedSchedule?1:0);
  const recentChanges=existingReview.recent;
  const skippedBySchedule=entry=>Boolean(state.flexibleWeek?.sessions?.[entry.id]?.skipped);
  const canRevertRecentSkip=entry=>skippedBySchedule(entry)&&!entry.issue&&!entry.finished&&
    !state.program?.trainingBlock?.resolvedSkips?.some(skip=>skip.logicalSessionId===entry.id);
  const hasScheduleReview=Boolean(existingChangeCount||recentChanges.length);
  const linkedChanges=useMemo(()=>step==='existing' && focusedChangeId ? linkedScheduleChanges(state,focusedChangeId) : [],[state,step,focusedChangeId]);
  const focusedChange=existingReview.items.find(entry=>entry.id===focusedChangeId);
  const reviewedChanges=focusedChange?[focusedChange,...existingReview.items.filter(entry=>entry.id!==focusedChangeId && linkedChanges.some(change=>change.id===entry.id))]:focusedChangeId?[]:existingReview.items;
  const restoreRequest=useMemo(()=>focusedChangeId?{mode:'restore',sessionId:focusedChangeId}:{mode:'restore'},[focusedChangeId]);
  const restoreScope=useMemo(()=>step==='existing'?temporaryScheduleRestoreScope(state,today,focusedChangeId):null,[state,today,step,focusedChangeId]);
  const restoreCount=restoreScope?.removable.length||0;
  const restorePreview=useMemo(()=>restoreCount?planner.check(restoreRequest):null,[planner,restoreRequest,restoreCount]);
  const canRestore=restorePreview?.status==='ready' && (!focusedChangeId || Boolean(focusedChange));
  const scopedRestoreLabel=restoreCount>1?`RESTORE ${restoreCount} WORKOUTS`:focusedChange?.issue?'REVIEW RESTORE':'RESTORE ORIGINAL DATE';
  const restoreRecords=step==='restore-confirm'?proposal?.restoreRecords||[]:[];
  const individualRevert=step==='restore-confirm'&&proposal?.request.revert;
  const focusedRestore=step==='restore-confirm' && Boolean(proposal?.request.sessionId);
  const confirmingOne=restoreRecords.length===1;
  const restoreConfirmationTitle=individualRevert ? confirmingOne?'Revert this change?':'Revert linked changes?' : focusedRestore ? confirmingOne?'Restore original date?':'Restore original dates?' : 'Restore original schedule?';
  const restoreConfirmLabel=individualRevert ? confirmingOne?'REVERT CHANGE':`REVERT ${restoreRecords.length} CHANGES` : focusedRestore
    ? confirmingOne?'RESTORE WORKOUT':`RESTORE ${restoreRecords.length} WORKOUTS`
    : `RESTORE ${countChanges(restoreRecords.length).toUpperCase()}`;
  const retainedChanges=step==='restore-confirm'?existingReview.items.filter(entry=>!restoreRecords.some(record=>record.id===entry.id)):[];
  const skippedLabel=date=>weekKey(date)===weekKey(today)?'Skipped this week':'Skipped this occurrence';
  const openRestore=()=>{
    const next=proposeFlexibleWeek(state,restoreRequest,today);
    if(next.status!=='ready'||!next.restoreRecords.length){setError(next.error||'There are no changes to restore.');return;}
    setAdaptationChoice('restore');setProposal(next);setError('');setStep('restore-confirm');
  };
  const openRevert=id=>{
    const next=proposeFlexibleWeek(state,{mode:'restore',sessionId:id,revert:true},today);
    setError('');setPersistenceFailed(false);setRevertMessage('');
    if(next.status!=='ready'){
      setSessionId(id);setRevertBlocked(next.error);setStep('revert-blocked');return;
    }
    // Future adjustments follow the workout. Returning an adjustment to a past
    // date would strand it outside the missed-workout chooser; disclose its reset.
    const pastAdjustment=next.changes.some(change=>change.toDate<today && change.workoutId===state.todayAdaptation?.programDayId && change.fromDate===state.todayAdaptation?.date);
    setAdaptationChoice(pastAdjustment?'restore':'keep');setProposal(next);setStep('restore-confirm');
  };
  const canMoveBlocked=useMemo(()=>Boolean(step==='revert-blocked'&&sessionId&&planner.hasMove(sessionId)),[step,sessionId,planner]);
  const editSchedule=()=>{setFocusedChangeId(null);setSteps(['mode']);};
  const swapCandidates = useMemo(()=>item && ['more','swap','destination'].includes(step) ? planner.swaps(sessionId) : [],[planner,item,step,sessionId]);
  const simpleSwap = proposal?.request.mode === 'swap';
  const simpleMove = proposal?.request.mode === 'move' && !proposal.adaptationConflict;
  const firstWeekMove=simpleMove&&item?.firstPlanWeek&&item.logicalSessionId===proposal.request.sessionId;
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
    setError('');setPersistenceFailed(false);
    const result=proposeFlexibleWeek(state,{mode:'move',sessionId,toDate:date},today);
    if(result.status!=='ready'){setError(result.error);return;}
    setProposal(result);
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
    setAdaptationChoice('keep');
    setError(''); const result = proposeFlexibleWeek(state, action.mode==='available' ? availabilityRequest : action, today);
    if (action.mode === 'available' && !result.availabilitySchedule?.length) { setAvailabilityResult(result); setStep('availability-result'); return; }
    if (action.mode === 'available') {setProposal(result);setStep('review');return;}
    if (result.status !== 'ready') { setError(result.error); return; }
    setProposal(result); setStep('review');
  };
  const commitProposal = (selectedProposal,choice) => {
    if (applied.current) return;
    setError('');
    setPersistenceFailed(false);
    const result = applyFlexibleWeek(state, selectedProposal, { adaptationChoice:choice });
    if (result.status !== 'applied') { setError(result.error); return; }
    if (result.state === state) { applied.current = true; close(); return; }
    if (!saveState(result.state)) { setPersistenceFailed(true); setError('ROOK couldn’t save the schedule. Your previous schedule is unchanged. Try again.'); return; }
    applied.current = true; update(() => result.state, {persistedState:result.state});
    if(selectedProposal.request.revert){
      feedback?.scheduleApplied?.(state,result.state);
      setFocusedChangeId(null);setProposal(null);setSteps(['mode','existing']);
      setRevertMessage(selectedProposal.restoreRecords.length===1?'Change reverted.':`${selectedProposal.restoreRecords.length} changes reverted.`);
      return;
    }
    if(feedback?.scheduleApplied){feedback.scheduleApplied(state,result.state);close();return;}
    if(item?.status==='missed' && selectedProposal.request.mode==='move' && feedback) {
      feedback.applied({message:`${item.workout.name} moved to ${dateLabel(selectedProposal.request.toDate)}`,undo:missedRecoveryUndo(state,result.state,sessionId)});
      close();return;
    }
    close();
  };
  const apply=()=>commitProposal(proposal,adaptationChoice);
  const applyMove=()=>{
    if(applied.current || proposal?.request.mode!=='move')return;
    const current=proposeFlexibleWeek(state,proposal.request,today);
    if(current.status!=='ready'){setError(current.error);return;}
    if(current.changes[0].fromDate!==proposal.changes[0].fromDate){
      setProposal(null);setError('This workout moved while this screen was open. Choose its new date.');return;
    }
    // Moving an occurrence also moves its saved one-off workout. No additional
    // choice or prescription reset is needed for a calendar-only operation.
    commitProposal(current,'keep');
  };
  const openWeekShift=()=>{
    const result=proposeFlexibleWeek(state,{mode:'recover-week',sessionId},today);
    setError('');setPersistenceFailed(false);setProposal(result);setStep('shift-review');
  };
  const chooseShiftExtra=()=>{
    if(!shiftCurrent){setStep('shift-review');setError('The schedule changed. Update the preview first.');return;}
    const result=proposeFlexibleWeek(state,{...proposal.request,extraDates:shiftExtraDates},today);
    if(result.status!=='ready'){setError(result.error);return;}
    setProposal(result);setPersistenceFailed(false);setError('');setStep('shift-review');
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
  if(useToday)return <UseWorkoutTodaySheet state={state} update={update} close={close} Header={Header} setDetail={setDetail} onShiftWeek={()=>{setUseToday(null);openWeekShift();}} className={steps.includes('recovery')?'missed-recovery-today':''} request={{sessionId:useToday}} onBack={()=>{setUseToday(null);returnAction.current='train';setError('');}}/>;
  return <main ref={screenRef} className={`screen detail-screen flexible-week-sheet${missedDestination?' content-fit-screen missed-destination-sheet':''}${recoveryView?' content-fit-screen missed-recovery-sheet':''}${['skip-confirm','restore-confirm','revert-blocked','existing','mode'].includes(step)?' content-fit-screen flexible-compact-sheet':''}`}>
    <Header title={shiftView?'Shift this week':individualRevert||step==='revert-blocked'?'Revert change':step==='restore-confirm'?'Restore schedule':step==='existing'?'Schedule changes':step==='more'?'More options':recoveryView?'Missed workout':firstWeekDestination?'Schedule workout':missedDestination?'Move workout':request.move ? 'Move a workout' : 'Adjust week'} onClose={close} onBack={step!=='done' && steps.length > 1 ? goBack : undefined} />
    {!recoveryView && !missedDestination && !['existing','restore-confirm','revert-blocked'].includes(step) && <p className="eyebrow">{step==='pick'?'MOVE A WORKOUT':'TEMPORARY SCHEDULE'}</p>}
    {step==='recovery' && item && <>
      <h1>{item.workout.name}</h1><p>Missed · {dateLabel(item.scheduledDate)}</p>
      <div className="missed-recovery-actions">
        {scheduleNeedsAttention&&<button className="button secondary" onClick={()=>setStep('existing')}>REVIEW SCHEDULE FIRST</button>}
        {canTrainToday && <button className="button primary" data-recovery-action="train" onClick={()=>setUseToday(sessionId)}>TRAIN TODAY</button>}
        {canShiftWeek && <button className="button secondary" data-recovery-action="shift" onClick={openWeekShift}>SHIFT THE REST OF THIS WEEK</button>}
        {canMove && <button className="button secondary" data-recovery-action="move" onClick={()=>setStep('destination')}>MOVE TO ANOTHER DAY</button>}
        {!scheduleNeedsAttention&&<button className="text-button" data-recovery-action="more" onClick={()=>setStep('more')}>More options</button>}
      </div>
    </>}
    {shiftView&&proposal?.status!=='ready'&&<>
      <h1>This week cannot shift</h1><p role="status">{proposal?.error||'Choose another workout from the current schedule.'}</p>
      <button className="button secondary" onClick={reviewCurrentSchedule}>OPEN CURRENT SCHEDULE</button>
    </>}
    {shiftView&&proposal?.status==='ready'&&proposal.recoveryShift&&<>
      <h1>{step==='shift-extra'?proposal.recoveryShift.extraDates.length===1?'Choose an extra day':`Choose ${proposal.recoveryShift.extraDates.length} extra days`:'Shift the rest of this week?'}</h1>
      <p>{proposal.recoveryShift.sourceCompleted?'Your completed workout stays recorded.':'The missed workout goes first.'} Next week keeps its existing dates.</p>
      {step==='shift-extra'?<div className="flexible-week-dates">{proposal.recoveryShift.extraDateOptions.map(date=><button key={date} data-shift-extra={date} disabled={!shiftCurrent} aria-pressed={shiftExtraDates.includes(date)} onClick={()=>setShiftExtraDates(current=>proposal.recoveryShift.extraDates.length===1?[date]:current.includes(date)?current.filter(value=>value!==date):[...current,date])}>{dateLabel(date)}</button>)}</div>:<>
        <div className="flexible-week-review">{proposal.changes.map(change=><article key={change.logicalSessionId} data-shift-session={change.logicalSessionId}><strong>{change.name}</strong><span>{dateLabel(change.fromDate)} → {dateLabel(change.toDate)}</span></article>)}</div>
        {proposal.recoveryShift.extraDates.length>0&&<p className="sheet-footnote">Extra training {proposal.recoveryShift.extraDates.length===1?'day':'days'} this week: {proposal.recoveryShift.extraDates.map(dateLabel).join(', ')}.</p>}
        {proposal.recoveryShift.extraDateOptions.length>proposal.recoveryShift.extraDates.length&&<button className="text-button" onClick={()=>{setShiftExtraDates(proposal.recoveryShift.extraDates);setError('');setStep('shift-extra');}}>Change extra {proposal.recoveryShift.extraDates.length===1?'day':'days'}</button>}
        {proposal.adaptationConflict&&<p className="sheet-footnote">Your saved workout adjustments move with their workouts.</p>}
        {proposal.warnings.map(warning=><p className="sheet-footnote" key={warning}>{warning}</p>)}
      </>}
      <SheetActionFooter>{error&&<p role="alert">{error}</p>}
        {!shiftCurrent&&<><p role="status">The schedule changed.</p><button className="button secondary" onClick={openWeekShift}>UPDATE PREVIEW</button></>}
        {step==='shift-extra'&&<button className="button primary" disabled={!shiftCurrent||shiftExtraDates.length!==proposal.recoveryShift.extraDates.length} onClick={chooseShiftExtra}>USE THESE DAYS</button>}
        {step==='shift-review'&&<button className="button primary" disabled={!shiftCurrent} onClick={()=>commitProposal(proposal,'keep')}>{persistenceFailed?'TRY AGAIN':'SHIFT THIS WEEK'}</button>}
        <button className="button quiet" onClick={close}>CANCEL</button>
      </SheetActionFooter>
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
      {flexibleWeekConflict(state,today) && <p role="status">Your plan changed. Review the temporary schedule before adjusting again. Completed and active workouts stay fixed.</p>}
      <div className="adjust-option-list">
        {hasScheduleReview && <button className="choice-row rook-menu-navigation" onClick={()=>setStep('existing')}><span className="rook-menu-copy"><strong>{existingReview.unresolved.length?'Review temporary schedule':'Schedule changes'}</strong><small>{existingReview.unresolved.length?`${existingReview.unresolved.length} need attention`:`${countChanges(existingChangeCount||recentChanges.length)}${existingChangeCount?'':' earlier this week'}`}</small></span><NavigationChevron/></button>}
        {hasMissed&&<button className="choice-row rook-menu-navigation" onClick={() => {
          if(eligibleMissed.length===1)selectSession(eligibleMissed[0]);
          else setStep('missed');
          feedback?.review();
        }}><span className="rook-menu-copy"><strong>I missed a workout</strong><small>Move or skip an unstarted session.</small></span><NavigationChevron/></button>}
        {canAdjustWeek&&<button className="choice-row rook-menu-navigation" onClick={() => setStep('available')}><span className="rook-menu-copy"><strong>My available days changed</strong><small>Rearrange workouts through this Sunday.</small></span><NavigationChevron/></button>}
        {candidates.length>0 && <button className="choice-row rook-menu-navigation" onClick={() => setStep('pick')}><span className="rook-menu-copy"><strong>Move a workout</strong><small>Choose one session and another date.</small></span><NavigationChevron/></button>}
      </div>
      {!hasMissed&&!canAdjustWeek&&!candidates.length&&!hasScheduleReview&&<p role="status">Your schedule is already set. No unstarted workouts can be changed right now.</p>}
    </>}
    {step === 'existing' && <>
      {focusedChange ? <h1 className="schedule-change-title" tabIndex={-1} data-sheet-initial-focus>{focusedChange.name}</h1>
        : <h1 className="schedule-change-title" tabIndex={-1} data-sheet-initial-focus>{focusedChangeId?'Change no longer current':existingChangeCount?'Current changes':recentChanges.length?'This week':'No current changes'}</h1>}
      {focusedChangeId&&!focusedChange&&<p>Open Schedule changes to check the latest dates.</p>}
      {!focusedChangeId&&existingReview.unresolved.length>0&&<p role="status">{existingReview.unresolved.length} {existingReview.unresolved.length===1?'workout needs':'workouts need'} attention.</p>}
      {revertMessage&&<p role="status">{revertMessage}</p>}
      {(reviewedChanges.length>0||!focusedChangeId&&combinedSchedule)&&<div className="flexible-week-review flexible-schedule-changes">{reviewedChanges.map(entry=><article key={entry.id} data-session-id={entry.id}>
        <small className="eyebrow">{entry.issue?'NEEDS ATTENTION':entry.skipped?'SKIPPED':'MOVED'}</small>
        {entry.id!==focusedChangeId&&<strong>{entry.name}</strong>}
        <span>{entry.skipped?dateLabel(entry.originalDate):<>Original {dateLabel(entry.originalDate)} <span aria-hidden="true">→</span> Now {dateLabel(entry.scheduledDate)}</>}</span>
        {entry.skipped&&entry.scheduledDate!==entry.originalDate&&<small>Last scheduled {dateLabel(entry.scheduledDate)}</small>}
        {entry.skipped&&canRestore&&restoreScope.removable.some(record=>record.id===entry.id)&&<small>This skip can be undone.</small>}
        {entry.issue && <small>{entry.issue}</small>}
          {entry.issue && <button type="button" className="button secondary" onClick={()=>openRecovery(entry.id)}>{entry.skipped?'Review this skip':'Review this move'}</button>}
        {!entry.issue&&(skippedBySchedule(entry)?canRevertRecentSkip(entry):entry.originalDate!==entry.scheduledDate)&&<button type="button" className="text-button schedule-revert-action" onClick={()=>openRevert(entry.id)}>{skippedBySchedule(entry)?'Revert skip':'Revert move'}</button>}
        {!entry.issue&&skippedBySchedule(entry)&&!canRevertRecentSkip(entry)&&<small>Already counted in plan progress.</small>}
      </article>)}{!focusedChangeId&&combinedSchedule&&<article>
        <small className="eyebrow">COMBINED</small><strong>{combinedSchedule.workout.name}</strong>
        {combinedSchedule.sourceSessions.map(source=><span key={source.logicalSessionId}>{source.name} · {dateLabel(source.originalDate)} → {dateLabel(combinedSchedule.date)}</span>)}
        <small>Source workouts stay reserved until the combined workout ends or is canceled.</small>
      </article>}</div>}
      {focusedChange&&reviewedChanges.length>1&&<p className="sheet-footnote">These workouts moved together.</p>}
      {!focusedChangeId&&recentChanges.length>0&&<ScheduleHistory entries={recentChanges} onRevert={openRevert} canRevert={canRevertRecentSkip}/>}
      {!focusedChangeId&&existingReview.unresolved.length>0&&!canEditSchedule&&canRestore&&<p className="sheet-footnote">Restore the eligible temporary changes before editing the current schedule.</p>}
      <SheetActionFooter className="flexible-week-footer">
        {error&&<p role="alert">{error}</p>}
        {canRestore&&<button className="button primary" onClick={openRestore}>{focusedChangeId?scopedRestoreLabel:restoreCount===1?'RESTORE ORIGINAL SCHEDULE':`RESTORE ${restoreCount} CHANGES`}</button>}
        {!canRestore&&<button className="button primary" onClick={close}>DONE</button>}
        {focusedChangeId&&hasScheduleReview&&<button className="button quiet" onClick={()=>{setFocusedChangeId(null);setSteps(['mode','existing']);setError('');}}>VIEW ALL SCHEDULE CHANGES</button>}
        {!focusedChangeId&&existingChangeCount>0&&canEditSchedule&&<button className="button secondary" onClick={editSchedule}>EDIT SCHEDULE</button>}
        {!focusedChangeId&&canRestore&&<button className="button quiet" onClick={close}>DONE</button>}
      </SheetActionFooter>
    </>}
    {step==='revert-blocked'&&<>
      <h1>Original date unavailable</h1>
      <p>{revertBlocked}</p>
      <SheetActionFooter className="flexible-week-footer">
        {canMoveBlocked&&<button className="button primary" onClick={()=>{setResolutionSessionId(null);setProposal(null);setError('');setPersistenceFailed(false);setStep('destination');}}>MOVE TO ANOTHER DAY</button>}
        <button className={`button ${canMoveBlocked?'quiet':'primary'}`} onClick={goBack}>BACK TO CHANGES</button>
      </SheetActionFooter>
    </>}
    {['repair','repair-remove','repair-move'].includes(step)&&recovery&&!recoveryIsCurrent&&<>
      <h1>This schedule changed</h1>
      <p>Open the current schedule to see the available actions.</p>
      <button className="button primary" onClick={()=>{setRecovery(null);setFocusedChangeId(null);setError('');setSteps(['mode','existing']);}}>OPEN CURRENT SCHEDULE</button>
    </>}
    {step==='repair-move'&&recovery&&recoveryIsCurrent&&<>
      <h1>Choose a free date</h1>
      <p>{recovery.record.name} · Use the current plan's exercises and targets.</p>
      <div className="flexible-week-dates">{recovery.moveDates.map(date=><button key={date} data-repair-date={date}
        onClick={()=>repair('move',date)}>{dateLabel(date)}</button>)}</div>
      {error&&<p role="alert">{error}</p>}
    </>}
    {['repair','repair-remove'].includes(step)&&recovery&&recoveryIsCurrent&&<>
      <h1>{step==='repair-remove'?`Remove temporary ${recoveryChange}?`:recovery.record.name||'Review workout change'}</h1>
      <p>{step==='repair-remove'&&recovery.record.name?`${recovery.record.name} · `:''}{dateLabel(recovery.record.originalDate)} → {dateLabel(recovery.record.scheduledDate)}</p>
      {step==='repair'?<>
        <p>{recovery.oneOff?'This workout was removed from your plan. You can keep your adjusted workout on the moved date. It won’t repeat.':recovery.workout||recovery.adjustment?.workout
          ? recovery.adjustment ? 'Choose which version to use on the moved date. This doesn’t change your weekly plan.' : 'Keep the moved date and use the current plan’s exercises and targets.'
          : recovery.reason}</p>
        {recovery.groupCount>1&&<p>{recovery.oneOff?'Keeping this workout leaves the other move unchanged.':'These workouts moved together. This decision applies to the linked moves.'}</p>}
        <RecoveryWorkoutPreview workout={recovery.adjustment?.snapshot} label="Your one-off adjustment" units={state.profile.units} />
        <RecoveryWorkoutPreview workout={recovery.workout} label="Workout from the current plan" units={state.profile.units} />
        {recovery.adjustment?.reason&&recovery.workout&&<p role="status">Your one-off adjustment can’t be used: {recovery.adjustment.reason}</p>}
        {recovery.oneOffReason&&<p role="status">{recovery.oneOffReason}</p>}
        <SheetActionFooter>
          {error&&<p role="alert">{error}</p>}
          {recovery.oneOff&&<button className="button primary" onClick={()=>repair('one-off')}>KEEP AS ONE-OFF WORKOUT</button>}
          {recovery.adjustment?.workout&&<button className="button primary" onClick={()=>repair('keep-adjustment')}>KEEP DATE AND ADJUSTMENT</button>}
          {recovery.workout&&<button className={`button ${recovery.adjustment?.workout?'secondary':'primary'}`} onClick={()=>repair('keep')}>{recovery.adjustment?'KEEP DATE, USE UPDATED PLAN':'KEEP MOVED DATE'}</button>}
          {recovery.moveDates.length>0&&<button className="button secondary" onClick={()=>{setError('');setStep('repair-move');}}>MOVE TO A FREE DATE</button>}
          <button className={`button ${recovery.workout||recovery.adjustment?.workout||recovery.oneOff?'quiet':'secondary'}`} onClick={()=>{setError('');setStep('repair-remove');}}>REMOVE TEMPORARY {recoveryChange.toUpperCase()}</button>
        </SheetActionFooter>
      </>:<>
        <p>{recovery.discardsChanges?'This also clears the affected one-off edits. ':''}Completed workouts and your permanent plan stay unchanged.</p>
        {recovery.afterRemoval.length?<ul>{recovery.afterRemoval.map((item,index)=><li key={index}>{dateLabel(item.date)} · {item.name} · {item.status}</li>)}</ul>:<p>The current plan has no workout to put back for this occurrence.</p>}
        <SheetActionFooter>{error&&<p role="alert">{error}</p>}<button className="button primary" onClick={()=>repair('remove')}>REMOVE TEMPORARY {recoveryChange.toUpperCase()}</button><button className="button quiet" onClick={goBack}>KEEP FOR REVIEW</button></SheetActionFooter>
      </>}
    </>}
    {step==='restore-confirm'&&<>
      <h1 id="schedule-restore-title" className="schedule-change-title" tabIndex={-1}>{restoreConfirmationTitle}</h1>
      {individualRevert&&!confirmingOne&&<p>To free the original date, these linked changes need to be reverted together.</p>}
      <div className="flexible-week-review flexible-schedule-changes">{restoreRecords.map(record=>{
        const change=proposal.changes.find(item=>item.logicalSessionId===record.id);
        return <article key={record.id} data-revert-session={individualRevert?record.id:undefined}><strong>{record.name||change?.name||'Workout'}</strong>
          <span>{!change?`Outdated change · ${dateLabel(record.scheduledDate)}`:record.skipped?`Skipped → ${dateLabel(change.toDate)}`:`${dateLabel(change.fromDate)} → ${dateLabel(change.toDate)}`}</span>
          {!change&&<small>This saved change will be cleared.</small>}
          {individualRevert&&change?.toDate<today&&!state.workoutOccurrenceOverrides?.[change.fromDate]?.[change.workoutId]?.skipWorkout&&<small>{change.originalDate<(state.program?.trainingBlock?.startDate||weekKey(today))?'Returns to this week’s unscheduled plan.':'Returns as a missed workout.'}</small>}
        </article>;
      })}</div>
      {retainedChanges.length>0&&<p className="sheet-footnote">{retainedChanges.length===1?`${retainedChanges[0].name} ${retainedChanges[0].skipped?'stays skipped':'keeps its scheduled date'}.`:`${retainedChanges.length} other changes stay as scheduled.`}</p>}
      {proposal?.adaptationConflict&&<p className="sheet-footnote">{adaptationChoice==='keep'?'Your one-off adjustment follows the workout.':'The affected today-only adjustment will be cleared.'}</p>}
      <SheetActionFooter className="flexible-week-footer">
        {error&&<p role="alert">{error}</p>}
        <button className="button primary" disabled={!restoreRecords.length} onClick={apply}>{persistenceFailed?'TRY AGAIN':restoreConfirmLabel}</button>
        <button className="button quiet" onClick={goBack}>KEEP CURRENT SCHEDULE</button>
      </SheetActionFooter>
    </>}
    {['pick', 'missed'].includes(step) && <>
      <h1>{step === 'missed' ? 'Choose a missed session' : 'Choose a workout'}</h1>
      {step === 'pick' ? <>
        <p>{candidates.some(candidate=>candidate.firstPlanWeek)?"Choose a workout from this week’s plan or an upcoming session.":"Select a missed or upcoming workout to move."}</p>
        <div className="flexible-workout-list">{groupRescheduleCandidates(candidates).map(group=><section className="flexible-workout-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.sessions.map(s=><button className="list-row" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>selectSession(s)}>
            <span><strong>{s.workout.name}</strong><small>{s.status==='missed'?'Missed · ':''}{dateLabel(s.scheduledDate)}{s.firstPlanWeek?' · Not scheduled yet':''}{s.moved?` · Originally ${dateLabel(s.originalDate)}`:''}</small></span><NavigationChevron/>
          </button>)}
        </section>)}</div>
      </> : <div className="adjust-option-list missed-session-choices">{missed.map(s => <button className="choice-row rook-menu-navigation" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={() => selectSession(s)}><span className="rook-menu-copy"><strong>{s.workout.name}</strong><small>Missed · {dateLabel(s.scheduledDate)}</small>{s.moved&&<small>Originally scheduled for {dateLabel(s.originalDate)}</small>}</span><NavigationChevron/></button>)}</div>}
      {step==='pick' ? !candidates.length && <p role="status">No missed or upcoming workouts can be moved.</p> : !missed.length && <p>No unstarted sessions need moving.</p>}
    </>}
    {step === 'swap' && item && <>
      <h1>Swap with another workout</h1><p>{item.workout.name} · {dateLabel(item.scheduledDate)}</p>
      <div className="adjust-option-list">{swapCandidates.map(s=><button className="choice-row rook-menu-navigation" key={s.logicalSessionId} data-session-id={s.logicalSessionId} onClick={()=>review({mode:'swap',sessionId,otherSessionId:s.logicalSessionId})}><span className="rook-menu-copy"><strong>{s.workout.name}</strong><small>{dateLabel(s.scheduledDate)}</small></span><NavigationChevron/></button>)}</div>
      {!swapCandidates.length && <p>No eligible workouts to swap. Completed, active, skipped and reserved sessions stay fixed.</p>}
    </>}
    {step === 'destination' && item && <>
      <h1>{firstWeekDestination?'Schedule':'Move'} {item.workout.name}</h1><p>{firstWeekDestination?`From this week’s plan · ${dateLabel(item.originalDate)}`:missedDestination ? `From ${dateLabel(item.scheduledDate)}` : `Currently ${dateLabel(item.scheduledDate)}. Choose a new date.`}</p>
      {error && resolutionMove && <p role="alert" className="flexible-week-error">{error}</p>}
      {missedDestination ? <>
        {dateWeeks.length>0 && <p className="eyebrow">AVAILABLE DATES</p>}
        {dateWeeks.map(week=><section key={week} className="missed-date-group"><h2>{week===weekKey(today)?'This week':week===addCalendarDays(weekKey(today),7)?'Next week':`Week of ${dateLabel(week)}`}</h2><div className="flexible-week-dates">{validDates.filter(date=>weekKey(date)===week).map(date=><button key={date} data-move-date={date} aria-pressed={proposal?.request.mode==='move' && proposal.request.sessionId===sessionId && proposal.request.toDate===date} onClick={()=>chooseDestination(date)}>{dateLabel(date)}</button>)}</div></section>)}
        {!validDates.length && <><p role="status">No available dates in the next 14 days.</p><button className="button secondary" onClick={()=>setStep('more')}>Review other options</button></>}
      </> : <>
      {!todayDestination?.available && <p id={destinationReasonId} className="sheet-footnote">Today: {todayDestination?.reason}</p>}
      <div className="flexible-week-dates">{Array.from({ length: 14 }, (_, i) => addCalendarDays(today, i)).map(d => {
        const occupied = sessions.some(s => s.logicalSessionId !== sessionId && s.scheduledDate === d && s.status !== 'skipped');
        return <button key={d} data-move-date={d} disabled={!validDates.includes(d)} aria-pressed={proposal?.request.mode==='move' && proposal.request.sessionId===sessionId && proposal.request.toDate===d} aria-label={`${dateLabel(d)}${occupied ? ', another workout scheduled' : ''}`} aria-describedby={d===today&&!todayDestination?.available?destinationReasonId:undefined} onClick={() => chooseDestination(d)}>{dateLabel(d)}</button>;
      })}</div></>}
      {!missedDestination && !resolutionMove && !item.firstPlanWeek && <>{swapCandidates.length>0 && <button className="text-button" onClick={()=>setStep('swap')}>Swap with another workout</button>}
      {canAdjustWeek&&<button className="text-button" onClick={() => setStep('available')}>Adjust remaining week{item.originalDate>addCalendarDays(weekKey(today),6)?' (through this Sunday)':''}</button>}
      <button className="text-button" onClick={() => review({ mode: 'skip', sessionId })}>Skip this session</button></>}
      {!resolutionMove && <SheetActionFooter className="flexible-week-footer">
        {error && <p role="alert" className="flexible-week-error">{error}</p>}
        {proposal?.request.mode==='move' && proposal.request.sessionId===sessionId && <>
          <p className="sheet-footnote">{dateLabel(proposal.changes[0].fromDate)} → {dateLabel(proposal.request.toDate)}</p>
          {proposal.adaptationConflict && <p className="sheet-footnote">Your adjusted workout moves with this date.</p>}
          {!validDates.includes(proposal.request.toDate) && <p role="status">This date is no longer available. Choose another date.</p>}
        </>}
        <button className="button primary" disabled={proposal?.request.mode!=='move' || proposal.request.sessionId!==sessionId || !validDates.includes(proposal.request.toDate)} onClick={applyMove}>{persistenceFailed?'TRY AGAIN':firstWeekDestination?'SCHEDULE WORKOUT':'MOVE WORKOUT'}</button>
        <button className="button quiet" onClick={close}>CANCEL</button>
      </SheetActionFooter>}
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
      <h1>{simpleSwap ? 'Swap workouts?' : simpleMove ? `${firstWeekMove?'Schedule':'Move'} ${proposal.changes[0].name}?` : proposal.request.mode==='skip'?`Skip ${proposal.changes[0]?.name || 'this workout'}?`:proposal.request.mode === 'restore' ? 'Restore the schedule?' : 'Your updated schedule'}</h1>
      <p className="review-scope">{proposal.availabilitySchedule?'This week':'One-time change'}</p>
      <div className="flexible-week-review">{proposal.availabilitySchedule ? proposal.availabilitySchedule.filter(c=>c.fromDate!==c.toDate||c.skipped||c.combined||!c.toDate||c.resolution).map(c => <article key={c.logicalSessionId} data-session-id={c.logicalSessionId}>
        <strong>{c.name}</strong>
        <span className={!c.toDate&&!c.skipped?'flexible-needs-day':''}>{c.skipped?`${dateLabel(c.fromDate)} → Skipped`:c.combined?`Combined · ${dateLabel(c.toDate)}`:c.toDate?`${dateLabel(c.fromDate)} → ${dateLabel(c.toDate)}`:'Needs a day'}</span>
        {!c.toDate && !c.skipped && <div className="flexible-resolution-actions" aria-label={`Resolve ${c.name}`}>
          <button className="flexible-move-later" onClick={()=>openResolution(c.logicalSessionId,'destination')}><span>MOVE LATER</span><NavigationChevron/></button>
          {combineOptions.some(p=>p.sourceSessions.some(s=>s.logicalSessionId===c.logicalSessionId)) && <button className="text-button" onClick={()=>openCombine(c.logicalSessionId)}>Combine with another workout</button>}
          <button className="text-button" onClick={()=>openResolution(c.logicalSessionId,'skip-confirm')}>Skip this workout</button>
        </div>}
        {c.resolution && <button className="text-button flexible-resolution-edit" aria-label={`Change resolution for ${c.name}`} onClick={()=>changeResolution(resolutions.filter(r=>r.sessionId!==c.logicalSessionId),c.combined?null:combinedProposal)}>Change</button>}
      </article>) : proposal.changes.map(c => <article key={c.logicalSessionId}><strong>{c.name}</strong><span>{firstWeekMove?'From weekly plan · ':''}{dateLabel(c.fromDate)} → {c.skipped ? 'Skipped' : dateLabel(c.toDate)}</span>{!c.skipped&&c.blockWeekNumber&&weekKey(c.toDate)!==weekKey(c.originalDate)&&<small>Program week {c.blockWeekNumber}</small>}</article>)}</div>
      {proposal.availabilitySchedule?.some(c=>c.fromDate===c.toDate&&!c.skipped&&!c.combined&&!c.resolution)&&<ReviewDetails title="Unchanged workouts"><div className="flexible-week-review">{proposal.availabilitySchedule.filter(c=>c.fromDate===c.toDate&&!c.skipped&&!c.combined&&!c.resolution).map(c=><article key={c.logicalSessionId}><strong>{c.name}</strong><span>{dateLabel(c.toDate)}</span></article>)}</div></ReviewDetails>}
      {combinedProposal && <button className="text-button" onClick={()=>{setCombinePreview(combinedProposal);setStep('combine-preview');}}>Review combined workout</button>}
      {proposal.dateConflicts?.map(conflict=><p className="sheet-footnote" key={conflict.date}>{dateLabel(conflict.date)} already has {conflict.name}. That workout stays in place; this date is not used.{proposal.unresolvedCount>0?' Choose another date.':''}</p>)}
      {!proposal.changes.length && !proposal.availabilitySchedule && <p>Clear stale or past unstarted overrides. Completed and active sessions remain fixed.</p>}
      {proposal.warnings.map(w => <p className="sheet-footnote" key={w}>{w}</p>)}
      {proposal.adaptationConflict && (proposal.request.mode === 'skip' ? <p className="sheet-footnote">Skipping also clears this session’s today-only adjustment.</p> : <fieldset className="flexible-adjustment-choice"><legend>This workout has a today-only adjustment.</legend>{[['restore', 'Restore original workout'], ['keep', 'Keep adjusted workout']].map(([value, label]) => <label key={value}><input type="radio" name="move-adjustment" checked={adaptationChoice === value} onChange={() => setAdaptationChoice(value)} />{label}</label>)}</fieldset>)}
      <SheetActionFooter className="flexible-week-footer" separate={Boolean(proposal.unresolvedCount)}>{error && <p role="alert" className="flexible-week-error">{error}</p>}
        {proposal.unresolvedCount>0 && <p role="status">{proposal.unresolvedCount} {proposal.unresolvedCount===1?'workout still needs':'workouts still need'} a date.</p>}
        {proposal.availabilitySchedule && <div className="flexible-review-controls"><button className="button quiet" onClick={editDays}>EDIT DAYS</button><button className="button quiet" onClick={close}>CANCEL</button></div>}
        {reorderRows.length>0 && <button className="text-button flexible-reorder-action" onClick={()=>{setError('');setStep('reorder');}}>Reorder workouts <NavigationChevron/></button>}
        <button className={`button ${proposal.unresolvedCount?'secondary':'primary'}`} disabled={proposal.status!=='ready' || proposal.canApplySchedule===false} onClick={apply}>{error && persistenceFailed ? 'TRY AGAIN' : simpleSwap ? 'SWAP WORKOUTS' : simpleMove ? firstWeekMove?'SCHEDULE WORKOUT':'MOVE WORKOUT' : proposal.request.mode==='skip'?'SKIP WORKOUT':'APPLY SCHEDULE'}</button>{!proposal.availabilitySchedule && <button className="button quiet" onClick={close}>CANCEL</button>}</SheetActionFooter>
    </>}
    {step==='reorder' && reorderRows.length>0 && <>
      <h1>Reorder workouts</h1>
      <FlexibleWeekReorder rows={reorderRows} identity={proposal.fingerprint} scrollRef={screenRef} onReorder={reorderWorkouts}/>
      {proposal.warnings.map(warning=><p className="sheet-footnote" key={warning}>{warning}</p>)}
      {proposal.adaptationConflict&&<fieldset className="flexible-adjustment-choice"><legend>Use which workout?</legend>{[['restore','Use planned workout'],['keep','Keep adjustment']].map(([value,label])=><label key={value}><input type="radio" name="reorder-adjustment" checked={adaptationChoice===value} onChange={()=>setAdaptationChoice(value)}/>{label}</label>)}</fieldset>}
      <SheetActionFooter>{error&&<p role="alert">{error}</p>}<button className="button primary" onClick={proposal.status==='ready'&&proposal.canApplySchedule!==false&&!proposal.unresolvedCount?apply:()=>setStep('review')}>{proposal.status==='ready'&&proposal.canApplySchedule!==false&&!proposal.unresolvedCount?'SAVE ORDER':'CONTINUE'}</button></SheetActionFooter>
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
    {step==='combine-preview' && combinePreview && <><h1>Combine workouts</h1>
      <CoachCombineCard key={combinePreview.id} state={state} action={{proposal:combinePreview}} draftSchedule
        onAccept={({proposal:combined})=>{if(!changeResolution(resolutions,combined))throw new Error('The schedule changed. Review the workouts again.');}} onReviewCancelled={cancelled=>{if(cancelled)setStep('review');}}/>
    </>}
    {step==='done' && <><h1>Workout moved</h1><p role="status">{proposal.changes[0].name} moved to {dateLabel(proposal.changes[0].toDate)}.</p><p>Still uncompleted. Your permanent plan is unchanged.</p><button className="button primary" onClick={close}>DONE</button></>}
    {error && !['review','reorder','destination','restore-confirm'].includes(step) && <p role="alert" className="flexible-week-error">{error}</p>}
  </main>;
}
