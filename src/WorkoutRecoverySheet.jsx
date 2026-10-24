import React,{useRef,useState} from 'react';
import {uid,workoutSetSummary} from './domain.js';
import {continueIdleWorkout,reviewedWorkoutFinish} from './workoutTiming.js';
import {useDurableAction} from './useDurableAction.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import './workoutRecovery.css';
const localInput=time=>{const d=new Date(Math.ceil(time/1000)*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;};
export function WorkoutRecoverySheet({state,update,review,Header,close,onContinued,onFinish,finishError,busy}){
  const {commit}=useDurableAction(state,update),request=useRef(uid('timing-recovery'));
  const [step,setStep]=useState('question'),[exclude,setExclude]=useState(true),[error,setError]=useState('');
  const [end,setEnd]=useState(()=>review.lastActivityAt===null?'':localInput(review.lastActivityAt));
  const [duration,setDuration]=useState(()=>review.suggestedDurationSeconds===null?'':String(Number((Math.max(1,review.suggestedDurationSeconds)/60).toFixed(2))));
  const summary=workoutSetSummary(state.activeWorkout),last=review.lastActivityAt===null?null:new Date(review.lastActivityAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const resume=()=>{try{const result=commit(current=>continueIdleWorkout(current,review,{requestId:request.current,excludeGap:exclude,elapsedMinutes:duration}));if(result.changed)onContinued();}catch(e){setError(e.message);}};
  const finish=()=>{try{const timing=reviewedWorkoutFinish(state,review,{endedAt:new Date(end).getTime(),durationMinutes:duration});onFinish(timing);}catch(e){setError(e.message);}};
  return <section className="screen detail-screen workout-recovery-sheet" role="dialog" aria-modal="true" aria-labelledby="workout-recovery-title">
    <Header title="Open workout" onClose={close}/><div className="workout-recovery-content">
    <h1 id="workout-recovery-title">{step==='question'?'Still training?':'Review and finish'}</h1>
    <p>Your workout is still open.{last?` Last activity: ${last}.`:' Review the time before you continue or finish.'}</p>
    <p>{summary.completed} of {summary.total} sets logged. Your entries are still here.</p>
    {step==='question'?<>
      <label className="workout-recovery-choice"><input type="checkbox" checked={exclude} onChange={e=>setExclude(e.target.checked)}/><span>{last?`Exclude the time since ${last} when continuing`:'Review the time already trained before continuing'}</span></label>
      {review.lastActivityAt===null&&exclude&&<label className="workout-recovery-field">Time already trained (min)<input aria-label="Time already trained in minutes" inputMode="decimal" type="number" min="0" step="any" value={duration} onChange={e=>setDuration(e.target.value)}/></label>}
    </>:<>
      <label className="workout-recovery-field">Workout end<input aria-label="Workout end" type="datetime-local" step="1" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label className="workout-recovery-field">Duration (min)<input aria-label="Reviewed workout duration in minutes" type="number" inputMode="decimal" min="0.01" step="any" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
      <p>Only completed sets will be saved. The original workout date and plan stay linked.</p>
    </>}
    {(error||finishError)&&<p role="alert">{error||finishError}</p>}
    </div><SheetActionFooter>
      {step==='question'?<><button className="button primary" type="button" disabled={busy||!summary.completed} onClick={()=>{setError('');setStep('finish');}}>Review and finish</button><button className="button secondary" type="button" disabled={busy} onClick={resume}>Continue workout</button>{!summary.completed&&<small>No sets logged yet. Continue, or close this review to use Workout options.</small>}</>:<><button className="button primary" type="button" disabled={busy} onClick={finish}>Finish workout</button><button className="text-button" type="button" disabled={busy} onClick={()=>setStep('question')}>Back</button></>}
    </SheetActionFooter>
  </section>;
}
