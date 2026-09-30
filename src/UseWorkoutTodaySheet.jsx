import {flexibleReviewFingerprint,flexibleSessions} from './flexibleWeek.js';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {proposeWorkoutToday,applyWorkoutToday,canUseWorkoutToday} from './useWorkoutToday.js';
import {workoutPerformedDate} from './workoutDates.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {focusNavigationTarget} from './navigationFocus.js';
const label=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`));
export function UseWorkoutTodaySheet({state,update,close,Header,request,setDetail,onBack,className=''}) {
  const [reviewState,setReviewState]=useState(state),[repeatId,setRepeatId]=useState(null);
  const [destination,setDestination]=useState(null),[error,setError]=useState(''),[choosingDate,setChoosingDate]=useState(false);
  const applied=useRef(false),screen=useRef(null),dateAction=useRef(null);
  const effectiveRequest=repeatId?{workoutId:repeatId}:request;
  const liveProposal=proposeWorkoutToday(state,{...effectiveRequest,displacedToDate:destination});
  const changed=flexibleReviewFingerprint(state)!==flexibleReviewFingerprint(reviewState);
  const proposal=changed ? liveProposal.status==='conflict'?liveProposal:{status:'stale',error:'Your schedule changed. Review the updated workout before applying.'} : liveProposal;
  const completed=state.workouts.find(w=>w.id===proposal.completedWorkoutId && w.completedAt);
  const performedDate=completed && workoutPerformedDate(completed);
  const conflict=proposal.status==='choose-date',picker=conflict&&choosingDate;
  const displacedName=proposal.displaced?.workout.name;
  const swapDestination=proposal.swapProposal?.changes.find(change=>change.logicalSessionId===proposal.displaced?.logicalSessionId)?.toDate;
  const view=picker?'dates':destination?'review':'decision',previousView=useRef(view);
  useLayoutEffect(()=>{
    if(previousView.current===view)return;
    const returning=previousView.current==='dates'&&view==='decision';previousView.current=view;
    if(screen.current)screen.current.scrollTop=0;
    focusNavigationTarget(returning?dateAction.current:screen.current?.querySelector('h1'));
  },[view]);
  const goBack=destination?()=>{setDestination(null);setChoosingDate(true);setError('');}:picker?()=>{setChoosingDate(false);setError('');}:onBack;
  const apply=nextProposal=>{
    if(applied.current)return;
    try{const next=applyWorkoutToday(state,nextProposal);applied.current=true;update(()=>next,{planVersion:false,persistedState:next});close();}catch(e){setError(e.message);}
  };
  const sessions=picker?flexibleSessions(state):[];
  return <main ref={screen} className={`screen detail-screen use-workout-today-sheet${className?` ${className}`:''}`}>
    <Header title={picker?`Move ${displacedName}`:conflict?'Train today':'Use this workout today'} onBack={goBack} onClose={close}/>
    {completed?<><h1>{completed.name}</h1><p role="status">{performedDate?`Performed ${label(performedDate)}.`:'Completed workout.'}</p>{setDetail && <button className="button secondary" onClick={()=>setDetail({completedWorkout:completed.id})}>View completed workout</button>}<button className="text-button" disabled={!canUseWorkoutToday(state,{workoutId:completed.id})} onClick={()=>{setRepeatId(completed.id);setReviewState(state);setDestination(null);setError('');setChoosingDate(false);}}>Repeat today</button>{!canUseWorkoutToday(state,{workoutId:completed.id}) && <p>{proposeWorkoutToday(state,{workoutId:completed.id}).error}</p>}</>:
      picker?<><h1 tabIndex={-1}>Move {displacedName}</h1><p>Choose a new date for this workout.</p><div className="flexible-week-dates">{proposal.dates.map(date=>{
        const scheduled=sessions.find(session=>session.scheduledDate===date&&!['skipped','superseded'].includes(session.status));
        return <button key={date} onClick={()=>{setDestination(date);setError('');}}><strong>{label(date)}</strong><small>{scheduled?.workout.name || 'Rest day'}</small></button>;
      })}</div>{!proposal.dates.length && <p>No dates are free in the next 14 days. Adjust your week first.</p>}</>:
      conflict?<><div className="eyebrow">TRAIN TODAY</div><h1 tabIndex={-1}>Train {proposal.sourceName} today?</h1><p>Today already has {displacedName}.</p>{swapDestination && <p>{proposal.sourceName} today<br/>{displacedName} moves to {label(swapDestination)}</p>}</>:
      proposal.status==='ready'?<><h1 tabIndex={-1}>Use {proposal.sourceName} today{proposal.displaced?` instead of ${displacedName}`:''}?</h1>{proposal.sourceDate && <p>From {label(proposal.sourceDate)}.</p>}<p>{proposal.kind==='repeat'?'Start a new session from this workout. Your original history stays unchanged; no completed sets are copied.':'Move this uncompleted occurrence to today. It is not marked completed until you train.'}</p>{proposal.displaced && <p>{displacedName} moves to {label(destination)} and stays uncompleted.</p>}<p>Your permanent plan stays unchanged.</p></>:<p role="alert">{proposal.error}</p>}
    {error && <p role="alert">{error}</p>}
    {proposal.status==='stale' && <button className="button secondary" onClick={()=>{setReviewState(state);setDestination(null);setChoosingDate(false);setError('');}}>Review updated workout</button>}
    <SheetActionFooter>
      {conflict&&!picker&&<>{swapDestination&&<button className="button primary" onClick={()=>apply(proposeWorkoutToday(state,{...effectiveRequest,swap:true}))}>SWAP WORKOUTS</button>}<button ref={dateAction} className="button secondary" onClick={()=>{setChoosingDate(true);setError('');}}>Choose another date for {displacedName}</button></>}
      {proposal.status==='ready' && <button className="button primary" onClick={()=>apply(proposal)}>APPLY</button>}
      <button className="button quiet" onClick={onBack||close}>CANCEL</button>
    </SheetActionFooter>
  </main>;
}
