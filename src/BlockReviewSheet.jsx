import {AnimatedDetails} from './AnimatedDetails.jsx';
import {ReviewDetails} from './ReviewDetails.jsx';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { displayWeight, saveState, searchExercises } from './domain.js';
import { applyNextBlock, nextBlockReplacementChoices, proposeNextBlock, reviewTrainingBlock } from './blockReview.js';
import { BlockReviewSummary, BlockOutcomes } from './BlockReviewSummary.jsx';
import { SearchInput } from './SearchInput.jsx';
import { useSheetBack } from './useSheetBack.js';
import './blockReview.css';

export function BlockReviewSheet({state,update,close,Header,blockId,onBack}) {
  const current=state.program?.trainingBlock;
  const block=blockId && blockId!==current?.id ? state.completedTrainingBlocks?.find(b=>b.id===blockId) : current;
  const historical=block?.id!==current?.id;
  const review=useMemo(()=>reviewTrainingBlock(state,block),[state,block]);
  const [step,setStep]=useState('summary'),[proposal,setProposal]=useState(null),[choices,setChoices]=useState({}),[replacementId,setReplacementId]=useState(null),[query,setQuery]=useState(''),[error,setError]=useState('');
  const ref=useRef(null),applied=useRef(false);
  const [persistenceFailed,setPersistenceFailed]=useState(false);
  const back=()=>{setError('');if(step==='replacement'){setStep('next');setReplacementId(null);setQuery('');}else if(step==='next'||step==='exercises')setStep('summary');else onBack?.();};
  useSheetBack(ref,step,step==='summary'?null:step==='replacement'?'next':'summary',back);
  useLayoutEffect(()=>{if(ref.current)ref.current.scrollTop=0;},[step]);
  useLayoutEffect(()=>{
    const screen=ref.current,footer=screen?.querySelector('.flexible-week-footer');
    if(!footer)return;
    const measure=()=>screen.style.setProperty('--block-footer-height',`${footer.getBoundingClientRect().height}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(footer);return ()=>observer.disconnect();
  },[step,error]);
  if(!review)return null;
  const unit=state.profile.units==='lb'?'lb':'kg',load=value=>`${displayWeight(value,unit)} ${unit}`;
  const prepare=repeat=>{
    setPersistenceFailed(false);
    const result=proposeNextBlock(state,{repeat});if(result.status!=='ready'){setError(result.error);return;}
    setProposal(result);setChoices(Object.fromEntries(result.changes.map(c=>[c.id,c.kind==='load'?'recommendation':'keep'])));setError('');setStep('next');
  };
  const apply=()=>{
    if(applied.current)return;
    const result=applyNextBlock(state,proposal,choices,{persist:saveState});
    setPersistenceFailed(result.status==='persistence-failed');
    if(result.status!=='applied'){setError(result.error);return;}
    applied.current=true;update(()=>result.state,{planVersion:false});close();
  };
  const active=Boolean(state.activeWorkout||state.activeOptionalSession);
  const reviewBlocked=!!error && !persistenceFailed;
  const change=proposal?.changes.find(item=>item.id===replacementId);
  const source=change && state.program.days.find(d=>d.id===change.dayId)?.exercises.find(e=>e.id===change.id);
  const candidates=source?searchExercises(nextBlockReplacementChoices(state,source), query, { searchMuscles: true }):[];
  const firstWorkout=proposal && new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric'}).format(new Date(`${proposal.startDate}T12:00:00`));
  return <main ref={ref} className="screen detail-screen block-review-sheet">
    <Header title={step==='next'?(proposal?.repeat?'Repeat block':'Next block'):step==='replacement'?'Choose replacement':step==='exercises'?'Exercise results':'Block review'} onClose={close} onBack={step!=='summary'||onBack?back:undefined}/>
    {step==='summary' && <BlockReviewSummary review={review} block={block} units={state.profile.units} historical={historical} onOutcomes={()=>setStep('exercises')}
      next={<>{!historical && <section className="block-review-next" aria-labelledby="block-next-title"><p className="eyebrow">WHAT’S NEXT</p><h2 id="block-next-title">Plan your next block</h2><p>{review.rows.every(r=>r.status==='insufficient')?'Keep the current structure while you build more training history.':'See suggested weights and exercise changes first. Nothing changes until you confirm.'}</p><button className="button primary" disabled={!block.completed} onClick={()=>prepare(false)}>REVIEW NEXT BLOCK</button><button className="button secondary" disabled={!block.completed} onClick={()=>prepare(true)}>REPEAT BLOCK</button>{!block.completed&&<p className="sheet-footnote">Finish the remaining block workouts first.</p>}</section>}
      <button className="button quiet block-review-close" onClick={close}>{historical?'CLOSE':'NOT NOW'}</button></>}/>}
    {step==='exercises' && <BlockOutcomes review={review} units={state.profile.units}/>}
    {step==='next' && proposal && <>
      <p className="review-scope">Weekly plan · {proposal.repeat?'Repeat block':'Next block'}</p><h1>{review.name}</h1><p>{proposal.totalWeeks} weeks{proposal.plannedDeloadWeek?` · Deload Week ${proposal.plannedDeloadWeek}`:''}</p>
      <div className="block-next-content"><h2 className="eyebrow">{proposal.changes.length?'REVIEW CHANGES':'KEEPING THE STRUCTURE'}</h2>
      {!proposal.changes.length && <p>Keep your current exercises and targets.</p>}
      {proposal.changes.map(item=><section className="block-next-change" key={item.id}><h2>{item.name}</h2><p>{item.kind==='load'?`${load(item.from)} → ${load(item.to)}`:`Recommended: ${item.toName}`}</p><ReviewDetails title="Why this change?"><p>{item.reason}</p></ReviewDetails>
        {item.plateOptions && <p className="sheet-footnote">Exact load is not available with your configured plates. Closest: {[item.plateOptions.lower,item.plateOptions.upper].filter(v=>v!=null).join(' / ')} {item.plateOptions.unit}. The target is not silently rounded.</p>}
        {!reviewBlocked && <fieldset className="flexible-adjustment-choice"><legend>Next-block choice</legend>{[['keep','Keep current'],['recommendation','Use recommendation']].map(([value,label])=><label key={value}><input type="radio" name={`block-choice-${item.id}`} checked={choices[item.id]===value} onChange={()=>setChoices(c=>({...c,[item.id]:value}))}/>{label}</label>)}{item.kind==='replacement' && <button className="text-button" onClick={()=>{setReplacementId(item.id);setQuery('');setStep('replacement');}}>Choose another replacement</button>}{!['keep','recommendation'].includes(choices[item.id]) && <small>Selected: {nextBlockReplacementChoices(state,state.program.days.find(d=>d.id===item.dayId).exercises.find(e=>e.id===item.id)).find(c=>c.id===choices[item.id])?.name}</small>}</fieldset>}
      </section>)}
      <AnimatedDetails className="block-unchanged"><summary>Current program · {review.rows.length} exercises</summary>{state.program.days.map(day=><section key={day.id}><h2>{day.name}</h2>{day.exercises.map(exercise=><p key={exercise.id}>{review.rows.find(r=>r.id===exercise.id)?.name} · {exercise.sets.length} × {exercise.repMin}–{exercise.repMax}{exercise.targetRir!=null?` · ${exercise.targetRir} RIR`:''}</p>)}</section>)}</AnimatedDetails>
      {Boolean(state.todayAdaptation||Object.keys(state.flexibleWeek?.sessions||{}).length||Object.keys(state.weekScheduleOverrides||{}).length||Object.keys(state.workoutOccurrenceOverrides||{}).length)&&<p className="sheet-footnote">Confirming this block clears pending workout and schedule adjustments.</p>}</div>
      <SheetActionFooter className="flexible-week-footer">
        <p className="block-first-workout">First workout: <time dateTime={proposal.startDate}>{firstWorkout}</time></p>
        {active && <p role="status">Finish the active workout before starting the next block.</p>}
        {error && <p role="alert">{error}</p>}
        {reviewBlocked && <button className="text-button" onClick={()=>prepare(proposal.repeat)}>REVIEW AGAIN</button>}
        <button className="button primary" disabled={active || reviewBlocked} onClick={apply}>{error && persistenceFailed?'TRY AGAIN':'CONFIRM NEXT BLOCK'}</button><button className="button quiet" onClick={close}>CANCEL</button></SheetActionFooter>
    </>}
    {step==='replacement' && <><p className="eyebrow">BASE GYM EQUIPMENT</p><h1>Replace {change?.name}</h1><p>Only compatible choices are listed. The replacement uses its own working-weight history.</p><SearchInput className="text-answer" type="search" aria-label="Search next-block replacements" placeholder="Search exercises" value={query} onChange={event=>setQuery(event.target.value)} onClear={()=>setQuery('')}/><div className="adjust-option-list">{candidates.map(item=><button className="choice-row" key={item.id} onClick={()=>{setChoices(c=>({...c,[replacementId]:item.id}));back();}}><strong>{item.name}</strong></button>)}</div>{!candidates.length && <p>No compatible replacement matches this search. Keep the current exercise.</p>}</>}
    {error && step==='summary' && <p role="alert">{error}</p>}
  </main>;
}
