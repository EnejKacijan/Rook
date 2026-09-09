import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { displayWeight, storedWeight, exerciseName, exerciseMeasure, exerciseLoadRequirement, saveState } from './domain.js';
import { SET_TYPES, setTypeOf, loggingModeOf } from './advancedLogging.js';
import { createHistoryCorrection, correctionFingerprint, prepareHistoryCorrection, saveHistoryCorrection } from './historyCorrection.js';
import './historyCorrection.css';
import { sessionFeedbackLabel } from './sessionFeedback.js';
import { SessionFeedbackChoices } from './SessionFeedback.jsx';
import { historyCorrectionDelta } from './historyCorrectionDelta.js';

function NumberField({label,value,onChange,weight=false,units='kg',max}) {
  return <label>{label}<input aria-label={label} type="number" inputMode={weight?'decimal':'numeric'} min={0} max={max} step={weight?'any':1} value={value==null?'':weight?displayWeight(value,units):value} onChange={event=>onChange(event.target.value===''?null:weight?storedWeight(event.target.value,units):Number(event.target.value))}/></label>;
}
export function HistoryCorrectionEditor({workout,state,update,onDone,closeSheet,Header}) {
  const [draft,setDraft]=useState(()=>createHistoryCorrection(workout)),[stage,setStage]=useState('edit'),[error,setError]=useState(''),[discard,setDiscard]=useState(null),[removing,setRemoving]=useState(null);
  const root=useRef(null),saved=useRef(false),allowClose=useRef(false);
  const [persistenceFailed,setPersistenceFailed]=useState(false);
  const dirty=correctionFingerprint(draft.workout)!==draft.initialFingerprint;
  const change=fn=>{setError('');setPersistenceFailed(false);setDraft(previous=>{const next=structuredClone(previous);fn(next.workout);return next;});};
  const editSet=(exerciseId,setId,fn)=>change(w=>fn(w.exercises.find(e=>e.id===exerciseId).sets.find(s=>s.id===setId)));
  const exit=()=>dirty?setDiscard('back'):onDone();
  useEffect(()=>{const layer=root.current?.closest('.modal-layer');const guard=event=>{if(dirty&&!allowClose.current){event.preventDefault();setDiscard('close');}};layer?.addEventListener('rook:before-sheet-close',guard);return ()=>layer?.removeEventListener('rook:before-sheet-close',guard);},[dirty]);
  useLayoutEffect(()=>{root.current.scrollTop=0;const heading=root.current.querySelector('h1');heading?.focus({preventScroll:true});},[stage]);
  useLayoutEffect(()=>{if(removing)root.current.querySelector('.history-correction-confirm')?.scrollIntoView({block:'center'});},[removing]);
  const revealFocusedRow=()=>{
    const screen=root.current,row=document.activeElement?.closest('.history-number-fields'),footer=screen?.querySelector('.history-correction-footer');
    if(!row||!screen?.contains(row)||!footer)return;
    const bounds=row.getBoundingClientRect(),limit=footer.getBoundingClientRect().top-24;
    if(bounds.bottom>limit)screen.scrollTop+=bounds.bottom-limit;
  };
  useLayoutEffect(revealFocusedRow,[draft]);
  useLayoutEffect(()=>{
    const footer=root.current?.querySelector('.history-correction-footer');if(!footer)return;
    const measure=()=>{root.current?.style.setProperty('--history-footer-height',`${footer.getBoundingClientRect().height}px`);revealFocusedRow();};
    measure();const observer=new ResizeObserver(measure);observer.observe(footer);window.visualViewport?.addEventListener('resize',measure);
    return ()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',measure);};
  },[stage,discard]);
  const checked=prepareHistoryCorrection(state,draft);
  const commit=()=>{if(saved.current)return;const result=saveHistoryCorrection(state,draft,{persist:saveState});setPersistenceFailed(result.status==='persistence-failed');if(result.status!=='saved'){setError(result.error);return;}saved.current=true;update(()=>result.state,{planVersion:false});onDone();};
  const review=()=>{if(checked.status!=='ready'){setError(checked.error);return;}setStage('review');};
  const units=state.profile.units==='lb'?'lb':'kg';
  const describe=(set,exercise)=>!set?'Removed':!set.completed?'Not logged':[
    set.weight!=null?`${displayWeight(set.weight,units)} ${units}`:null,
    set.sides?`L ${set.sides.left?.reps??'—'} / R ${set.sides.right?.reps??'—'}`:set.reps!=null?`${set.reps} ${exerciseMeasure(exercise)==='seconds'?'sec':'reps'}`:'Reps unknown',
    set.rir!=null?`${set.rir} RIR`:null,set.setType!=='standard'?SET_TYPES[set.setType]?.label:null,
    ...((set.segments||[]).map((segment,index)=>`Segment ${index+1}: ${segment.weight==null?'—':displayWeight(segment.weight,units)} ${units} × ${segment.reps??'—'}${segment.rir!=null?` · ${segment.rir} RIR`:''}${segment.completed?'':' · not logged'}`)),
  ].filter(Boolean).join(' · ');
  return <main ref={root} className="screen detail-screen history-correction-editor" onFocusCapture={()=>requestAnimationFrame(revealFocusedRow)}>
    <Header title={stage==='review'?'Review corrections':'Correct history'} onClose={()=>dirty?setDiscard('close'):closeSheet()} onBack={()=>stage==='review'?setStage('edit'):exit()}/>
    <p className="eyebrow">{stage==='review'?'SAVE CHANGES?':'CORRECT HISTORY'}</p><h1 tabIndex={-1}>{workout.name}</h1>
    <p>{stage==='review'?'This may update PRs and progression history.':'Correct what you logged. The original plan, dates and workout identity stay unchanged.'}</p>
    {discard?<section className="history-correction-confirm" role="alert"><h2>Discard changes?</h2><p>Your saved workout will stay unchanged.</p><button className="button primary" onClick={()=>setDiscard(null)}>KEEP EDITING</button><button className="button quiet danger-text" onClick={()=>{allowClose.current=true;discard==='close'?closeSheet():onDone();}}>DISCARD CHANGES</button></section>:<>
    {stage==='edit'?<>
      <label className="history-note">Session note<textarea aria-label="Session note" maxLength={500} rows={2} value={draft.workout.sessionNote||''} onChange={event=>change(w=>w.sessionNote=event.target.value)}/></label>
      <SessionFeedbackChoices value={draft.workout.sessionFeedback} onChange={value=>change(w=>w.sessionFeedback=value)} />
      {draft.workout.exercises.map((exercise,index)=><details className="history-edit-exercise" key={exercise.id} open={index===0?true:undefined}>
        <summary>{exerciseName(exercise)}<small>{exercise.repMin!=null?`Prescribed ${exercise.originalPrescription?.sets?.length??exercise.sets.filter(s=>!s.added&&s.planned!==false).length} × ${exercise.repMin}–${exercise.repMax}${exercise.targetRir!=null?` · ${exercise.targetRir} RIR`:''}`:'Original target unknown'}</small></summary>
        {exercise.sets.map((set,setIndex)=><section className="history-edit-set" key={set.id}>
          <div className="history-set-heading"><strong>Set {setIndex+1}{set.added?' · Added':''}</strong><label><input type="checkbox" aria-label={`Set ${setIndex+1} logged`} checked={Boolean(set.completed)} onChange={event=>editSet(exercise.id,set.id,s=>s.completed=event.target.checked)}/>Logged</label></div>
          <div className="history-number-fields">
            {exerciseLoadRequirement(exercise)!=='none'&&<NumberField label={units.toUpperCase()} weight units={units} value={set.weight} onChange={v=>editSet(exercise.id,set.id,s=>s.weight=v)}/>}
            {loggingModeOf(exercise)!=='per_side'&&<NumberField label={exerciseMeasure(exercise)==='seconds'?'Seconds':'Reps'} value={set.reps} onChange={v=>editSet(exercise.id,set.id,s=>s.reps=v)}/>}
            <NumberField label="RIR" max={4} value={set.rir} onChange={v=>editSet(exercise.id,set.id,s=>s.rir=v)}/>
          </div>
          {loggingModeOf(exercise)==='per_side'&&<div className="history-number-fields">{['left','right'].map(side=><NumberField key={side} label={`${side==='left'?'Left':'Right'} reps`} value={set.sides?.[side]?.reps} onChange={v=>editSet(exercise.id,set.id,s=>{s.sides||={left:{reps:null},right:{reps:null}};s.sides[side].reps=v;})}/>)}</div>}
          <label className="history-set-type">Set type<select aria-label={`Set ${setIndex+1} type`} value={setTypeOf(set)} onChange={event=>editSet(exercise.id,set.id,s=>{s.setType=event.target.value;s.segments=[];})}>{Object.entries(SET_TYPES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
          {['drop','rest_pause'].includes(setTypeOf(set))&&<div className="history-segments">{(set.segments||[]).map((segment,segmentIndex)=><section key={segment.id}><strong>Segment {segmentIndex+1}</strong><div className="history-number-fields">{exerciseLoadRequirement(exercise)!=='none'&&<NumberField label={`Segment ${segmentIndex+1} ${units.toUpperCase()}`} weight units={units} value={segment.weight} onChange={v=>editSet(exercise.id,set.id,s=>s.segments[segmentIndex].weight=v)}/>}<NumberField label={`Segment ${segmentIndex+1} reps`} value={segment.reps} onChange={v=>editSet(exercise.id,set.id,s=>s.segments[segmentIndex].reps=v)}/><NumberField label={`Segment ${segmentIndex+1} RIR`} value={segment.rir} max={4} onChange={v=>editSet(exercise.id,set.id,s=>s.segments[segmentIndex].rir=v)}/></div><label><input type="checkbox" checked={segment.completed} onChange={event=>editSet(exercise.id,set.id,s=>s.segments[segmentIndex].completed=event.target.checked)}/> Segment logged</label><button className="text-button" onClick={()=>setRemoving({exerciseId:exercise.id,setId:set.id,segmentId:segment.id})}>Remove segment</button></section>)}<button className="text-button" onClick={()=>editSet(exercise.id,set.id,s=>{s.segments||=[];s.segments.push({id:crypto.randomUUID(),kind:setTypeOf(s),order:s.segments.length+1,weight:null,reps:null,rir:null,completed:false});})}>Add segment</button></div>}
          {set.added&&<button className="text-button" onClick={()=>setRemoving({exerciseId:exercise.id,setId:set.id})}>Remove added set</button>}
        </section>)}
        <button className="text-button" onClick={()=>change(w=>w.exercises.find(e=>e.id===exercise.id).sets.push({id:crypto.randomUUID(),planned:false,added:true,completed:false,weight:null,reps:null,rir:null}))}>Add missed set</button>
        <label className="history-note">Exercise note<textarea aria-label={`${exerciseName(exercise)} note`} rows={2} maxLength={120} value={exercise.personalNote||''} onChange={event=>change(w=>w.exercises.find(e=>e.id===exercise.id).personalNote=event.target.value)}/></label>
      </details>)}
    </>:<section className="history-correction-diff">{[
      ['Session note', checked.original?.sessionNote || '', checked.corrected?.sessionNote || ''],
      ['Session felt', sessionFeedbackLabel(checked.original?.sessionFeedback) || (checked.original?.sessionFeedback === 'skipped' ? 'Skipped' : 'Not provided'), sessionFeedbackLabel(checked.corrected?.sessionFeedback) || (checked.corrected?.sessionFeedback === 'skipped' ? 'Skipped' : 'Not provided')],
      ...(checked.corrected?.exercises || []).map(exercise => [`${exerciseName(exercise)} note`, checked.original.exercises.find(item => item.id === exercise.id)?.personalNote || '', exercise.personalNote || '']),
    ].filter(([, before, after]) => before !== after).map(([label, before, after], index) => <article key={index}><h2>{label}</h2><p>{before || 'None'} → {after || 'None'}</p></article>)}{checked.changes?.map(item=>{const exercise=draft.workout.exercises.find(e=>e.id===item.exerciseId);return <article key={item.setId}><h2>{exerciseName(exercise)} · Set {item.setNumber}</h2>{item.before&&item.after?historyCorrectionDelta(item.before,item.after,{units,measure:exerciseMeasure(exercise)}).map((line,index)=><p key={index}>{line}</p>):<><p>{item.before?'Removed set':'Added set'}: {describe(item.before||item.after,exercise)}</p></>}</article>;})}</section>}
    {removing&&<section role="alert" className="history-correction-confirm"><h2>Remove {removing.segmentId?'segment':'added set'}?</h2><p>This changes only the correction draft.</p><button className="button primary" onClick={()=>setRemoving(null)}>KEEP</button><button className="button quiet danger-text" onClick={()=>{change(w=>{const e=w.exercises.find(e=>e.id===removing.exerciseId);if(removing.segmentId){const s=e.sets.find(s=>s.id===removing.setId);s.segments=s.segments.filter(s=>s.id!==removing.segmentId);}else e.sets=e.sets.filter(s=>s.id!==removing.setId);});setRemoving(null);}}>REMOVE</button></section>}
    <SheetActionFooter className="history-correction-footer">{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={!dirty||!!removing} onClick={stage==='edit'?review:commit}>{stage==='edit'?'REVIEW CHANGES':persistenceFailed?'TRY AGAIN':'SAVE CHANGES'}</button><button className="button quiet" onClick={()=>stage==='review'?setStage('edit'):exit()}>{stage==='review'?'BACK TO EDIT':'CANCEL'}</button></SheetActionFooter>
    </>}
  </main>;
}
