import React,{useRef,useState} from 'react';
import {exerciseName,uid,displayWeight,weightUnit} from './domain.js';
import {resolveCoachWorkoutReuse,startCoachWorkoutReuse} from './coachWorkoutReuse.js';
import {useDurableAction} from './useDurableAction.js';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {SheetActionFooter} from './SheetActionFooter.jsx';

export function CoachWorkoutReuseSheet({state,update,reference,entryId,Header,close,onStarted,setDetail}){
  const {commit}=useDurableAction(state,update),request=useRef(uid('coach-reuse'));
  const [error,setError]=useState('');
  const [review]=useState(()=>{try{return {draft:resolveCoachWorkoutReuse(state,reference)};}catch(e){return {error:e.message};}});
  let changed=false;try{changed=JSON.stringify(resolveCoachWorkoutReuse(state,reference))!==JSON.stringify(review.draft);}catch{changed=true;}
  const draft=review.draft;
  const start=()=>{try{const result=commit(current=>{
    const entry=entryId&&current.conversations.find(item=>item.id===entryId);
    if(entryId&&(!entry||entry.coachWorkflowStatus==='cancelled'||entry.actionResult||!entry.reply?.action?.choices?.some(choice=>JSON.stringify(choice.reference)===JSON.stringify(reference))))throw Error('This Coach review is no longer available. Ask for your workout again.');
    const next=startCoachWorkoutReuse(current,{reference,requestId:request.current,reviewedPrescription:JSON.stringify(draft)});
    if(entryId)next.conversations=next.conversations.map(item=>item.id===entryId?{...item,actionResult:{status:'applied',workoutId:next.activeWorkout.id,appliedAt:Date.now(),scope:'extra-workout'}}:item);
    return next;
  });if(result.changed)onStarted();}catch(e){setError(e.message);}};
  return <main className="screen detail-screen saved-workouts coach-reuse-sheet"><Header title="Your workout" onClose={close}/><div className="saved-workout-preview">
    {draft&&<><h1>{draft.name}</h1><p>Your exercises, sets and targets.</p><ol className="saved-template-exercises">{draft.exercises.map(e=><li key={e.id}><strong>{exerciseName(e)}</strong><small>{e.sets.length} {e.sets.length===1?'set':'sets'}{e.repMin!=null?` · ${e.repMin}${e.repMax!==e.repMin?`–${e.repMax}`:''} ${e.measure==='seconds'?'sec':'reps'}`:''}{e.loggingMode==='per_side'?' · per side':''}</small><AnimatedDetails><summary>Set targets</summary><ul className="coach-reuse-set-targets">{e.sets.map((s,index)=><li key={s.id||index}>Set {index+1} · {s.weight!=null?`${displayWeight(s.weight,state.profile.units)} ${weightUnit(state.profile.units)} · `:''}{s.reps!=null?`${s.reps} ${e.measure==='seconds'?'sec':'reps'}`:'Target not set'}{s.rir!=null?` · ${s.rir} RIR`:''}</li>)}</ul></AnimatedDetails></li>)}</ol></>}
    {(review.error||changed)&&<p role="alert">{review.error||'This workout changed. Close this preview and choose the original again.'}</p>}
    {error&&<p role="alert">{error}</p>}
  </div><SheetActionFooter><p className="plan-template-note">Your scheduled plan stays unchanged.</p><button type="button" className="button primary" disabled={!draft||changed} onClick={start}>Start extra workout</button>
    {reference.kind==='occurrence'&&<button type="button" className="text-button" onClick={()=>setDetail({flexibleWeek:{sessionId:reference.occurrenceId}})}>Review scheduled workout instead</button>}
  </SheetActionFooter></main>;
}
