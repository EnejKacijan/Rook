import { useLayoutEffect, useRef, useState } from 'react';
import { ImportIssue } from './PlanImportIssues.jsx';
import { importResolutionDecisions, needsImportMatch } from './importResolution.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { StepProgress } from './StepProgress.jsx';
import './importResolution.css';

export function ImportResolution({review, program, resolved, matchIds, onResolve, onMatch, onCustom, candidates, onDone, onBack, revisit=null}) {
  const [decisions]=useState(()=>importResolutionDecisions(review,program,matchIds));
  const [step,setStep]=useState(()=>Math.max(0,decisions.findIndex(item=>item.group===revisit)));
  const [queries,setQueries]=useState({});
  const root=useRef(null),scroll=useRef(null);
  const pendingMatch=useRef(null),lastChoiceAt=useRef(-Infinity);
  const exerciseFor=item=>program.days.find(day=>day.id===(item.entry?.dayId||item.issue?.dayId))?.exercises.find(exercise=>exercise.id===(item.entry?.id||item.issue?.exerciseId));
  const isResolved=item=>item.issue?Boolean(resolved[item.id]):!needsImportMatch(exerciseFor(item));
  const nextIndex=decisions.findIndex((item,index)=>index>step&&(item.issue||needsImportMatch(exerciseFor(item))||queries[item.id]!==undefined||!decisions.some(other=>other.issue?.field==='alternative'&&other.issue.exerciseId===item.entry?.id)));
  const current=decisions[step];
  const back=()=>step>0?setStep(step-1):onBack();
  const chooseMatch=(event,item,active,query,optionId)=>{
    // A second click from the same double tap must not answer the next exercise.
    if(event.detail>1||event.nativeEvent?.repeat||Date.now()-lastChoiceAt.current<350)return;
    lastChoiceAt.current=Date.now();
    pendingMatch.current=item.id;
    setQueries(values=>({...values,[item.id]:query}));
    if(optionId)onMatch(item.entry.dayId,active.id,optionId);
    else onCustom(item.entry.dayId,active.id);
  };
  useLayoutEffect(()=>{
    // Advance only once the parent has accepted the choice into its draft.
    if(pendingMatch.current!==current?.id)return;
    pendingMatch.current=null;
    if(!isResolved(current))return;
    if(nextIndex<0)onDone({fromMatch:true});else setStep(nextIndex);
  });
  useLayoutEffect(()=>{
    const screen=root.current?.closest('.detail-screen');
    screen?.classList.add('has-import-decisions');
    const viewport=window.visualViewport;
    const resize=()=>{if(screen)screen.style.setProperty('--import-viewport-height',`${viewport?.scale===1?viewport.height:window.innerHeight}px`);};
    resize();viewport?.addEventListener('resize',resize);
    return()=>{screen?.classList.remove('has-import-decisions');screen?.style.removeProperty('--import-viewport-height');viewport?.removeEventListener('resize',resize);};
  },[]);
  useLayoutEffect(()=>{scroll.current.scrollTop=0;root.current.querySelector('[data-active="true"] h1')?.focus({preventScroll:true});},[step]);
  const title=item=>{
    if(item.entry)return 'Match this exercise';
    if(item.issue.field==='sourceUnit')return 'What unit is this weight?';
    return item.issue.field==='alternative'?'Choose a prescription':item.issue.field==='prescription'?'Set the prescription':item.issue.field==='load'?'Set the load':item.issue.field==='rir'?'Set the effort':item.issue.field==='day'?'Choose the workout day':item.group==='exclusions'?'Review this source exclusion':'Choose how to log this exercise';
  };
  if(!current)return null;
  return <section ref={root} className="import-resolution" aria-label="Resolve imported plan" onKeyDownCapture={event=>{if(event.repeat&&event.target.tagName==='BUTTON'&&['Enter',' '].includes(event.key))event.preventDefault();}}>
    <header className="detail-header import-decision-header"><button type="button" className="icon-button" aria-label="Back" onClick={back}>‹</button><strong>Import plan</strong><span aria-hidden="true"/></header>
    <div ref={scroll} className="import-decision-scroll" onFocusCapture={event=>requestAnimationFrame(()=>{const box=event.target.getBoundingClientRect(),bounds=scroll.current?.getBoundingClientRect();if(bounds&&box.bottom>bounds.bottom-12)scroll.current.scrollTop+=box.bottom-bounds.bottom+12;})}>
      <StepProgress step={step+1} total={decisions.length} hideSingle />
      {decisions.map((item,index)=>{
        const active=exerciseFor(item),query=queries[item.id]||'';
        const available=item.entry&&active?candidates(item.entry.dayId,active,query):[];
        return <div key={item.id} hidden={index!==step} data-active={index===step} className="import-decision-content">
          <span className="eyebrow">{item.entry?'EXERCISE MATCH':item.group==='prescriptions'?'PRESCRIPTION':item.group==='schedule'?'SCHEDULE':item.group==='exclusions'?'SOURCE EXCLUSION':'LOGGING'}</span>
          <h1 tabIndex={-1}>{title(item)}</h1>
          {item.issue&&(item.group==='exclusions'?<><span className="eyebrow">SOURCE</span><blockquote>{item.issue.source}</blockquote><p>{item.issue.message}</p><button className="button secondary" aria-pressed={isResolved(item)} onClick={()=>onResolve(item.issue,{})}>ACKNOWLEDGE EXCLUSION{isResolved(item)?' ✓':''}</button></>:<ImportIssue focused issue={item.issue} program={program} resolved={resolved[item.id]} onResolve={value=>onResolve(item.issue,value)}/>)}
          {item.entry&&active&&<div className="import-resolution-match">
            <span className="eyebrow">SOURCE</span><blockquote>{active.importedSourceName||active.originalImportedName||active.importedName}</blockquote>
            <p>{program.days.find(day=>day.id===item.entry.dayId)?.name}</p>
            <p>Choose an exercise or keep it as custom. You can change it in review.</p>
            <label>Search exercises<input type="search" value={query} onChange={event=>setQueries(values=>({...values,[item.id]:event.target.value}))} placeholder="Search exercises"/></label>
            <div className="import-resolution-options">{available.map(option=><button className="button secondary" key={option.id} aria-pressed={!needsImportMatch(active)&&active.exerciseId===option.id} onClick={event=>chooseMatch(event,item,active,query,option.id)}>{option.name}{!needsImportMatch(active)&&active.exerciseId===option.id?' ✓':''}</button>)}</div>
            {available.length===0&&<p role="status">No matching exercises. Try another name, or keep the source as custom.</p>}
            <button className="button secondary" aria-pressed={active.matchStatus==='confirmed-custom'} disabled={!String(active.originalImportedName||active.importedName||'').trim()} onClick={event=>chooseMatch(event,item,active,query,null)}>KEEP AS CUSTOM</button>
          </div>}
        </div>;
      })}
    </div>
    {!current.entry&&<SheetActionFooter separate><button className="button primary" disabled={!isResolved(current)} onClick={()=>nextIndex<0?onDone():setStep(nextIndex)}>{nextIndex<0?'REVIEW PLAN':'CONTINUE'}</button></SheetActionFooter>}
  </section>;
}
