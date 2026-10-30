import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {combineFingerprint} from './combineWorkouts.js';
import {missedCombineSources,reviewMissedWorkoutCombine,applyMissedWorkoutCombine} from './missedWorkoutCombine.js';
import {CoachCombineCard} from './CoachCombine.jsx';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {useCalendarDay} from './useCalendarDay.js';
import {focusNavigationTarget} from './navigationFocus.js';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {saveState} from './domain.js';
import {touchCoachConversation} from './coachConversations.js';

const dateLabel=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function MissedWorkoutCombine({state,update,close,Header,onBack,sessionId,setDetail,onApplied,initialRequest,coachOrigin}) {
  const today=useCalendarDay(),sources=useMemo(()=>missedCombineSources(state,today),[state,today]);
  const [initialReview]=useState(()=>initialRequest?initialRequest.fingerprint&&initialRequest.fingerprint!==combineFingerprint(state)?{status:'conflict',error:'Your workouts changed. Review the current pair again.'}:reviewMissedWorkoutCombine(state,initialRequest,today):null);
  const [selected,setSelected]=useState(()=>{
    if(initialRequest?.sourceIds)return initialRequest.sourceIds.filter(id=>sources.some(source=>source.logicalSessionId===id));
    const missed=sources.filter(source=>source.status==='missed');
    return missed.length===2&&(!sessionId||missed.some(source=>source.logicalSessionId===sessionId))?
      missed.map(source=>source.logicalSessionId):sources.some(source=>source.logicalSessionId===sessionId)?[sessionId]:[];
  });
  const [minutes,setMinutes]=useState(()=>initialRequest?.minutes===null?'none':String(initialRequest?.minutes??(state.profile.sessionMinutes>=10&&state.profile.sessionMinutes<=180?state.profile.sessionMinutes:60)));
  const [review,setReview]=useState(initialReview?.status==='ready'?initialReview:null),[dateChoice,setDateChoice]=useState(initialReview?.status==='choose-date'?initialReview:null),[error,setError]=useState(initialReview?.status==='conflict'?initialReview.error:''),[sourceReview,setSourceReview]=useState(false),[scheduleReview,setScheduleReview]=useState(false);
  const applied=useRef(false),screen=useRef(null);
  const view=review?'review':dateChoice?'dates':'sources';
  useLayoutEffect(()=>{if(screen.current){screen.current.scrollTop=0;focusNavigationTarget(screen.current.querySelector('h1'));}},[view]);
  const fingerprint=combineFingerprint(state);
  const liveSelected=selected.filter(id=>sources.some(source=>source.logicalSessionId===id));
  const stale=Boolean(!applied.current&&(review||dateChoice)&&((review||dateChoice).fingerprint!==fingerprint||(review||dateChoice).today!==today));
  const reset=()=>{setReview(null);setDateChoice(null);setError('');setSourceReview(false);setScheduleReview(false);setSelected(ids=>ids.filter(id=>sources.some(source=>source.logicalSessionId===id)));};
  const back=review?()=>{setReview(null);setError('');}:dateChoice?()=>{setDateChoice(null);setError('');}:onBack;
  const prepare=displacedToDate=>{
    setError('');setSourceReview(false);setScheduleReview(false);
    const result=reviewMissedWorkoutCombine(state,{sourceIds:liveSelected,minutes:minutes==='none'?null:Number(minutes),...(displacedToDate?{displacedToDate}:{})},today);
    if(result.status==='choose-date'){setDateChoice(result);setReview(null);}
    else if(result.status==='ready')setReview(result);
    else {setError(result.error);setSourceReview(Boolean(result.combineReviewRequired)||/custom warm-up|unsupported group/.test(result.error||''));setScheduleReview(Boolean(result.scheduleReviewRequired));}
  };
  const apply=proposal=>{
    if(applied.current)return;
    const next=applyMissedWorkoutCombine(state,review,proposal,{persist:next=>{
      if(coachOrigin){
        const entry=next.conversations.find(item=>item.id===coachOrigin.entryId&&item.conversationId===coachOrigin.conversationId);
        if(!entry||entry.coachActionsArchived||entry.coachWorkflowStatus==='cancelled'||entry.combineReviewCancelled||entry.actionResult||entry.reply?.combineRequest?.step!=='review'||entry.reply.combineRequest.profileId!==next.profile.id||entry.reply.combineRequest.planId!==next.program?.id)throw Error('This Coach review changed. Ask for a new combination.');
        entry.actionResult={status:'applied',appliedAt:Date.now(),scope:'combined-occurrences',workoutId:next.todayAdaptation.id,sourceIds:next.todayAdaptation.sourceSessions.map(source=>source.logicalSessionId)};
        if(next.coachConversationMeta?.[entry.conversationId])delete next.coachConversationMeta[entry.conversationId].dayContext;
        touchCoachConversation(next,entry.conversationId,Date.now(),{user:true});
      }
      return saveState(next);
    }});
    applied.current=true;onApplied?.();update(()=>next,{planVersion:false,persistedState:next});close();
  };
  const limits=[...new Set([30,45,60,75,90,Number(minutes)].filter(value=>Number.isFinite(value)&&value>=10&&value<=180))].sort((a,b)=>a-b);
  const sourceRows=rows=>rows.map(source=><label key={source.logicalSessionId}>
    <input type="checkbox" checked={liveSelected.includes(source.logicalSessionId)} disabled={liveSelected.length===2&&!liveSelected.includes(source.logicalSessionId)} onChange={()=>{
      setError('');setSelected(liveSelected.includes(source.logicalSessionId)?liveSelected.filter(id=>id!==source.logicalSessionId):[...liveSelected,source.logicalSessionId]);
    }}/><span><strong>{source.workout.name}</strong><small>{source.scheduledDate===today?'Today · ':''}{dateLabel(source.scheduledDate)}</small></span>
  </label>);
  return <main ref={screen} className="screen detail-screen flexible-week-sheet missed-combine-sheet">
    <Header title="Combine workouts" onBack={back} onClose={close}/>
    {stale?<><h1 tabIndex={-1}>Your workouts changed</h1><p>Review the current workouts before combining.</p><button className="button primary" onClick={reset}>CHOOSE WORKOUTS AGAIN</button></>:
      review?<><h1 tabIndex={-1}>Your combined workout</h1>
        {review.move&&<div className="review-change-row missed-combine-move" role="group" aria-label="Additional schedule change"><strong>Also move {review.move.name}</strong><span>{dateLabel(review.move.fromDate)} → {dateLabel(review.move.toDate)}</span></div>}
        <CoachCombineCard key={review.proposal.id} state={review.stagedState} action={{proposal:review.proposal}} compact hideTitle applyLabel={review.move?'SAVE BOTH CHANGES':undefined} onAccept={({proposal})=>apply(proposal)}/>
      </>:dateChoice?<><h1 tabIndex={-1}>Make room for today</h1><p>Today already has {dateChoice.displaced.workout.name}. Choose a new date for it.</p>
        <div className="flexible-week-dates">{dateChoice.dates.map(date=><button key={date} data-combine-move-date={date} onClick={()=>prepare(date)}>{dateLabel(date)}</button>)}</div>
      </>:<><h1 tabIndex={-1}>Combine two workouts</h1><p>One workout for today. Your recurring plan stays unchanged.</p>
        {sources.length<2?<p role="status">There aren’t two available workouts to combine.</p>:<>
          <fieldset className="missed-combine-sources"><legend>Choose two workouts</legend>
            {sources.some(source=>source.status==='missed')&&<section><h2>Missed</h2>{sourceRows(sources.filter(source=>source.status==='missed'))}</section>}
            {sources.some(source=>source.status!=='missed')&&<AnimatedDetails className="missed-combine-other" defaultOpen={sources.filter(source=>source.status==='missed').length<2}><summary>Other workouts</summary><section><h2>Upcoming</h2>{sourceRows(sources.filter(source=>source.status!=='missed'))}</section></AnimatedDetails>}
          </fieldset>
          <label className="missed-combine-time">Time for today<select value={minutes} onChange={event=>{setMinutes(event.target.value);setError('');}}>{limits.map(value=><option key={value} value={value}>{value} min</option>)}<option value="none">No strict limit</option></select></label>
        </>}
      </>}
    {error&&<p role="alert">{error}</p>}
    {error&&sourceReview&&setDetail&&<button className="text-button" onClick={()=>setDetail('edit-plan')}>Review source workouts</button>}
    {error&&scheduleReview&&setDetail&&<button className="text-button" onClick={()=>setDetail({flexibleWeek:{reviewExisting:true}})}>Review schedule changes</button>}
    {!review&&!stale&&<SheetActionFooter>{!dateChoice&&sources.length>=2&&<button className="button primary" disabled={liveSelected.length!==2} onClick={()=>prepare()}>PREVIEW WORKOUT</button>}<button className="button quiet" onClick={onBack}>CANCEL</button></SheetActionFooter>}
  </main>;
}
