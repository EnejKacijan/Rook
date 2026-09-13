import { useLayoutEffect, useRef, useState } from 'react';
import { exerciseCatalog, exerciseLoadRequirement, exerciseMeasure, rankExerciseSearch, exerciseMatchesQuery } from './domain.js';
import { matchImportCatalogName } from './importExerciseMatching.js';
import { createPlanEditorExerciseFilter } from './exerciseEligibility.js';
import { normalizeExerciseAlias } from './customExercises.js';
import { planImportSourceName } from './planImportMatching.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';

// Mounted only by the explicit Optional action. Suggestions are never accepted
// on opening, Back, or final Apply; every unreviewed entry retains its identity.
export function OptionalPlanMatches({program,profile,onMatch,onOriginal,onBack}){
  const [groups]=useState(()=>{
    const groups=new Map(),allowed=createPlanEditorExerciseFilter(profile);
    for(const day of program.days)for(const exercise of day.exercises){
      if(!['original','confirmed-custom'].includes(exercise.matchStatus))continue;
      const name=planImportSourceName(exercise),key=normalizeExerciseAlias(name);
      if(!groups.has(key))groups.set(key,{name,entries:[],source:exercise.hybridSource?.sourceSpan?.text||exercise.sourceSpan?.text||exercise.importedSourceName||name,
        match:matchImportCatalogName(name,exerciseCatalog,{advanced:true,loadRequirement:exerciseLoadRequirement})});
      groups.get(key).entries.push({dayId:day.id,exercise});
    }
    return [...groups.values()].map(group=>({...group,available:Object.values(exerciseCatalog).filter(allowed).filter(item=>group.entries.every(({exercise})=>exerciseMeasure(exercise)===(item.measure||'reps')))}));
  });
  const [step,setStep]=useState(0),[query,setQuery]=useState(''),[browse,setBrowse]=useState(false);
  const submitted=useRef(false),lastChoice=useRef(-Infinity),root=useRef(null),scroll=useRef(null),input=useRef(null),group=groups[step];
  const currentStep=useRef(step);
  // Reuse the existing Import decision scroll/viewport ownership, including
  // its footer and keyboard inset. Do not mount a second mobile modal system.
  useLayoutEffect(()=>{const screen=root.current?.closest('.detail-screen');screen?.classList.add('has-import-decisions');return()=>screen?.classList.remove('has-import-decisions');},[]);
  useLayoutEffect(()=>{scroll.current?.scrollTo?.(0,0);scroll.current?.querySelector('h1')?.focus({preventScroll:true});},[step]);
  if(!group)return <section className="import-resolution"><button className="button secondary" onClick={onBack}>BACK TO PLAN</button><p>All original names are preserved.</p></section>;
  const candidate=group.available.find(item=>item.id===(group.match.exerciseId||group.match.suggestedExerciseId));
  const select=(id,event)=>{
    if(submitted.current||event?.detail>1||Date.now()-lastChoice.current<350)return;submitted.current=true;lastChoice.current=Date.now();
    for(const entry of group.entries)id?onMatch(entry.dayId,entry.exercise.id,id):onOriginal(entry.dayId,entry.exercise.id);
    if(step===groups.length-1)onBack();else{setStep(step+1);setQuery('');setBrowse(false);}
  };
  if(currentStep.current!==step){currentStep.current=step;submitted.current=false;}
  const choices=rankExerciseSearch(group.available.filter(item=>exerciseMatchesQuery(item,query)),query).slice(0,20);
  return <section ref={root} className="import-resolution" data-import-step-back="true" aria-label="Optional exercise matches">
    <header className="detail-header import-decision-header"><button className="icon-button" aria-label="Back" onClick={onBack}>‹</button><strong>Exercise matches · Optional</strong><span/></header>
    <div ref={scroll} className="import-decision-scroll" data-swipe-back-content><div className="import-decision-content">
      <span className="eyebrow">ORIGINAL EXERCISE</span><h1 tabIndex={-1}>{group.name}</h1><p>{step+1} of {groups.length} · Leaving keeps all unreviewed original names.</p>
      <blockquote className="import-group-source">{group.source}</blockquote>
      {!browse&&candidate&&<section aria-label="Suggested match"><strong>{candidate.name}</strong><button className="button secondary" onClick={event=>select(candidate.id,event)}>USE MATCH</button></section>}
      <button className="button quiet" onClick={()=>{setBrowse(true);requestAnimationFrame(()=>input.current?.focus());}}>CHOOSE ANOTHER</button>
      {browse&&<><input ref={input} className="text-answer" type="search" aria-label="Search exercise matches" value={query} onChange={event=>setQuery(event.target.value)}/><div className="import-resolution-options">{choices.map(item=><button className="button secondary" key={item.id} onClick={event=>select(item.id,event)}>{item.name}</button>)}</div></>}
    </div></div><SheetActionFooter separate importViewport><button className="button secondary" onClick={event=>select(null,event)}>KEEP ORIGINAL</button></SheetActionFooter>
  </section>;
}
