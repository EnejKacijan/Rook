import React,{useLayoutEffect,useRef,useState} from 'react';
import {exerciseName,saveState,pluralize} from './domain.js';
import {reviewPrescription,reviewSetTarget} from './reviewPrescription.js';
import {effectiveGymContext} from './gymProfiles.js';
import {reviewCombinedSelection,buildCombinedProposal,combineFingerprint} from './combineWorkouts.js';
import {combinedAdjustment,cancelCombinedWorkout,persistCombinedState,isCombinedAdjustment} from './combinedWorkoutLifecycle.js';
import './coachCombine.css';
import {NavigationChevron} from './NavigationChevron.jsx';
import {Disclosure} from './Disclosure.jsx';
import {useDurableAction} from './useDurableAction.js';
import {flexibleSessionById} from './flexibleWeek.js';
import {ReviewDetails} from './ReviewDetails.jsx';
import {combinedWorkoutNoticeKey,combinedWorkoutNoticeHidden,setCombinedWorkoutNoticeHidden} from './combinedWorkoutPresentation.js';

const dateLabel=date=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
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
export function CoachCombineChoices({request,onSend,busy,selection,onSelectionChange,onReview,state,result,onViewToday}){
 const [localSelection,setLocalSelection]=useState(request.sourceIds||[]);
 const selected=selection||localSelection;
 const sl=request.language==='Slovenian';
 const setSelected=fn=>{const next=fn(selected);if(onSelectionChange)onSelectionChange(next);else setLocalSelection(next);};
 if(request.step==='review'){
   if(result?.status==='applied')return <div className="action-card action-card-applied" role="status"><h3>{combinedAdjustment(state)?.id===result.workoutId?(sl?'Združen trening je pripravljen':'Combined workout ready'):(sl?'Pregled združenega treninga':'Combined workout')}</h3><button type="button" className="text-button action-view-today" onClick={onViewToday}>{sl?'Odpri Today →':'View Today →'}</button></div>;
   const stale=state&&(request.profileId!==state.profile.id||request.planId!==state.program?.id||request.fingerprint!==combineFingerprint(state));
   if(stale)return <p className="coach-history-action" role="status">{sl?'Treninga sta se spremenila. Zahtevaj nov pregled.':'The workouts changed. Ask for a fresh review.'}</p>;
   return <button type="button" className="coach-review-action" disabled={busy||!onReview} onClick={()=>onReview(request)}><span>{sl?'Preglej združen trening':'Review combined workout'}</span><NavigationChevron/></button>;
 }
 if(request.step==='time')return <div className="coach-quick-questions combine-choices" onMouseDownCapture={keepComposerFocus}>{[45,60,75,90,null].map(minutes=><button type="button" key={minutes??'none'} disabled={busy} onClick={()=>onSend(minutes==null?sl?'Brez časovne omejitve':'No strict limit':`${minutes} min`)}>{minutes==null?sl?'Brez časovne omejitve':'No strict limit':`${minutes} min`}</button>)}<small>{sl?'Lahko tudi napišeš, koliko časa imaš za celoten trening.':'Or enter another total time in the conversation.'}</small></div>;
 if(request.step==='target')return <div className="coach-quick-questions combine-choices" onMouseDownCapture={keepComposerFocus}>{request.choices.map(s=><button type="button" key={s.id} disabled={busy} onClick={()=>onSend(s.label,{targetId:s.id})}>{s.label}</button>)}</div>;
 return <fieldset className="combine-choices" onMouseDownCapture={keepComposerFocus}><legend>{sl?'Izberi dva treninga':'Choose two planned sessions'}</legend>{request.choices.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={busy||s.id===request.requiredSourceId||selected.length===2&&!selected.includes(s.id)} onChange={()=>setSelected(current=>current.includes(s.id)?current.filter(id=>id!==s.id):[...current,s.id])}/><span>{s.label}</span></label>)}
 <button type="button" className="button secondary" disabled={busy||selected.length!==2} onClick={()=>onSend(`${sl?'Združi':'Combine'} ${request.choices.filter(s=>selected.includes(s.id)).map(s=>s.label).join(sl?' in ':' and ')}.`,{sourceIds:selected})}>{sl?'NADALJUJ':'CONTINUE'}</button></fieldset>;
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
export function combinedReviewChanges(state,proposal){
 if(proposal.revisionSummary){
   const revision=proposal.revisionSummary;
   return [...revision.added.map(row=>({id:row.id,name:row.name,detail:row.origin==='restored-source'?'Restored from original':'Added today'})),
     ...revision.removed.map(row=>({id:row.id,name:row.name,detail:'Removed from this version'})),
     ...revision.sets.map(row=>({id:row.id,name:row.name,detail:`${row.before} → ${pluralize(row.after,'set')}`}))];
 }
 const sources=proposal.sourceSessions.map(source=>flexibleSessionById(state,source.logicalSessionId,proposal.date));
 if(sources.some(source=>!source))return null;
 const groups=new Map(),target=exercise=>`${reviewPrescription(exercise,{units:state.profile.units})} · ${exercise.restSeconds} sec rest`;
 for(const source of sources)for(const exercise of source.workout.exercises){
   const group=groups.get(exercise.exerciseId)||{name:exerciseName(exercise),sets:0,targets:[]};
   group.sets+=exercise.sets.length;group.targets.push(target(exercise));groups.set(exercise.exerciseId,group);
 }
 const rows=[];
 for(const [id,before]of groups){
   const after=proposal.workout.exercises.find(exercise=>exercise.exerciseId===id),beforeTargets=[...new Set(before.targets)];
   if(!after)rows.push({id,name:before.name,detail:'Omitted today'});
   else if(before.sets!==after.sets.length||beforeTargets.length!==1||beforeTargets[0]!==target(after))
     rows.push({id,name:exerciseName(after),detail:before.sets!==after.sets.length?`${before.sets} → ${pluralize(after.sets.length,'set')}`:'Updated targets',targets:beforeTargets.length===1&&beforeTargets[0]===target(after)?undefined:`${beforeTargets.join(' / ')} → ${target(after)}`});
 }
 for(const exercise of proposal.workout.exercises)if(!groups.has(exercise.exerciseId))rows.push({id:exercise.exerciseId,name:exerciseName(exercise),detail:'Added today',targets:`${pluralize(exercise.sets.length,'set')} · ${target(exercise)}`});
 return rows;
}
export function CoachCombineCard({action,result,state,onAccept,onViewToday,reviewDraft,onReviewChange,onReviewCancelled,initialReviewing=false,draftSchedule=false,compact=false,hideTitle=false,applyLabel}){
 const [reviewing,setReviewing]=useState(initialReviewing),[error,setError]=useState(''),[proposal,setProposal]=useState(reviewDraft||action.proposal),lock=useRef(false);
 const backRef=useRef(null),reviewRef=useRef(null),wasReviewing=useRef(false),editStart=useRef(null);
 useLayoutEffect(()=>{
   if(reviewing)backRef.current?.focus({preventScroll:true});
   else if(wasReviewing.current)reviewRef.current?.focus({preventScroll:true});
   wasReviewing.current=reviewing;
 },[reviewing]);
 if(result?.status==='applied'){
   const pending=combinedAdjustment(state)?.id===result.workoutId;
   const history=state.workouts.find(w=>w.adjustment?.id===result.workoutId);
   return <div className="action-card action-card-applied" role="status"><h3><span className="review-applied-mark" aria-hidden="true">✓</span>{pending?'Combined workout ready':history?.combinedSourcesResolved?'Combined workout completed':history?'Combined workout finished early':'Combined workout cleared'}</h3>
     <small>{pending?'Finish the workout to complete both source sessions.':history?.combinedSourcesResolved?'Both source sessions completed.':'Source sessions released.'}</small>
     <button className="text-button action-view-today" onClick={onViewToday}>{pending?'View workout →':'View Today →'}</button></div>;
 }
 const original=action.proposal,selected=new Set(proposal.workout.exercises.map(e=>e.id));
 const candidate=exercise=>{
   const group=original.workout.exercises.filter(e=>exercise.supersetId?e.supersetId===exercise.supersetId:e.id===exercise.id),ids=new Set(selected);
   group.forEach(e=>selected.has(exercise.id)?ids.delete(e.id):ids.add(e.id));
   return reviewCombinedSelection(original,[...ids],effectiveGymContext(state,{}).profile);
 };
 const apply=()=>{if(lock.current)return;lock.current=true;setError('');try{onAccept({...action,proposal});}catch(e){lock.current=false;setError(e.message);}};
 const changes=combinedReviewChanges(state,proposal),stale=proposal.fingerprint!==combineFingerprint(state)||!changes;
 const edit=()=>{editStart.current=structuredClone(proposal);setReviewing(true);setError('');onReviewCancelled?.(false);};
 const cancel=()=>{if(editStart.current)setProposal(editStart.current);setReviewing(false);setError('');onReviewCancelled?.(true);};
 const workoutRows=<div className="review-change-list">{proposal.workout.exercises.map(exercise=><div className="review-change-row" key={exercise.id}><strong>{exerciseName(exercise)}</strong><span>{pluralize(exercise.sets.length,'set')} · {reviewPrescription(exercise,{units:state.profile.units})} · {exercise.restSeconds} sec rest{exercise.supersetId?' · Superset':''}</span><ReviewDetails title="Set targets">{exercise.sets.map((set,index)=><p key={set.id}>Set {index+1} · {reviewSetTarget(exercise,set,{units:state.profile.units})}</p>)}</ReviewDetails></div>)}</div>;
 return <div onMouseDownCapture={keepComposerFocus} className={`action-card combine-card${reviewing?' action-card-reviewing combine-review-surface':''}`}>
   {reviewing&&!draftSchedule&&<button ref={backRef} type="button" className="text-button" aria-label="Back to combined workout proposal" onClick={cancel}>‹ Back</button>}
   {(!hideTitle||reviewing)&&<h3>{proposal.revisionSummary?'Updated combined workout':'Combined workout'}</h3>}<p>{proposal.requestedMinutes==null?`About ${Math.round(proposal.workout.estimatedMinutes)} min · `:''}Today only · {dateLabel(proposal.date)}</p><CombinedProvenance adjustment={proposal}/>
   {proposal.requestedMinutes!=null&&<p className="review-scope">Target {proposal.requestedMinutes} min · Estimate {Math.round(proposal.estimatedMinutes)} min</p>}
   {!reviewing?<>
     {compact?<><p className="review-scope">Overlapping work is reduced to fit your time.</p><ReviewDetails title={proposal.revisionSummary?'Changes to this version':'Changes to these workouts'}><div className="review-change-list">{changes?.map(change=><div className="review-change-row" key={change.id}><strong>{change.name}</strong><span>{change.detail}</span>{change.targets&&<small>{change.targets}</small>}</div>)}</div></ReviewDetails></>:<div className="review-change-list">{changes?.map(change=><div className="review-change-row" key={change.id}><strong>{change.name}</strong><span>{change.detail}</span>{change.targets&&<small>{change.targets}</small>}</div>)}</div>}
     <p className="review-scope">Finish the workout to complete both source sessions.</p>
     <ReviewDetails title={`Full workout · ${proposal.workout.exercises.length} exercises`}>{workoutRows}</ReviewDetails>
     {proposal.explanation&&<ReviewDetails title="Why these changes?"><p>{proposal.explanation}</p></ReviewDetails>}
     {stale&&<p role="alert">The source workouts changed. Ask Coach for an updated proposal.</p>}
     {error&&<p role="alert">{error}</p>}
     <div className="action-card-buttons"><button type="button" className="button primary" disabled={stale} onClick={apply}>{applyLabel||(draftSchedule?'ADD TO SCHEDULE':proposal.revisionSummary?'USE UPDATED WORKOUT':'USE THIS WORKOUT')}</button><button ref={reviewRef} type="button" className="button secondary" disabled={stale} onClick={edit}>Edit workout</button></div>
     {draftSchedule&&<small>Added to the draft. Apply the schedule to save.</small>}
   </>:<>
     <div className="adapt-review-list">{original.workout.exercises.map(e=>{
       const next=candidate(e);
       return <button type="button" key={e.id} aria-pressed={selected.has(e.id)} disabled={!next} onClick={()=>{setProposal(next);onReviewChange?.(next);setError('');}}><span aria-hidden="true">{selected.has(e.id)?'✓':'+'}</span><span><strong>{exerciseName(e)}</strong><small>{pluralize(e.sets.length,'set')} · {reviewPrescription(e,{units:state.profile.units,completed:false})}{e.supersetId?' · Superset':''}{e.combinedOrigin==='coach-added'?' · Coach-added recommendation':''}</small></span></button>;
     })}</div><small>Main movement coverage and linked supersets stay together.</small>
     {stale&&<p role="alert">The source workouts changed. Ask Coach for an updated proposal.</p>}
     {error&&<p role="alert">{error}</p>}<div className="action-card-buttons"><button type="button" className="button primary" disabled={stale} onClick={apply}>{applyLabel||(draftSchedule?'ADD TO SCHEDULE':proposal.revisionSummary?'USE UPDATED WORKOUT':'USE THIS WORKOUT')}</button><button type="button" className="button secondary" onClick={cancel}>CANCEL</button></div>
   </>}
 </div>;
}
