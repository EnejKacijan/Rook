import React,{useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {exerciseName,pluralize} from './domain.js';
import {reviewPlanWorkoutStart} from './planWorkoutSchedule.js';
import {AnimatedDetails} from './AnimatedDetails.jsx';

export const planStartDate=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});

export function PlanWorkoutStartSheet({state,reference,snapshot,Modal,Header,close,confirm,startExtra,error,backgroundRef,returnFocusRef}){
  const [sessionId,setSessionId]=useState(snapshot.options.length===1?snapshot.options[0].id:'');
  const [destination,setDestination]=useState('');
  const option=snapshot.options.find(item=>item.id===sessionId);
  const displacedTo=destination||option?.destinations[0];
  let review,reviewError='';
  if(option){try{review=reviewPlanWorkoutStart(state,{reference,snapshot,sessionId,displacedTo});}catch(e){reviewError=e.message;}}
  const submitted=useRef(false);
  return createPortal(<Modal close={close} backgroundRef={backgroundRef} returnFocusRef={returnFocusRef} lockDocument={false}>{requestClose=><main className="screen detail-screen plan-start-sheet" role="dialog" aria-modal="true" aria-label="Start from your plan">
    <Header title="From your plan" onBack={requestClose} onClose={requestClose}/>
    <div className="plan-start-content">
      <h1>Do your planned workout today?</h1>
      <p className="plan-start-description">It will count toward your plan when you finish.</p>
      {snapshot.options.length>1?<label className="plan-start-field">Choose the scheduled workout<select value={sessionId} onChange={event=>{setSessionId(event.target.value);setDestination('');}}><option value="">Choose a date</option>{snapshot.options.map(item=><option key={item.id} value={item.id}>{item.name} · {item.status==='missed'?'Missed · ':''}{planStartDate(item.date)}</option>)}</select></label>:<div className="plan-start-source"><strong>{option?.name}</strong><span>{option?.status==='missed'?'Missed · ':'Scheduled · '}{option&&planStartDate(option.date)}</span></div>}
      {option&&option.originalDate!==option.date&&<p className="plan-start-description">Originally {planStartDate(option.originalDate)}</p>}
      {option?.destinations.length>0&&<label className="plan-start-field">Move today’s workout to<select aria-label="New date for today’s workout" value={displacedTo} onChange={event=>setDestination(event.target.value)}>{option.destinations.map(date=><option key={date} value={date}>{planStartDate(date)}{date===option.destinations[0]?' · Suggested':''}</option>)}</select></label>}
      {review&&<>
        <section className="plan-start-changes" aria-label="Schedule changes"><h2>Schedule changes</h2>{[...review.changes].sort((a,b)=>Number(b.logicalSessionId===sessionId)-Number(a.logicalSessionId===sessionId)).map(change=><div key={change.logicalSessionId}><strong>{change.name}</strong><span>{planStartDate(change.fromDate)} → {planStartDate(change.toDate)}</span></div>)}</section>
        {review.warnings.map(warning=><p key={warning} className="plan-start-description">{warning}</p>)}
        <AnimatedDetails key={sessionId} defaultOpen={review.adjusted} className="plan-start-exercises"><summary>{review.adjusted?'Adjusted for this date':'Today’s exercises'} · {pluralize(review.workout.exercises.length,'exercise')}</summary><ol>{review.workout.exercises.map(exercise=><li key={exercise.id}><strong>{exerciseName(exercise)}</strong><span>{pluralize(exercise.sets.length,'set')} · {exercise.repMin}{exercise.repMax!==exercise.repMin?`–${exercise.repMax}`:''}</span></li>)}</ol></AnimatedDetails>
      </>}
      {(reviewError||error)&&<p role="alert">{reviewError||error}</p>}
    </div>
    <div className="plan-start-actions"><button className="button primary" type="button" disabled={!review||Boolean(reviewError)} onClick={()=>{if(submitted.current)return;submitted.current=true;const success=confirm({snapshot,sessionId,displacedTo});if(!success)submitted.current=false;}}>{review?.mode==='swap'?'Swap and start':'Confirm changes & start'}</button><button className="text-button" type="button" onClick={startExtra}>Start as extra</button><small>Extra workouts leave your schedule unchanged.</small></div>
  </main>}</Modal>,document.body);
}
