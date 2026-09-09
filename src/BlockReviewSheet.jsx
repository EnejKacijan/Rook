import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { displayWeight, displayEstimatedOneRepMax, weightUnit, saveState, rankExerciseSearch } from './domain.js';
import { applyNextBlock, nextBlockReplacementChoices, proposeNextBlock, reviewTrainingBlock } from './blockReview.js';
import { SearchInput } from './SearchInput.jsx';
import { useSheetBack } from './useSheetBack.js';
import './blockReview.css';

const labels={progressed:'Progressed',held:'Held',review:'Review',insufficient:'Insufficient data'};
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
  const candidates=source?rankExerciseSearch(nextBlockReplacementChoices(state,source).filter(item=>item.name.toLowerCase().includes(query.trim().toLowerCase())),query):[];
  return <main ref={ref} className="screen detail-screen block-review-sheet">
    <Header title={step==='next'?(proposal?.repeat?'Repeat block':'Next block'):step==='replacement'?'Choose replacement':'Block review'} onClose={close} onBack={step!=='summary'||onBack?back:undefined}/>
    {step==='summary' && <>
      <p className="eyebrow">BLOCK REVIEW</p><h1>{review.name}</h1><p>{review.totalWeeks} weeks · {review.startDate}{review.completedAt?` – ${review.completedAt.slice(0,10)}`:''}</p>
      {block.historyCorrectedAt && <p className="sheet-footnote">Historical data changed after this block was reviewed. This summary reflects corrected history; approved plan decisions remain unchanged.</p>}
      <section className="block-review-hero" aria-label="Completed planned sessions"><strong>{review.completedSessions} / {review.plannedSessions}</strong><span>planned sessions completed</span></section>
      <h2 className="eyebrow">TRAINING</h2>
      <dl className="training-block-summary"><div><dt>Working sets</dt><dd>{review.loggedSets} / {review.prescribedSets}</dd></div><div><dt>Moved / skipped</dt><dd>{review.moved} / {review.skipped}</dd></div></dl>
      <p className="sheet-footnote">Working sets reflect accepted recorded workouts, including today-only changes. Skipped sessions are separate from completed training.</p>
      {!!review.endedEarly && <p className="sheet-footnote">{review.endedEarly} sessions ended early. Only logged work is counted.</p>}
      {!!review.optionalCompleted && <p className="sheet-footnote">{review.optionalCompleted} optional sessions completed separately.</p>}
      {review.deloadCompleted && <p className="sheet-footnote">Deload recorded. Lower programmed targets are not regression.</p>}
      {review.sessionFeedback && <p className="sheet-footnote session-feedback-block">{review.sessionFeedback.text} Subjective difficulty relative to expectation; not a recovery measure.</p>}
      <h2 className="eyebrow">PERFORMANCE</h2><dl className="training-block-summary"><div><dt>Progressed</dt><dd>{review.progressed}</dd></div><div><dt>Held</dt><dd>{review.held}</dd></div><div><dt>PR highlights</dt><dd>{review.prs}</dd></div><div><dt>For review</dt><dd>{review.review}</dd></div></dl>
      <button className="list-row" onClick={()=>setStep('exercises')}><span>Exercise outcomes</span><span aria-hidden="true">›</span></button>
      {!historical && <section className="block-review-next"><h2 className="eyebrow">NEXT BLOCK</h2><p>{review.rows.every(r=>r.status==='insufficient')?'There isn’t enough comparable data to justify major changes. Keep the current structure and continue collecting training history.':'Keep most of the program. Review supported working-load changes and any replacement suggestions before starting.'}</p><p className="sheet-footnote">{block.totalWeeks}-week structure{block.plannedDeloadWeek?`, planned deload in Week ${block.plannedDeloadWeek}`:''}. No automatic volume increases.</p><button className="button primary" disabled={!block.completed} onClick={()=>prepare(false)}>REVIEW NEXT BLOCK</button><button className="button secondary" disabled={!block.completed} onClick={()=>prepare(true)}>REPEAT BLOCK</button></section>}
      <button className="button quiet" onClick={close}>NOT NOW</button>
    </>}
    {step==='exercises' && <><p className="eyebrow">BLOCK EVIDENCE</p><h1>Exercise outcomes</h1><p>Comparable recorded sessions, not calendar movement. Held is a neutral result.</p><section className="block-outcomes">{review.rows.map(row=><article key={row.id}><h2>{row.name}</h2><strong>{labels[row.status]}</strong>{row.currentWeight!=null && <p>{row.fromWeight!=null&&row.fromWeight!==row.currentWeight?`${load(row.fromWeight)} → `:''}{load(row.currentWeight)}{row.repGain>0?` · +${row.repGain} reps`:''}</p>}<small>{row.comparableSessions} comparable sessions</small><p>{row.reason}</p>{row.estimatedOneRepMax!=null && <small>Estimated 1RM: {displayEstimatedOneRepMax(row.estimatedOneRepMax,state.profile.units)} {weightUnit(state.profile.units)} · estimated, not measured</small>}</article>)}</section></>}
    {step==='next' && proposal && <>
      <p className="eyebrow">{proposal.repeat?'REPEAT BLOCK':'NEXT BLOCK'}</p><h1>{review.name}</h1><p>{proposal.totalWeeks} weeks · Starts {proposal.startDate}</p><p className="sheet-footnote">{proposal.plannedDeloadWeek?`Deload stays in Week ${proposal.plannedDeloadWeek}.`:'No planned deload.'} Rep ranges, set volume and week-by-week effort stay unchanged.</p>
      <div className="block-next-content"><h2 className="eyebrow">{proposal.changes.length?'REVIEW CHANGES':'KEEPING THE STRUCTURE'}</h2>
      {!proposal.changes.length && <p>No structural changes recommended. Continue with your exercise history and established progression.</p>}
      {proposal.changes.map(item=><section className="block-next-change" key={item.id}><h2>{item.name}</h2><p>{item.kind==='load'?`${load(item.from)} → ${load(item.to)}`:`Recommended: ${item.toName}`}</p><small>{item.reason}</small>
        {item.plateOptions && <p className="sheet-footnote">Exact load is not available with your configured plates. Closest: {[item.plateOptions.lower,item.plateOptions.upper].filter(v=>v!=null).join(' / ')} {item.plateOptions.unit}. The target is not silently rounded.</p>}
        {!reviewBlocked && <fieldset className="flexible-adjustment-choice"><legend>Next-block choice</legend>{[['keep','Keep current'],['recommendation','Use recommendation']].map(([value,label])=><label key={value}><input type="radio" name={`block-choice-${item.id}`} checked={choices[item.id]===value} onChange={()=>setChoices(c=>({...c,[item.id]:value}))}/>{label}</label>)}{item.kind==='replacement' && <button className="text-button" onClick={()=>{setReplacementId(item.id);setQuery('');setStep('replacement');}}>Choose another replacement</button>}{!['keep','recommendation'].includes(choices[item.id]) && <small>Selected: {nextBlockReplacementChoices(state,state.program.days.find(d=>d.id===item.dayId).exercises.find(e=>e.id===item.id)).find(c=>c.id===choices[item.id])?.name}</small>}</fieldset>}
      </section>)}
      <details className="block-unchanged"><summary>Current program · {review.rows.length} exercises</summary>{state.program.days.map(day=><section key={day.id}><h2>{day.name}</h2>{day.exercises.map(exercise=><p key={exercise.id}>{review.rows.find(r=>r.id===exercise.id)?.name} · {exercise.sets.length} × {exercise.repMin}–{exercise.repMax}{exercise.targetRir!=null?` · ${exercise.targetRir} RIR`:''}</p>)}</section>)}</details>
      <p className="sheet-footnote">Starting creates a new block and a Plan History version. Completed workouts stay unchanged. Unstarted temporary adjustments and schedule overrides are cleared; none are carried into the new block.</p></div>
      <SheetActionFooter className="flexible-week-footer">
        {active && <p role="status">Finish the active workout before starting the next block.</p>}
        {error && <p role="alert">{error}</p>}
        {reviewBlocked && <button className="text-button" onClick={()=>prepare(proposal.repeat)}>REVIEW AGAIN</button>}
        <button className="button primary" disabled={active || reviewBlocked} onClick={apply}>{error && persistenceFailed?'TRY AGAIN':proposal.repeat?'REPEAT BLOCK':'START NEXT BLOCK'}</button><button className="button quiet" onClick={close}>CANCEL</button></SheetActionFooter>
    </>}
    {step==='replacement' && <><p className="eyebrow">BASE GYM EQUIPMENT</p><h1>Replace {change?.name}</h1><p>Only compatible choices are listed. The replacement uses its own working-weight history.</p><SearchInput className="text-answer" type="search" aria-label="Search next-block replacements" placeholder="Search exercises" value={query} onChange={event=>setQuery(event.target.value)} onClear={()=>setQuery('')}/><div className="adjust-option-list">{candidates.map(item=><button className="choice-row" key={item.id} onClick={()=>{setChoices(c=>({...c,[replacementId]:item.id}));back();}}><strong>{item.name}</strong></button>)}</div>{!candidates.length && <p>No compatible replacement matches this search. Keep the current exercise.</p>}</>}
    {error && step==='summary' && <p role="alert">{error}</p>}
  </main>;
}
