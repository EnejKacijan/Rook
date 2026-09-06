import { useLayoutEffect, useRef, useState } from 'react';
import { saveState } from './domain.js';
import { SESSION_FEEDBACK, sessionFeedbackLabel, saveSessionFeedback } from './sessionFeedback.js';
import './sessionFeedback.css';

export function SessionFeedbackChoices({value,onChange}) {
  return <fieldset className="session-feedback-choices">
    <legend>How did this session feel? <small>Optional</small></legend>
    <div className="session-feedback-options">{Object.entries(SESSION_FEEDBACK).map(([key,label])=><button type="button" key={key} aria-pressed={value===key} onClick={()=>onChange(key)}>{label}</button>)}</div>
    <button type="button" className="session-feedback-skip" onClick={()=>onChange('skipped')}>Skip</button>
  </fieldset>;
}
export function SessionFeedbackPrompt({workout,state,update}) {
  const [editing,setEditing]=useState(false),[error,setError]=useState('');
  const errorRef=useRef(null);
  const revealError=()=>{
    const node=errorRef.current,footer=node?.closest('.complete-screen')?.querySelector('.complete-done-dock');
    if(!node||!footer)return;
    const bounds=node.getBoundingClientRect();
    if(bounds.bottom>footer.getBoundingClientRect().top-16||bounds.top<0)node.scrollIntoView({block:'center',behavior:'auto'});
  };
  useLayoutEffect(()=>{if(!error)return;revealError();window.addEventListener('resize',revealError);window.visualViewport?.addEventListener('resize',revealError);return()=>{window.removeEventListener('resize',revealError);window.visualViewport?.removeEventListener('resize',revealError);};},[error]);
  const choose=value=>{
    const result=saveSessionFeedback(state,workout.id,value,{persist:saveState});
    if(result.status!=='saved'){setError('Couldn’t save feedback. You can retry or continue without it.');requestAnimationFrame(revealError);return;}
    update(()=>result.state,{planVersion:false});setEditing(false);setError('');
  };
  const answered=Boolean(workout.sessionFeedback);
  return <section className="session-feedback" aria-label="Optional session feedback">
    {answered&&!editing?<div className="session-feedback-saved"><span>{sessionFeedbackLabel(workout.sessionFeedback)?<>Session felt <strong>{sessionFeedbackLabel(workout.sessionFeedback)}</strong></>:'Session feedback skipped'}</span><button className="session-feedback-change" onClick={()=>setEditing(true)}>Change</button></div>:<SessionFeedbackChoices value={workout.sessionFeedback} onChange={choose}/>}
    {error&&<p ref={errorRef} role="alert">{error}</p>}
  </section>;
}
export function SessionFeedbackDisplay({value}) {
  const label=sessionFeedbackLabel(value);
  return label?<p className="session-feedback-history"><span>Session felt</span><strong>{label}</strong></p>:null;
}
