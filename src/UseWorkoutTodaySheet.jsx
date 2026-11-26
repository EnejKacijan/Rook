import {createFlexibleWeekPlanner,flexibleReviewFingerprint} from './flexibleWeek.js';
import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {proposeWorkoutToday,applyWorkoutToday} from './useWorkoutToday.js';
import {workoutPerformedDate} from './workoutDates.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {focusNavigationTarget} from './navigationFocus.js';
import {useCalendarDay} from './useCalendarDay.js';
const label=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`));
export function UseWorkoutTodaySheet({state,update,close,Header,request,setDetail,onBack,onShiftWeek,className=''}) {
  const today=useCalendarDay();
  const [reviewState,setReviewState]=useState(state),[repeatId,setRepeatId]=useState(null);
  const [destination,setDestination]=useState(null),[error,setError]=useState(''),[choosingDate,setChoosingDate]=useState(false);
  const applied=useRef(false),screen=useRef(null),dateAction=useRef(null);
  const effectiveRequest=useMemo(()=>repeatId?{workoutId:repeatId}:request,[repeatId,request]);
  const planner=useMemo(()=>createFlexibleWeekPlanner(state,today),[state,today]);
  const liveProposal=useMemo(()=>proposeWorkoutToday(state,{...effectiveRequest,displacedToDate:destination},today,{planner}),[state,today,effectiveRequest,destination,planner]);
  const changed=useMemo(()=>state!==reviewState && flexibleReviewFingerprint(state)!==flexibleReviewFingerprint(reviewState),[state,reviewState]);
  const proposal=changed ? liveProposal.status==='conflict'?liveProposal:{status:'stale',error:'Your schedule changed. Review the updated workout before applying.'} : liveProposal;
  const completed=state.workouts.find(w=>w.id===proposal.completedWorkoutId && w.completedAt);
  const performedDate=completed && workoutPerformedDate(completed);
  const repeat=useMemo(()=>completed && proposeWorkoutToday(state,{workoutId:completed.id},today,{planner,eligibilityOnly:true}),[state,today,completed,planner]);
  const canRepeat=repeat?.status==='ready' || repeat?.status==='choose-date';
  const canShiftWeek=useMemo(()=>Boolean(liveProposal.displaced&&!changed&&(onShiftWeek||setDetail)&&effectiveRequest.sessionId&&planner.check({mode:'recover-week',sessionId:effectiveRequest.sessionId}).status==='ready'),[changed,onShiftWeek,setDetail,effectiveRequest,planner,liveProposal.displaced]);
  const conflict=proposal.status==='choose-date',picker=conflict&&choosingDate;
  const displacedName=proposal.displaced?.workout.name;
  const swapDestination=proposal.swapProposal?.changes.find(change=>change.logicalSessionId===proposal.displaced?.logicalSessionId)?.toDate;
  const sourceDate=proposal.moveProposal?.changes[0]?.fromDate || proposal.sourceDate;
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
  const sessions=picker?planner.sessions():[];
  return <main ref={screen} className={`screen detail-screen use-workout-today-sheet${className?` ${className}`:''}`}>
    <Header title={picker?`Move ${displacedName}`:conflict?'Train today':'Use this workout today'} onBack={goBack} onClose={close}/>
    {completed?<><h1>{completed.name}</h1><p role="status">{performedDate?`Performed ${label(performedDate)}.`:'Completed workout.'}</p>{setDetail && <button className="button secondary" onClick={()=>setDetail({completedWorkout:completed.id})}>View completed workout</button>}<button className="text-button" disabled={!canRepeat} onClick={()=>{setRepeatId(completed.id);setReviewState(state);setDestination(null);setError('');setChoosingDate(false);}}>Repeat today</button>{!canRepeat && <p>{repeat?.error}</p>}</>:
      picker?<><h1 tabIndex={-1}>Move {displacedName}</h1><p>Choose a new date for this workout.</p><div className="flexible-week-dates">{proposal.dates.map(date=>{
        const scheduled=sessions.find(session=>session.scheduledDate===date&&!['skipped','superseded'].includes(session.status));
        return <button key={date} onClick={()=>{setDestination(date);setError('');}}><strong>{label(date)}</strong><small>{scheduled?.workout.name || 'Rest day'}</small></button>;
      })}</div>{!proposal.dates.length && <p>No dates are free in the next 14 days. Adjust your week first.</p>}</>:
      conflict?<><p className="review-scope">One-time change</p><h1 tabIndex={-1}>Train {proposal.sourceName} today?</h1><p>Today already has {displacedName}.{proposal.canKeepBoth && ' You can do both in either order.'}</p>{swapDestination && <div className="review-change-list">{proposal.swapProposal.changes.map(change=><div className="review-change-row" key={change.logicalSessionId}><strong>{change.name}</strong><span>{label(change.fromDate)} → {label(change.toDate)}</span></div>)}</div>}</>:
      proposal.status==='ready'?<><p className="review-scope">{proposal.kind==='repeat'?'New session · Today':'One-time change'}</p><h1 tabIndex={-1}>Use {proposal.sourceName} today?</h1>{sourceDate && <p>{label(sourceDate)} → Today</p>}{proposal.kind==='repeat'&&<p>Same exercises, fresh sets.</p>}{proposal.displaced && <div className="review-change-row"><strong>{displacedName}</strong><span>Today → {label(destination)}</span></div>}</>:<p role="alert">{proposal.error}</p>}
    {error && <p role="alert">{error}</p>}
    {proposal.status==='conflict' && !completed && setDetail && <button className="button secondary" onClick={()=>setDetail({flexibleWeek:{}})}>Review current schedule</button>}
    {proposal.status==='stale' && <button className="button secondary" onClick={()=>{setReviewState(state);setDestination(null);setChoosingDate(false);setError('');}}>Review updated workout</button>}
    <SheetActionFooter>
      {conflict && !picker && proposal.canKeepBoth && <button className="button primary"
        onClick={() => apply(proposeWorkoutToday(state,{...effectiveRequest,keepBoth:true}))}>Keep both today</button>}
      {canShiftWeek&&<button className="button primary" onClick={()=>onShiftWeek?onShiftWeek():setDetail({flexibleWeek:{sessionId:effectiveRequest.sessionId,shift:true}})}>SHIFT THE REST OF THIS WEEK</button>}
      {conflict&&!picker&&<>{swapDestination&&<button className="button primary" onClick={()=>apply(proposeWorkoutToday(state,{...effectiveRequest,swap:true}))}>SWAP WORKOUTS</button>}{proposal.dates.length>0 && <button ref={dateAction} className="button secondary" onClick={()=>{setChoosingDate(true);setError('');}}>Choose another date for {displacedName}</button>}</>}
      {proposal.status==='ready' && <button className="button primary" onClick={()=>apply(proposal)}>{proposal.kind==='repeat'?'REPEAT TODAY':'USE TODAY'}</button>}
      <button className="button quiet" onClick={onBack||close}>CANCEL</button>
    </SheetActionFooter>
  </main>;
}
