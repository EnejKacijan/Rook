import { useLayoutEffect, useRef, useState } from 'react';
import { ImportIssue } from './PlanImportIssues.jsx';
import { importExerciseReviewGroups, needsImportMatch } from './importResolution.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { StepProgress } from './StepProgress.jsx';
import { useStepSwipeForward } from './useStepSwipeForward.js';
import './importResolution.css';

const importEdgeSurface = root => root.closest('.import-plan-screen') || root;

export function ImportResolution({review, program, reviewProgram=program, excludedExercises, resolved, matchIds, onResolve, onMatch, onCustom, candidates, onDone, onBack, revisit=null, revisions={}}) {
  // Freeze presentation identities, not answers. Hidden groups stay mounted so
  // raw/temporarily invalid input survives Back, optional choices and matching.
  const [groups]=useState(()=>importExerciseReviewGroups(review,reviewProgram,matchIds));
  const [step,setStep]=useState(()=>Math.max(0,groups.findIndex(g=>g.id===revisit||g.items.some(i=>i.group===revisit))));
  const [queries,setQueries]=useState({}),[editingMatches,setEditingMatches]=useState({});
  const root=useRef(null),scroll=useRef(null),pendingMatch=useRef(null),lastChoiceAt=useRef(-Infinity);
  const completedSteps=useRef(new Map());
  const exerciseFor=item=>program.days.find(day=>day.id===(item.entry?.dayId||item.issue?.dayId))?.exercises.find(ex=>ex.id===(item.entry?.id||item.issue?.exerciseId));
  const optionalFor=(group,id)=>group.items.find(i=>i.issue?.exerciseId===id&&i.issue.field==='optional');
  const pendingAlternative=(group,id)=>group.items.some(i=>i.issue?.exerciseId===id&&i.issue.field==='alternative'&&!resolved[i.id]);
  const applicable=(item,group)=>{
    const id=item.entry?.id||item.issue?.exerciseId,optional=optionalFor(group,id);
    return item.issue?.field==='optional'||!id||Boolean(exerciseFor(item)&&(!optional||resolved[optional.id]?.value==='include'));
  };
  const itemResolved=item=>item.issue?Boolean(resolved[item.id]):Boolean(exerciseFor(item)&&!needsImportMatch(exerciseFor(item)));
  const groupResolved=group=>group.items.every(item=>!applicable(item,group)||itemResolved(item));
  const visitable=group=>group.items.some(item=>applicable(item,group));
  const current=groups[step],nextIndex=groups.findIndex((g,i)=>i>step&&visitable(g));
  const signature=JSON.stringify([current?.items.map(i=>[resolved[i.id],exerciseFor(i)]),program.days.find(d=>d.id===current?.dayId)?.weekday]);
  const invalidate=group=>completedSteps.current.delete(group.id);
  const resolve=(group,item,value)=>{invalidate(group);onResolve(item.issue,value);};
  const nextStep=()=>setStep(index=>index===step?nextIndex:index);
  const continueResolved=(fromMatch=false)=>{
    if(!current||!groupResolved(current))return;
    if(nextIndex<0){onDone(fromMatch?{fromMatch:true}:undefined);return;}
    completedSteps.current.set(current.id,{review,signature,nextId:groups[nextIndex].id});nextStep();
  };
  const canForward=()=>{
    const previous=completedSteps.current.get(current?.id);
    return Boolean(previous&&previous.review===review&&previous.signature===signature&&groupResolved(current)&&
      !current.items.some(i=>i.issue?.requiresSourceEdit||i.issue?.field==='roundGroup')&&
      nextIndex===step+1&&previous.nextId===groups[nextIndex]?.id&&!pendingMatch.current);
  };
  useStepSwipeForward(root,{active:true,step,enabled:canForward,edgeSurface:importEdgeSurface,onForward:()=>{if(canForward())nextStep();}});
  const back=()=>{const index=groups.findLastIndex((g,i)=>i<step&&visitable(g));return index>=0?setStep(index):onBack();};
  const chooseMatch=(event,group,item,optionId)=>{
    if(event.detail>1||event.nativeEvent?.repeat||Date.now()-lastChoiceAt.current<350)return;
    const active=exerciseFor(item);if(!active)return;
    invalidate(group);lastChoiceAt.current=Date.now();pendingMatch.current={groupId:group.id,itemId:item.id};
    setEditingMatches(values=>({...values,[item.id]:false}));
    if(optionId)onMatch(item.entry.dayId,active.id,optionId);else onCustom(item.entry.dayId,active.id);
  };
  useLayoutEffect(()=>{
    const pending=pendingMatch.current;if(!pending||pending.groupId!==current?.id)return;
    pendingMatch.current=null;
    // Match-only decisions retain direct resolution. Choosing an identity in a
    // combined group isn't consent to its prescription or a final plan apply.
    if(current.items.length===1&&groupResolved(current))continueResolved(true);
  });
  useLayoutEffect(()=>{
    const screen=root.current?.closest('.detail-screen');screen?.classList.add('has-import-decisions');
    return()=>screen?.classList.remove('has-import-decisions');
  },[]);
  useLayoutEffect(()=>{scroll.current.scrollTop=0;root.current.querySelector('[data-active="true"] h1')?.focus({preventScroll:true});},[step]);
  if(!current)return null;
  const matchVisible=(group,item)=>applicable(item,group)&&!pendingAlternative(group,item.entry.id)&&(group.items.length===1||needsImportMatch(exerciseFor(item))||editingMatches[item.id]);
  const footerMatch=current.items.find(item=>item.entry&&matchVisible(current,item));
  const blocked=current.items.some(i=>applicable(i,current)&&(i.issue?.field==='roundGroup'||i.issue?.requiresSourceEdit));
  const customButton=(group,item)=>{
    const ex=exerciseFor(item);
    return <button className="button secondary" aria-pressed={ex?.matchStatus==='confirmed-custom'} disabled={Boolean(ex?.hybridSource?.choice||ex?.hybridSource?.unresolved)||!String(ex?.originalImportedName||ex?.importedName||'').trim()} onClick={event=>chooseMatch(event,group,item,null)}>KEEP AS CUSTOM</button>;
  };
  const renderIssue=(group,item)=>item.group==='exclusions'?<div key={item.id}><blockquote>{item.issue.source}</blockquote><p>{item.issue.message}</p><button className="button secondary" aria-pressed={itemResolved(item)} onClick={()=>resolve(group,item,{})}>ACKNOWLEDGE EXCLUSION{itemResolved(item)?' ✓':''}</button></div>:<ImportIssue key={item.id+':'+(revisions[item.id]||0)} focused grouped={Boolean(group.members.length)} issue={item.issue} program={program} fallbackExercise={excludedExercises?.get(item.issue.exerciseId)?.exercise||group.members.find(m=>m.id===item.issue.exerciseId)?.source} resolved={resolved[item.id]} onResolve={value=>resolve(group,item,value)}/>;
  return <section ref={root} className="import-resolution" data-import-step-back="true" aria-label="Resolve imported plan" onKeyDownCapture={event=>{if(event.repeat&&event.target.tagName==='BUTTON'&&['Enter',' '].includes(event.key))event.preventDefault();}}>
    <header className="detail-header import-decision-header"><button type="button" className="icon-button" aria-label="Back" onClick={back}>‹</button><strong title={current.title}>{current.title}</strong><span aria-hidden="true"/></header>
    <div ref={scroll} className="import-decision-scroll" data-swipe-back-content>
      <StepProgress step={groups.filter((g,i)=>i<=step&&visitable(g)).length} total={groups.filter(visitable).length} hideSingle />
      {groups.map((group,index)=><div key={group.id} hidden={index!==step} data-active={index===step} data-review-group={group.id} className="import-decision-content">
        <span className="eyebrow">{group.members.length?'EXERCISE REVIEW':'WORKOUT REVIEW'}</span>
        <h1 tabIndex={-1}>{group.title}</h1>
        <p className="import-group-status" role="status">{program.days.find(d=>d.id===group.dayId)?.name}{groupResolved(group)?' · Resolved':' · Needs review'}</p>
        {group.members.length>0&&<div className="import-group-source"><span className="eyebrow">Source</span>{(group.sourceSpans.length?group.sourceSpans.map(s=>s.text):[...new Set(group.items.map(i=>i.issue?.source).filter(Boolean))].length?[...new Set(group.items.map(i=>i.issue?.source).filter(Boolean))]:[group.members[0].source.importedSourceName||group.title]).map((text,i)=><blockquote key={i}>{text}</blockquote>)}</div>}
        {(reviewProgram.days.find(d=>d.id===group.dayId)?.warmupPlan?.items||[]).filter(item=>group.sourceSpans.some(span=>span.text===item.sourceText)).map((item,i)=><p className="import-group-status" key={i}>{item.prescriptionText} · From source</p>)}
        {group.members.map(member=>{
          const items=group.items.filter(i=>(i.entry?.id||i.issue?.exerciseId)===member.id),optional=optionalFor(group,member.id),match=items.find(i=>i.entry);
          const active=program.days.find(d=>d.id===group.dayId)?.exercises.find(e=>e.id===member.id),source=member.source;
          const included=!optional||resolved[optional.id]?.value==='include';
          const matching=match&&matchVisible(group,match),query=queries[match?.id]||'';
          const available=matching&&active?candidates(group.dayId,active,query):[];
          return <section key={member.id} className="import-review-member" data-review-exercise={member.id} aria-label={source.importRole||source.originalImportedName||source.importedName}>
            {group.members.length>1&&<h2>{source.importRole||source.originalImportedName||source.importedName}{source.hybridSource?.method==='drop'?' · Additional drop set':''}</h2>}
            {optional&&renderIssue(group,optional)}
            <div hidden={!included||!active}>
              {match&&active&&<div className="import-resolution-match" hidden={pendingAlternative(group,member.id)}>
                {!matching&&<div className="import-match-selected"><span>{active.importedName||active.exerciseId} ✓</span><button className="text-button" onClick={()=>{invalidate(group);setEditingMatches(v=>({...v,[match.id]:true}));}}>Change exercise</button></div>}
                <div hidden={!matching}>
                  <label>Choose an exercise<input type="search" aria-label={'Search exercises for '+(source.originalImportedName||source.importedName)} value={query} onChange={event=>{invalidate(group);setQueries(v=>({...v,[match.id]:event.target.value}));}} placeholder="Search exercises"/></label>
                  <div className="import-resolution-options">{available.map(option=><button className="button secondary" key={option.id} aria-pressed={!needsImportMatch(active)&&active.exerciseId===option.id} onClick={event=>chooseMatch(event,group,match,option.id)}>{option.name}{!needsImportMatch(active)&&active.exerciseId===option.id?' ✓':''}</button>)}</div>
                  {!available.length&&<p role="status">No matching exercises. Try another name, or keep the source as custom.</p>}
                  {footerMatch?.id!==match.id&&customButton(group,match)}
                </div>
              </div>}
              <div hidden={Boolean(match&&needsImportMatch(active)&&!pendingAlternative(group,member.id))}>
                {items.filter(i=>i.issue&&i!==optional).map(item=>renderIssue(group,item))}
              </div>
            </div>
          </section>;
        })}
        {group.items.filter(i=>i.issue&&!group.members.some(m=>m.id===i.issue.exerciseId)).map(item=>renderIssue(group,item))}
      </div>)}
    </div>
    <SheetActionFooter separate importViewport className={footerMatch?'import-match-footer':''}>
      {footerMatch?customButton(current,footerMatch):blocked?<button className="button secondary" onClick={onBack}>EDIT NOTES</button>:<button className="button primary" disabled={!groupResolved(current)} onClick={()=>continueResolved()}>{nextIndex<0?'REVIEW PLAN':'CONTINUE'}</button>}
    </SheetActionFooter>
  </section>;
}
