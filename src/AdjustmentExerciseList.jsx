import React,{useId,useRef} from 'react';
import {exerciseName,targetLabel} from './domain.js';
import {Disclosure} from './Disclosure.jsx';
import {AdjustmentTargetsEditor} from './AdjustmentTargetsEditor.jsx';
import {SwipeActionRow,useSwipeActionList} from './SwipeActionRow.jsx';
import './adjustmentExerciseList.css';

// Same card anatomy as Edit today's exercises: EDIT/CLOSE on the row, swipe to
// remove while collapsed, and one Remove · Done toolbar inside the open card.
export function AdjustmentExerciseList({exercises,editingId,onToggle,onEdit,onRemove,rirEnabled,commits,readOnly=false}) {
  const id=useId(),list=useRef(null);
  const canRemove=!readOnly&&exercises.length>1;
  useSwipeActionList(list,!readOnly);
  const remove=(exercise,index)=>{
    onRemove(exercise.id);
    requestAnimationFrame(()=>{
      const rows=list.current?.querySelectorAll('.adjust-exercise-toggle');
      rows?.[Math.min(index,rows.length-1)]?.focus();
    });
  };
  return <div ref={list} className="adjust-exercise-list">
    {!readOnly&&<p className="adjust-exercise-hint">Tap an exercise to edit. {canRemove && "Swipe left to remove. "}Changes apply only to today.</p>}
    {exercises.map((exercise,index)=>{
      const name=exerciseName(exercise),open=!readOnly&&editingId===exercise.id,panelId=`${id}-${exercise.id}`;
      return <SwipeActionRow as="article" key={exercise.id} data-adjust-entry-id={exercise.id}
        enabled={canRemove&&!open} onRemove={()=>remove(exercise,index)}
        removeLabel={`Remove ${name} from today's workout`}
        className={`plan-editor-exercise adjust-exercise-card${open?' is-expanded':''}`}>
        <div className="adjust-exercise-header">
          {readOnly?<div className="adjust-exercise-readonly"><strong>{name}</strong><small>{targetLabel(exercise,rirEnabled)}</small></div>:
            <button type="button" className="plan-editor-summary adjust-exercise-toggle" aria-label={`Edit targets for ${name}`} aria-expanded={open} aria-controls={panelId} onClick={()=>onToggle(open?null:exercise.id)}>
              <span className="plan-editor-heading"><strong>{name}</strong><small>{targetLabel(exercise,rirEnabled)}</small></span>
              <span className="plan-editor-summary-action" aria-hidden="true"><b>{open?'CLOSE':'EDIT'}</b><i/></span>
            </button>}
        </div>
        {!readOnly&&<Disclosure id={panelId} open={open} className="adjustment-target-disclosure" revealOnOpen>
          <div className="plan-editor-fields adjust-exercise-fields">
            <AdjustmentTargetsEditor exercise={exercise} name={name} rirEnabled={rirEnabled} commits={commits} showScopeHint={false} onChange={target=>onEdit(exercise.id,target)}/>
            <div className="plan-editor-actions">
              <button type="button" className="plan-exercise-remove adjust-exercise-remove danger-text" aria-label={`Remove ${name} from today's workout`}
                title={canRemove?'Remove exercise':'Keep at least one exercise'} disabled={!canRemove} onClick={()=>remove(exercise,index)}>
                <svg className="plan-editor-action-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>Remove
              </button>
              <button type="button" className="plan-editor-done" onClick={()=>onToggle(null)}>DONE</button>
            </div>
          </div>
        </Disclosure>}
      </SwipeActionRow>;
    })}
    {!readOnly&&exercises.length===1&&<p className="adjust-exercise-hint">Keep at least one exercise.</p>}
  </div>;
}
