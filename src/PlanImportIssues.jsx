import { useId, useState } from 'react';
import { pendingImportIssues, importDecisionSummary, isImportAcknowledgement } from './planImportReview.js';
import './planImportIssues.css';
import { Disclosure } from './Disclosure.jsx';
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function PlanImportIssues({ review, resolved, program, onResolve, reviewRequest = 0, summaryOnly = false, onChange, decisionGroups=[] }) {
  const [detailsOpen,setDetailsOpen]=useState(false);
  const pending=pendingImportIssues(review,resolved);
  const exerciseCount=program.days.reduce((n,d)=>n+d.exercises.length,0);
  if(!review&&!program.importMetadata?.sourceNotes?.length)return null;
  const notes=pending.filter(isImportAcknowledgement);
  const allChoices=(review?.issues||[]).filter(issue=>issue.category!=='preserved'&&!isImportAcknowledgement(issue));
  const matchesPending=program.days.some(day=>day.exercises.some(exercise=>['unresolved','needs-name-review'].includes(exercise.matchStatus)));
  return <section className="plan-import-issues" aria-label="Import review" tabIndex={-1}>
    {review&&<>
    <span className="eyebrow">{pending.length||matchesPending?'READY TO REVIEW':'READY TO USE'}</span>
    <strong>{program.days.length} {program.days.length===1?'workout':'workouts'} · {exerciseCount} {exerciseCount===1?'exercise':'exercises'}</strong>
    <>
      <p role="status">{summaryOnly&&!pending.length&&!matchesPending?'Source decisions complete.':`${importDecisionSummary(review,resolved)}.`}</p>
      {decisionGroups.map(group=><button key={group.id} className="text-button" onClick={()=>onChange(group.id)}>Edit {group.title.toLowerCase()}</button>)}
      {!summaryOnly&&pending.length>0&&<strong>NEEDS YOUR DECISION</strong>}
      {!summaryOnly&&<>
        {notes.length > 0 && <div className="plan-import-notes" tabIndex={-1}>
          <strong>SOURCE TEXT THAT CANNOT BE PRESERVED</strong>
          <p>{notes.length} items will not be included.</p>
          {notes.map(note=>{
            const day=program.days.find(d=>d.id===note.dayId);
            const exercise=day?.exercises.find(e=>e.id===note.exerciseId);
            return <div className="plan-import-issue" key={note.id}>
              {day&&<small>{day.name}{exercise?` · ${exercise.importedName||exercise.exerciseId}`:''}</small>}
              <blockquote>{note.source}</blockquote>
              <p>{note.field==='source'?`${note.message} Any text not represented in the preview will be excluded from the imported plan.`:note.field==='instruction'?'Keep this instruction as an exercise note.':`Keep ${exercise?.importedName||exercise?.exerciseId||'the previewed exercise'} and its previewed prescription. Other alternatives will not be added; this excerpt will be saved as an exercise note.`}</p>
            </div>;
          })}
          <button type="button" className="button primary" onClick={()=>notes.forEach(note=>onResolve(note,{}))}>CONFIRM EXCLUSIONS ({notes.length})</button>
        </div>}
        {allChoices.map(issue=><ImportIssue key={issue.id} issue={issue} program={program} resolved={!!resolved[issue.id]} onResolve={value=>onResolve(issue,value)}/>)}
      </>}
    </>
    </>}
    {program.importMetadata?.sourceNotes?.length>0&&<div className="import-preserved-source">
      <strong>SOURCE DETAILS PRESERVED</strong>
      <p>{program.importMetadata?.sourceNotes.length} scoped source blocks preserved verbatim. Informational only — no confirmation required.</p>
      <button type="button" className="button quiet" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(value=>!value)}>{detailsOpen?'HIDE DETAILS':'VIEW DETAILS'}</button>
      <Disclosure open={detailsOpen}>{program.importMetadata?.sourceNotes.map((note,index)=><div className="plan-import-issue" key={index}><small>{note.scope==='workout'?'Workout source':'Plan / day source'} · {note.title}</small><blockquote>{note.text}</blockquote></div>)}</Disclosure>
    </div>}
  </section>;
}
export function ImportIssue({issue,program,resolved,onResolve,focused=false}){
  const helpId=useId();
  const day=program.days.find(d=>d.id===issue.dayId);
  const exercise=day?.exercises.find(e=>e.id===issue.exerciseId);
  const context=day ? `${day.name}${exercise?` · ${exercise.importedName||exercise.exerciseId}`:''}` : '';
  const comparable=value=>String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const selectedOption=issue.options?.findIndex(option=>JSON.stringify(option)===JSON.stringify(resolved?.option));
  const [value,setValue]=useState(resolved?.value??(selectedOption>=0?String(selectedOption):'__choose'));
  const [unit,setUnit]=useState(resolved?.unit||'kg');
  const [setIndex,setSetIndex]=useState(String(resolved?.setIndex??Math.max(0,(exercise?.sets.length||1)-1)));
  const [edited,setEdited]=useState(Boolean(resolved));
  const [sets,setSets]=useState(String(exercise?.sets.length??''));
  const [min,setMin]=useState(String(exercise?.repMin??''));
  const [max,setMax]=useState(String(exercise?.repMax??''));
  const numbers=Number.isInteger(Number(sets))&&Number(sets)>=1&&Number(sets)<=20&&Number.isInteger(Number(min))&&Number.isInteger(Number(max))&&Number(min)>=1&&Number(max)>=Number(min);
  const invalidFields=[...(!Number.isInteger(Number(sets))||Number(sets)<1||Number(sets)>20?['sets']:[]),...(!Number.isInteger(Number(min))||Number(min)<1?['repMin']:[]),...(!Number.isInteger(Number(max))||Number(max)<1?['repMax']:[]),...(min!==''&&max!==''&&Number(min)>Number(max)?['repMin','repMax']:[])];
  const prescriptionHelp=!edited?'Enter the intended sets and reps.':invalidFields.includes('sets')?'Enter a whole number of sets between 1 and 20.':min===''?'Enter minimum reps.':max===''?'Enter maximum reps.':Number(min)>Number(max)?'Maximum reps must be at least minimum reps.':'Enter positive whole numbers for reps.';
  const valid=issue.field==='advanced'?['drop','rest_pause','amrap','failure','note'].includes(value)&&Boolean(exercise?.sets[Number(setIndex)]):issue.field==='loggingMode'?['normal','per_side'].includes(value):issue.field==='day'?days.includes(value):issue.field==='load'?(value===''||Number.isFinite(Number(value))&&Number(value)>=0):issue.field==='prescription'?numbers:issue.field==='rir'?value===''||/^[0-4]$/.test(value):false;
  const payload=(overrides={})=>({value,unit,setIndex:Number(setIndex),sets:Number(sets),repMin:Number(min),repMax:Number(max),...overrides});
  const choose=(next)=>{setValue(next);setEdited(true);onResolve(payload({value:next}));};
  const inputChange=(setter,key,raw)=>{
    setter(raw);setEdited(true);
    const next=payload({[key]:raw});
    const accepted=issue.field==='load'?(raw===''||Number.isFinite(Number(raw))&&Number(raw)>=0):
      ['sets','repMin','repMax'].every(field=>next[field]!==''&&Number.isInteger(Number(next[field]))&&Number(next[field])>=1)&&Number(next.sets)<=20&&Number(next.repMax)>=Number(next.repMin);
    onResolve(accepted?{...next,sets:Number(next.sets),repMin:Number(next.repMin),repMax:Number(next.repMax)}:null);
  };
  return <div className="plan-import-issue plan-import-choice" data-unresolved={!resolved} tabIndex={-1}>
    <p>{issue.message}</p><span className="eyebrow">SOURCE</span><blockquote>{issue.source}</blockquote>
    {context&&comparable(context)!==comparable(issue.source)&&<small>{context}</small>}
    {issue.field==='sourceUnit'&&<div className="import-resolution-options">{['kg','lb'].map(unit=><button type="button" className="button secondary" key={unit} aria-pressed={resolved?.unit===unit} onClick={()=>onResolve({unit})}>{unit}</button>)}</div>}
    {issue.field==='day'&&<label>Workout day<select aria-label="Workout day" value={value} onChange={e=>choose(e.target.value)}><option value="__choose" disabled>Choose day</option>{days.map(d=><option key={d} value={d} disabled={program.days.some(other=>other.id!==day.id&&other.weekday===d)}>{d}</option>)}</select></label>}
    {issue.field==='rir'&&<label>RIR<select aria-label="Reviewed RIR" value={value} onChange={e=>choose(e.target.value)}><option value="__choose" disabled>Choose RIR</option><option value="">Unspecified</option>{[0,1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>}
    {issue.field==='loggingMode'&&<label>Logging mode<select aria-label="Reviewed logging mode" value={value} onChange={e=>choose(e.target.value)}><option value="__choose" disabled>Choose logging mode</option><option value="normal">One representative value</option><option value="per_side">Left and right separately</option></select></label>}
    {issue.field==='advanced'&&<><label>Set<select aria-label="Reviewed special set" value={setIndex} onChange={e=>{setSetIndex(e.target.value);if(edited&&valid)onResolve(payload({setIndex:Number(e.target.value)}));}}>{exercise?.sets.map((set,index)=><option key={set.id} value={index}>Set {index+1}</option>)}</select></label><label>Method<select aria-label="Reviewed set method" value={value} onChange={e=>choose(e.target.value)}><option value="__choose" disabled>Choose method</option><option value="drop">Drop set</option><option value="rest_pause">Rest-pause</option><option value="amrap">AMRAP</option><option value="failure">Failure · 0 RIR</option><option value="note">Keep as note only</option></select></label></>}
    {issue.field==='load'&&<><label>Load · optional<input aria-label="Reviewed load" type="text" inputMode="decimal" value={value==='__choose'?'':value} onChange={e=>inputChange(setValue,'value',e.target.value)}/></label><label>Unit<select aria-label="Reviewed load unit" value={unit} onChange={e=>{setUnit(e.target.value);if(edited&&valid)onResolve(payload({unit:e.target.value}));}}><option>kg</option><option>lb</option></select></label><button type="button" className="button quiet" onClick={()=>choose("")}>Leave load unspecified</button></>}
    {issue.field==='prescription'&&<div className="plan-import-prescription">{[['Sets',sets,setSets,'sets'],['Min reps',min,setMin,'repMin'],['Max reps',max,setMax,'repMax']].map(([label,v,set,key])=><label key={label}>{label}<input aria-label={`Reviewed ${label}`} aria-invalid={focused&&edited&&invalidFields.includes(key)||undefined} aria-describedby={!resolved?helpId:undefined} type="text" inputMode="numeric" value={v} onChange={e=>inputChange(set,key,e.target.value)}/></label>)}</div>}
    {issue.field==='alternative'&&<>
      {(issue.options||[]).map((option,index)=><button type="button" className="choice-row button secondary" key={index} aria-pressed={value===String(index)} onClick={()=>{setValue(String(index));onResolve({option});}}>{option.name} · {option.sets} × {option.repMin}{option.repMax!==option.repMin?`–${option.repMax}`:''}{option.measure==='seconds'?' sec':''}{option.weight!==null?` · ${Number((option.sourceWeight??option.weight).toFixed(2))} ${option.sourceUnit||'kg'}`:''}{option.targetRir!=null?` · ${option.targetRir} RIR`:''}</button>)}
      {!issue.options?.length&&<p role="alert">These alternatives need clearer source details. Go Back to edit your notes, and give each exercise its own sets × reps and explicit load unit where applicable. Nothing has been chosen automatically.</p>}
    </>}
    {issue.field==='grouping'&&<button type="button" className="button secondary" aria-pressed={Boolean(resolved)} onClick={()=>onResolve({value:'separate'})}>KEEP AS SEPARATE EXERCISES</button>}
    {issue.field==='load'&&resolved&&value===''&&<small role="status">✓ Load unspecified</small>}
    {issue.field==='prescription'&&!resolved&&<>
      <small id={helpId} aria-live={focused?'polite':undefined}>{focused?prescriptionHelp:issue.requiresReps?'Enter the intended min and max reps to resolve this decision.':'Enter the intended sets and reps, or explicitly accept the values shown.'}</small>
      {!focused&&!issue.requiresReps&&<button type="button" className="button primary" disabled={!valid} onClick={()=>onResolve(payload())}>USE THESE SETS &amp; REPS</button>}
    </>}
  </div>;
}
