import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {proposeFlexibleWeek,flexibleReviewFingerprint} from './flexibleWeek.js';
import React,{useRef,useState} from 'react';
import {proposeWorkoutToday,applyWorkoutToday,canUseWorkoutToday} from './useWorkoutToday.js';
import {workoutPerformedDate} from './workoutDates.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
const label=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`));
export function UseWorkoutTodaySheet({state,update,close,Header,request,setDetail,onBack}) {
  const [reviewState,setReviewState]=useState(state),[repeatId,setRepeatId]=useState(null);
  const [destination,setDestination]=useState(null),[error,setError]=useState('');
  const applied=useRef(false);
  const [swapping,setSwapping]=useState(false);
  const effectiveRequest=repeatId?{workoutId:repeatId}:request;
  const liveProposal=proposeWorkoutToday(state,{...effectiveRequest,displacedToDate:destination});
  const changed=flexibleReviewFingerprint(state)!==flexibleReviewFingerprint(reviewState);
  const proposal=changed ? liveProposal.status==='conflict'?liveProposal:{status:'stale',error:'Your schedule changed. Review the updated workout before applying.'} : liveProposal;
  const completed=state.workouts.find(w=>w.id===proposal.completedWorkoutId && w.completedAt);
  const performedDate=completed && workoutPerformedDate(completed);
  if(swapping && !completed)return <FlexibleWeekSheet state={state} update={update} close={close} Header={Header} setDetail={setDetail} request={{sessionId:effectiveRequest.sessionId,otherSessionId:proposal.displaced?.logicalSessionId,swap:true}}/>;
  return <main className="screen detail-screen use-workout-today-sheet">
    <Header title="Use this workout today" onBack={onBack} onClose={close}/>
    {completed?<><h1>{completed.name}</h1><p role="status">{performedDate?`Performed ${label(performedDate)}.`:'Completed workout.'}</p>{setDetail && <button className="button secondary" onClick={()=>setDetail({completedWorkout:completed.id})}>View completed workout</button>}<button className="text-button" disabled={!canUseWorkoutToday(state,{workoutId:completed.id})} onClick={()=>{setRepeatId(completed.id);setReviewState(state);setDestination(null);setError('');setSwapping(false);}}>Repeat today</button>{!canUseWorkoutToday(state,{workoutId:completed.id}) && <p>{proposeWorkoutToday(state,{workoutId:completed.id}).error}</p>}</>:
    proposal.status==='choose-date'?<><h1>Use {proposal.sourceName} today instead of {proposal.displaced.workout.name}?</h1><p>Choose a new date for {proposal.displaced.workout.name}. It stays uncompleted. Your permanent plan stays unchanged.</p>{effectiveRequest.sessionId && proposeFlexibleWeek(state,{mode:'swap',sessionId:effectiveRequest.sessionId,otherSessionId:proposal.displaced.logicalSessionId}).status==='ready' && <button className="text-button" onClick={()=>setSwapping(true)}>Swap these workouts</button>}<div className="flexible-week-dates">{proposal.dates.map(date=><button key={date} onClick={()=>{setDestination(date);setError('');}}>{label(date)}</button>)}</div>{!proposal.dates.length && <p>No dates are free in the next 14 days. Adjust your week first.</p>}</>:
      proposal.status==='ready'?<><h1>Use {proposal.sourceName} today{proposal.displaced?` instead of ${proposal.displaced.workout.name}`:''}?</h1>{proposal.sourceDate && <p>From {label(proposal.sourceDate)}.</p>}<p>{proposal.kind==='repeat'?'Start a new session from this workout. Your original history stays unchanged; no completed sets are copied.':'Move this uncompleted occurrence to today. It is not marked completed until you train.'}</p>{proposal.displaced && <p>{proposal.displaced.workout.name} moves to {label(destination)} and stays uncompleted.</p>}<p>Your permanent plan stays unchanged.</p></>:<p role="alert">{proposal.error}</p>}
    {error && <p role="alert">{error}</p>}
    {proposal.status==='stale' && <button className="button secondary" onClick={()=>{setReviewState(state);setDestination(null);setError('');}}>Review updated workout</button>}
    <SheetActionFooter>{proposal.status==='ready' && <button className="button primary" onClick={()=>{if(applied.current)return;try{const next=applyWorkoutToday(state,proposal);applied.current=true;update(()=>next,{planVersion:false,persistedState:next});close();}catch(e){setError(e.message);}}}>APPLY</button>}<button className="button quiet" onClick={onBack||close}>CANCEL</button></SheetActionFooter>
  </main>;
}
