import React,{useId,useRef} from 'react';
import {exerciseName,targetLabel} from './domain.js';
import {Disclosure} from './Disclosure.jsx';
import {AdjustmentTargetsEditor} from './AdjustmentTargetsEditor.jsx';
import './adjustmentExerciseList.css';

export function AdjustmentExerciseList({exercises,editingId,onToggle,onEdit,onRemove,rirEnabled,commits,readOnly=false}) {
  const id=useId(),list=useRef(null);
  const remove=(exercise,index)=>{
    onRemove(exercise.id);
    requestAnimationFrame(()=>{
      const rows=list.current?.querySelectorAll('.adjust-exercise-toggle');
      rows?.[Math.min(index,rows.length-1)]?.focus();
    });
  };
  return <div ref={list} className="adjust-exercise-list">
    {!readOnly&&<p className="adjust-exercise-hint">Tap an exercise to edit. Remove applies only to today.</p>}
    {exercises.map((exercise,index)=>{
      const name=exerciseName(exercise),open=!readOnly&&editingId===exercise.id,panelId=`${id}-${exercise.id}`;
      return <article key={exercise.id} data-adjust-entry-id={exercise.id} className={`plan-editor-exercise adjust-exercise-card${open?' is-expanded':''}`}>
        <div className="adjust-exercise-header">
          {readOnly?<div className="adjust-exercise-readonly"><strong>{name}</strong><small>{targetLabel(exercise,rirEnabled)}</small></div>:
            <button type="button" className="plan-editor-summary adjust-exercise-toggle" aria-label={`Edit targets for ${name}`} aria-expanded={open} aria-controls={panelId} onClick={()=>onToggle(open?null:exercise.id)}>
              <span className="plan-editor-heading"><strong>{name}</strong><small>{targetLabel(exercise,rirEnabled)}</small></span>
              <span className="plan-editor-summary-action" aria-hidden="true"><i/></span>
            </button>}
          {!readOnly&&<button type="button" className="adjust-exercise-remove" aria-label={`Remove ${name} from today's workout`} title={exercises.length===1?'Keep at least one exercise':'Remove exercise'} disabled={exercises.length===1} onClick={()=>remove(exercise,index)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>
          </button>}
        </div>
        {!readOnly&&<Disclosure id={panelId} open={open} className="adjustment-target-disclosure" revealOnOpen>
          <div className="plan-editor-fields adjust-exercise-fields"><AdjustmentTargetsEditor exercise={exercise} name={name} rirEnabled={rirEnabled} commits={commits} showScopeHint={false} onChange={target=>onEdit(exercise.id,target)}/></div>
        </Disclosure>}
      </article>;
    })}
    {!readOnly&&exercises.length===1&&<p className="adjust-exercise-hint">Keep at least one exercise.</p>}
  </div>;
}
