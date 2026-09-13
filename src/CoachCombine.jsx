import React,{useLayoutEffect,useRef,useState} from 'react';
import {exerciseName,saveState} from './domain.js';
import {formatExportSet} from './workoutExport.js';
import {effectiveGymContext} from './gymProfiles.js';
import {reviewCombinedSelection} from './combineWorkouts.js';
import {combinedAdjustment,cancelCombinedWorkout,persistCombinedState,isCombinedAdjustment} from './combinedWorkoutLifecycle.js';
import './coachCombine.css';

const dateLabel=date=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
// Same pointer-focus ownership as Coach Send: the composer must not move the
// target between pointerdown and click. Keyboard focus remains fully available.
const keepComposerFocus=event=>{
 if(event.button===0&&event.target.closest('button')&&document.activeElement?.matches('.coach-input textarea'))event.preventDefault();
};
export function CombinedProvenance({adjustment}){
 if(!isCombinedAdjustment(adjustment))return null;
 return <div className="combined-provenance"><small>Combined from</small>{adjustment.sourceSessions.map(s=><span key={s.logicalSessionId}>{s.name} · {dateLabel(s.scheduledDate)}</span>)}</div>;
}
export function CombinedWorkoutNotice({state,update}){
 const [error,setError]=useState(''),lock=useRef(false),a=combinedAdjustment(state);
 if(!a)return null;
 const logged=state.activeWorkout?.adjustment?.id===a.id&&state.activeWorkout.exercises.some(e=>e.sets.some(s=>s.completed));
 const cancel=()=>{if(lock.current)return;lock.current=true;try{
   const next=persistCombinedState(state,cancelCombinedWorkout(state),saveState);
   update(()=>next,{planVersion:false,persistedState:next});
 }catch(e){setError(e.message);}finally{lock.current=false;}};
 return <aside className="combined-notice"><strong>Combined workout · Today only</strong>
   <small>{logged?'Finish early to keep logged sets and release both source sessions.':'Both source sessions are reserved, not completed. Cancelling releases both.'}</small>
   {!logged&&<button type="button" className="text-button" onClick={cancel}>Cancel combined workout</button>}
   {error&&<p role="alert">{error}</p>}</aside>;
}
export function CoachCombineChoices({request,onSend,busy}){
 const [selected,setSelected]=useState([]);
 if(request.step==='time')return <div className="coach-quick-questions combine-choices" onPointerDownCapture={keepComposerFocus}>{['45 min','60 min','75 min','90 min','No strict limit'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>onSend(label)}>{label}</button>)}<small>Or enter another total time in the conversation.</small></div>;
 if(request.step==='target')return <div className="coach-quick-questions combine-choices" onPointerDownCapture={keepComposerFocus}>{request.choices.map(s=><button type="button" key={s.id} disabled={busy} onClick={()=>onSend(s.label,{targetId:s.id})}>{s.label}</button>)}</div>;
 return <fieldset className="combine-choices" onPointerDownCapture={keepComposerFocus}><legend>Choose two planned sessions</legend>{request.choices.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={busy||selected.length===2&&!selected.includes(s.id)} onChange={()=>setSelected(current=>current.includes(s.id)?current.filter(id=>id!==s.id):[...current,s.id])}/><span>{s.label}</span></label>)}
 <button type="button" className="button secondary" disabled={busy||selected.length!==2} onClick={()=>onSend(`Combine ${request.choices.filter(s=>selected.includes(s.id)).map(s=>s.label).join(' and ')}.`,{sourceIds:selected})}>CONTINUE</button></fieldset>;
}
export function CoachCombineCard({action,result,state,onAccept,onViewToday,reviewDraft,onReviewChange,onReviewCancelled}){
 const [reviewing,setReviewing]=useState(false),[error,setError]=useState(''),[proposal,setProposal]=useState(reviewDraft||action.proposal),lock=useRef(false);
 const backRef=useRef(null),reviewRef=useRef(null),wasReviewing=useRef(false);
 useLayoutEffect(()=>{
   if(reviewing)backRef.current?.focus({preventScroll:true});
   else if(wasReviewing.current)reviewRef.current?.focus({preventScroll:true});
   wasReviewing.current=reviewing;
 },[reviewing]);
 if(result?.status==='applied'){
   const pending=combinedAdjustment(state)?.id===result.workoutId;
   const history=state.workouts.find(w=>w.adjustment?.id===result.workoutId);
   return <div className="action-card action-card-applied" role="status"><h3>{pending?'Combined workout applied':history?.combinedSourcesResolved?'Combined workout completed':history?'Combined workout finished early':'Combined workout cleared'}</h3>
     <small>{pending?'Your weekly plan is unchanged. The sources resolve only after you finish this workout.':history?.combinedSourcesResolved?'One real workout is logged. Both source sessions are resolved.':'This adjustment no longer reserves either source session.'}</small>
     <button className="text-button action-view-today" onClick={onViewToday}>{pending?'View workout →':'View Today →'}</button></div>;
 }
 const original=action.proposal,selected=new Set(proposal.workout.exercises.map(e=>e.id));
 const candidate=exercise=>{
   const group=original.workout.exercises.filter(e=>exercise.supersetId?e.supersetId===exercise.supersetId:e.id===exercise.id),ids=new Set(selected);
   group.forEach(e=>selected.has(exercise.id)?ids.delete(e.id):ids.add(e.id));
   return reviewCombinedSelection(original,[...ids],effectiveGymContext(state,{}).profile);
 };
 const apply=()=>{if(lock.current)return;lock.current=true;setError('');try{onAccept({...action,proposal});}catch(e){lock.current=false;setError(e.message);}};
 return <div onPointerDownCapture={keepComposerFocus} className={`action-card combine-card${reviewing?' action-card-reviewing combine-review-surface':''}`}>
   {reviewing&&<button ref={backRef} type="button" className="text-button" aria-label="Back to combined workout proposal" onClick={()=>{setReviewing(false);setError('');}}>‹ Back</button>}
   <h3>{proposal.revisionSummary?'Updated combined workout':'Combined workout'}</h3><p>~{Math.round(proposal.workout.estimatedMinutes)} min · Today only</p><CombinedProvenance adjustment={proposal}/>
   {!reviewing?<button ref={reviewRef} type="button" className="button secondary" onClick={()=>{setReviewing(true);if(proposal.revisionSummary)onReviewCancelled?.(false);}}>REVIEW COMBINED WORKOUT</button>:<>
     {proposal.revisionSummary&&<div className="combine-revision-summary"><strong>Estimate: ~{Math.round(proposal.revisionSummary.previousMinutes)} → ~{Math.round(proposal.estimatedMinutes)} min</strong><span>New total-time target: {proposal.requestedMinutes===null?'No strict limit':`${proposal.requestedMinutes} min`}</span>
       {proposal.revisionSummary.added.map(e=><span key={e.id}>{e.origin==='coach-added'?'Coach-added':'Restored from source'}: {e.name}</span>)}
       {proposal.revisionSummary.removed.map(e=><span key={e.id}>Removed: {e.name}</span>)}
       {proposal.revisionSummary.sets.map(e=><span key={e.id}>{e.name}: {e.before} → {e.after} sets</span>)}
       {!proposal.revisionSummary.added.length&&!proposal.revisionSummary.removed.length&&!proposal.revisionSummary.sets.length&&<span>Content unchanged within current training limits.</span>}
     </div>}
     <p>{proposal.explanation}</p><div className="adapt-review-list">{original.workout.exercises.map(e=>{
       const next=candidate(e);
       return <button type="button" key={e.id} aria-pressed={selected.has(e.id)} disabled={!next} onClick={()=>{setProposal(next);onReviewChange?.(next);setError('');}}><span aria-hidden="true">{selected.has(e.id)?'✓':'+'}</span><span><strong>{exerciseName(e)}</strong><small>{e.sets.length} sets · {formatExportSet(e,e.sets[0],{units:state.profile.units,completed:false})}{e.supersetId?' · Superset':''}{e.combinedOrigin==='coach-added'?' · Coach-added recommendation':''}</small></span></button>;
     })}</div><small>Main movement coverage and linked supersets stay together.</small>
     {error&&<p role="alert">{error}</p>}<div className="action-card-buttons"><button type="button" className="button primary" onClick={apply}>{proposal.revisionSummary?'USE UPDATED WORKOUT':'USE THIS WORKOUT'}</button><button type="button" className="button secondary" onClick={()=>{setReviewing(false);setError('');if(proposal.revisionSummary)onReviewCancelled?.(true);}}>CANCEL</button></div>
     <small>Nothing changes until you use this workout. Your permanent plan stays unchanged.</small>
   </>}
 </div>;
}
