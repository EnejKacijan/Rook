import React,{useLayoutEffect,useRef,useState} from 'react';
import {exerciseName,saveState} from './domain.js';
import {formatExportSet} from './workoutExport.js';
import {effectiveGymContext} from './gymProfiles.js';
import {reviewCombinedSelection,buildCombinedProposal} from './combineWorkouts.js';
import {combinedAdjustment,cancelCombinedWorkout,persistCombinedState,isCombinedAdjustment} from './combinedWorkoutLifecycle.js';
import './coachCombine.css';
import {NavigationChevron} from './NavigationChevron.jsx';
import {Disclosure} from './Disclosure.jsx';
import {useDurableAction} from './useDurableAction.js';
import {combinedWorkoutNoticeKey,combinedWorkoutNoticeHidden,setCombinedWorkoutNoticeHidden} from './combinedWorkoutPresentation.js';

const dateLabel=date=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function CombineWorkoutHint({onStart}){
 return <button type="button" className="list-row combine-discovery-hint" onClick={onStart}>
   <span><strong>Combine two workouts for today</strong><small>Choose two available sessions and review one workout.</small></span><NavigationChevron />
 </button>;
}
// Same mouse-focus ownership as Coach Send: keep the keyboard through the click.
// Do not cancel pointerdown: WebKit also suppresses the touch-generated click.
const keepComposerFocus=event=>{
 if(event.button===0&&event.target.closest('button')&&document.activeElement?.matches('.coach-input textarea'))event.preventDefault();
};
export function CombinedProvenance({adjustment}){
 if(!isCombinedAdjustment(adjustment))return null;
 return <div className="combined-provenance"><small>Combined from</small>{adjustment.sourceSessions.map(s=><span key={s.logicalSessionId}>{s.name} · {dateLabel(s.scheduledDate)}</span>)}</div>;
}
export function CombinedWorkoutNotice({state,update}){
 const [error,setError]=useState(''),lock=useRef(false),a=combinedAdjustment(state);
 const {commit}=useDurableAction(state,update);
 if(!a)return null;
 const logged=state.activeWorkout?.adjustment?.id===a.id&&state.activeWorkout.exercises.some(e=>e.sets.some(s=>s.completed));
 const cancel=()=>{if(lock.current)return;lock.current=true;try{
   const next=persistCombinedState(state,cancelCombinedWorkout(state),saveState);
   update(()=>next,{planVersion:false,persistedState:next});
 }catch(e){setError(e.message);}finally{lock.current=false;}};
 const hide=()=>{setError('');try{commit(current=>setCombinedWorkoutNoticeHidden(current,true));}catch{setError('Couldn’t save this preference. The notice is still visible. Try again.');}};
 return <Disclosure key={combinedWorkoutNoticeKey(state)} open={!combinedWorkoutNoticeHidden(state)}>
 <aside className="combined-notice" aria-label="Combined workout notice"><div className="combined-notice-header"><strong>Combined workout · Today only</strong>
   <button type="button" className="text-button" aria-label="Hide combined workout notice" onClick={hide}>Hide</button></div>
   <small>{logged?'Finish early to keep logged sets and release both source sessions.':'Both source sessions are reserved, not completed. Cancelling releases both.'}</small>
   {!logged&&<button type="button" className="text-button" onClick={cancel}>Cancel combined workout</button>}
   {error&&<p role="alert">{error}</p>}</aside></Disclosure>;
}
export function CoachCombineChoices({request,onSend,busy,selection,onSelectionChange}){
 const [localSelection,setLocalSelection]=useState([]);
 const selected=selection||localSelection;
 const setSelected=fn=>{const next=fn(selected);if(onSelectionChange)onSelectionChange(next);else setLocalSelection(next);};
 if(request.step==='time')return <div className="coach-quick-questions combine-choices" onMouseDownCapture={keepComposerFocus}>{['45 min','60 min','75 min','90 min','No strict limit'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>onSend(label)}>{label}</button>)}<small>Or enter another total time in the conversation.</small></div>;
 if(request.step==='target')return <div className="coach-quick-questions combine-choices" onMouseDownCapture={keepComposerFocus}>{request.choices.map(s=><button type="button" key={s.id} disabled={busy} onClick={()=>onSend(s.label,{targetId:s.id})}>{s.label}</button>)}</div>;
 return <fieldset className="combine-choices" onMouseDownCapture={keepComposerFocus}><legend>Choose two planned sessions</legend>{request.choices.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={busy||selected.length===2&&!selected.includes(s.id)} onChange={()=>setSelected(current=>current.includes(s.id)?current.filter(id=>id!==s.id):[...current,s.id])}/><span>{s.label}</span></label>)}
 <button type="button" className="button secondary" disabled={busy||selected.length!==2} onClick={()=>onSend(`Combine ${request.choices.filter(s=>selected.includes(s.id)).map(s=>s.label).join(' and ')}.`,{sourceIds:selected})}>CONTINUE</button></fieldset>;
}
export function CoachCombineRecovery({request,state,onReview,onConfirmMatch,onRetry,busy,canRetry=true}){
 const [error,setError]=useState(''),confirming=useRef(false),focusNext=useRef(false),surface=useRef(null);
 const owner=request.profileId===state.profile.id&&request.planId===state.program?.id;
 // Resolve current canonical state on every render; saved chat links never
 // resurrect an obsolete exercise, restriction or occurrence after a plan edit.
 const result=owner?buildCombinedProposal(state,{sourceIds:request.sourceIds,minutes:request.minutes}):null;
 const issues=result?.combineReviewRequired?.issues||[];
 useLayoutEffect(()=>{
   if(focusNext.current){focusNext.current=false;surface.current?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
 },[state.program]);
 if(!owner)return <p className="coach-history-action">The source plan changed. Ask Coach to combine your current workouts.</p>;
 const confirm=issue=>{
   if(confirming.current)return;confirming.current=true;setError('');focusNext.current=true;
   try{onConfirmMatch({workoutId:issue.workoutId,exerciseEntryId:issue.exerciseEntryId,exerciseId:issue.exerciseId,matchExerciseId:issue.suggestedMatch.exerciseId,fingerprint:result.combineReviewRequired.fingerprint});}
   catch(e){focusNext.current=false;setError(e.message);}finally{confirming.current=false;}
 };
 return <section ref={surface} className="combine-recovery" aria-label="Combined workout next step">
   {issues.map((issue,index)=>{
     const exercise=state.program.days.find(d=>d.id===issue.workoutId)?.exercises.find(e=>e.id===issue.exerciseEntryId&&e.exerciseId===issue.exerciseId);
     const suggested=issue.suggestedMatch&&onConfirmMatch;
     return <div key={`${issue.workoutId}:${issue.exerciseEntryId}:${index}`}><strong>{issue.name}</strong>
       {suggested?<><p>Matches <strong>{issue.suggestedMatch.name}</strong> in the ROOK library. Confirm this link in your plan; your targets and entered values stay the same.</p><button type="button" className="button primary" disabled={busy} onClick={()=>confirm(issue)}>Confirm {issue.suggestedMatch.name}</button>
         <button type="button" className="text-button combine-match-alternative" disabled={busy} onClick={()=>onReview({workoutId:issue.workoutId,exerciseEntryId:issue.exerciseEntryId,exerciseId:issue.exerciseId})}>Choose another exercise</button></>:<><p>{issue.message}</p>
       {exercise&&<button type="button" className="button secondary" disabled={busy} onClick={()=>onReview({workoutId:issue.workoutId,exerciseEntryId:issue.exerciseEntryId,exerciseId:issue.exerciseId})}>Review {issue.name}</button>}</>}
     </div>;
   })}
   {error&&<p role="alert">{error}</p>}
   {result.status==='ready'?<><p role="status">{canRetry?'The source details are ready. Prepare a fresh combined proposal to review before applying.':'The source details are ready. Reconnect to Coach to prepare the combined proposal.'}</p><button type="button" className="button secondary" disabled={busy||!canRetry} onClick={()=>onRetry({sourceIds:request.sourceIds,minutes:request.minutes})}>PREPARE COMBINED WORKOUT</button></>:!issues.length&&<p role="status">{result.error}</p>}
 </section>;
}
export function CoachCombineCard({action,result,state,onAccept,onViewToday,reviewDraft,onReviewChange,onReviewCancelled,initialReviewing=false,draftSchedule=false}){
 const [reviewing,setReviewing]=useState(initialReviewing),[error,setError]=useState(''),[proposal,setProposal]=useState(reviewDraft||action.proposal),lock=useRef(false);
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
 return <div onMouseDownCapture={keepComposerFocus} className={`action-card combine-card${reviewing?' action-card-reviewing combine-review-surface':''}`}>
   {reviewing&&!draftSchedule&&<button ref={backRef} type="button" className="text-button" aria-label="Back to combined workout proposal" onClick={()=>{setReviewing(false);setError('');}}>‹ Back</button>}
   <h3>{proposal.revisionSummary?'Updated combined workout':'Combined workout'}</h3><p>About {Math.round(proposal.workout.estimatedMinutes)} min · Today only</p><CombinedProvenance adjustment={proposal}/>
   {!reviewing?<button ref={reviewRef} type="button" className="button secondary" onClick={()=>{setReviewing(true);onReviewCancelled?.(false);}}>REVIEW COMBINED WORKOUT</button>:<>
     {proposal.revisionSummary&&<div className="combine-revision-summary"><strong>Estimated time: <span style={{whiteSpace:'nowrap'}}>{Math.round(proposal.revisionSummary.previousMinutes)} min</span> → <span style={{whiteSpace:'nowrap'}}>{Math.round(proposal.estimatedMinutes)} min</span></strong><span>New total-time target: {proposal.requestedMinutes===null?'No strict limit':`${proposal.requestedMinutes} min`}</span>
       {proposal.revisionSummary.added.map(e=><span key={e.id}>{e.origin==='coach-added'?'Coach-added':'Restored from source'}: {e.name}</span>)}
       {proposal.revisionSummary.removed.map(e=><span key={e.id}>Removed: {e.name}</span>)}
       {proposal.revisionSummary.sets.map(e=><span key={e.id}>{e.name}: {e.before} → {e.after} sets</span>)}
       {!proposal.revisionSummary.added.length&&!proposal.revisionSummary.removed.length&&!proposal.revisionSummary.sets.length&&<span>Content unchanged within current training limits.</span>}
     </div>}
     <p>{proposal.explanation}</p><div className="adapt-review-list">{original.workout.exercises.map(e=>{
       const next=candidate(e);
       return <button type="button" key={e.id} aria-pressed={selected.has(e.id)} disabled={!next} onClick={()=>{setProposal(next);onReviewChange?.(next);setError('');}}><span aria-hidden="true">{selected.has(e.id)?'✓':'+'}</span><span><strong>{exerciseName(e)}</strong><small>{e.sets.length} sets · {formatExportSet(e,e.sets[0],{units:state.profile.units,completed:false})}{e.supersetId?' · Superset':''}{e.combinedOrigin==='coach-added'?' · Coach-added recommendation':''}</small></span></button>;
     })}</div><small>Main movement coverage and linked supersets stay together.</small>
     {error&&<p role="alert">{error}</p>}<div className="action-card-buttons"><button type="button" className="button primary" onClick={apply}>{draftSchedule?'ADD TO SCHEDULE':proposal.revisionSummary?'USE UPDATED WORKOUT':'USE THIS WORKOUT'}</button><button type="button" className="button secondary" onClick={()=>{setReviewing(false);setError('');onReviewCancelled?.(true);}}>CANCEL</button></div>
     <small>{draftSchedule?'Added to your review only. Nothing is saved until you use this schedule.':'Nothing changes until you use this workout. Your permanent plan stays unchanged.'}</small>
   </>}
 </div>;
}
