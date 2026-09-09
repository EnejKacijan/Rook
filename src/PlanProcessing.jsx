import { useEffect, useRef, useState } from 'react';
import './planProcessing.css';

export const PLAN_PROGRESS_DELAY = 600;
export async function finishPlanProcessing(startedAt, onStage) {
  if (performance.now() - startedAt < PLAN_PROGRESS_DELAY) return;
  onStage?.('complete');
}

// Numeric values are supplied by real work only; elapsed time never fills the bar.
export function PlanProgressBar({progress, complete=false}) {
  const highWater = useRef(0);
  const hasKnown = useRef(false);
  const known = Number.isFinite(progress?.completed) && Number.isFinite(progress?.total) && progress.total > 0;
  if (known) { hasKnown.current = true; highWater.current = Math.max(highWater.current, Math.min(99, 100 * Math.max(0, progress.completed) / progress.total)); }
  const value = complete ? 100 : hasKnown.current ? highWater.current : undefined;
  return <div className={`plan-progress-bar${value === undefined ? ' is-indeterminate' : ''}${complete ? ' is-complete' : ''}`} role="progressbar" aria-label="Plan processing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <span style={value === undefined ? undefined : {width:`${value}%`}} />
  </div>;
}

export function PlanProcessing({stage='building',kind='program',onCancel,progress}) {
  const [visible,setVisible]=useState(false),[stalled,setStalled]=useState(false);
  const overlayRef=useRef(null);
  useEffect(()=>{const timer=setTimeout(()=>setVisible(true),PLAN_PROGRESS_DELAY);return()=>clearTimeout(timer);},[]);
  useEffect(()=>{setStalled(false);const timer=setTimeout(()=>setStalled(true),16000);return()=>clearTimeout(timer);},[stage,progress?.completed]);
  useEffect(()=>{
    const node=overlayRef.current;if(!visible||!node)return;
    const previous=document.activeElement;node.focus({preventScroll:true});
    const keydown=event=>{
      if(event.key==='Escape'&&onCancel){event.preventDefault();event.stopPropagation();onCancel();}
      if(event.key==='Tab'){event.preventDefault();(node.querySelector('button')||node).focus({preventScroll:true});}
    };
    node.addEventListener('keydown',keydown);
    return()=>{node.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[visible,onCancel]);
  // Review is already ready: never flash a full bar or delay its handoff.
  if(!visible||stage==='complete')return null;
  const importing=kind==='import',complete=stage==='complete';
  const message=complete?'Plan ready for review.':stage==='saving'?'Saving your plan…':importing?(stage==='checking'?'Preparing your plan for review…':'Reading your workout notes…'):stage==='checking'?'Validating your plan…':stage==='preparing'?'Preparing your plan…':'Creating your workout structure…';
  return <div ref={overlayRef} tabIndex={-1} className="building-overlay plan-processing" role="dialog" aria-modal="true" aria-busy={!complete} aria-labelledby="building-title" aria-describedby="building-detail">
    <div className="building-card">
      <p className="eyebrow">{importing?'IMPORTING PLAN':'BUILDING PLAN'}</p>
      <h2 id="building-title">{importing?'Preparing your plan review.':'Preparing your training week.'}</h2>
      <p id="building-detail" role="status" aria-live="polite" aria-atomic="true">{message}{stalled&&!complete?' Still processing on this device. Your current plan is unchanged.':''}</p>
      <PlanProgressBar progress={progress} complete={complete}/>
      {onCancel&&<button type="button" className="building-cancel" onClick={onCancel}>CANCEL</button>}
    </div>
  </div>;
}
