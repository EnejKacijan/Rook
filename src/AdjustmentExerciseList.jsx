import React,{useId,useRef} from 'react';
import {exerciseName,targetLabel} from './domain.js';
import {Disclosure} from './Disclosure.jsx';
import {AdjustmentTargetsEditor} from './AdjustmentTargetsEditor.jsx';
import {SwipeActionRow,useSwipeActionList} from './SwipeActionRow.jsx';
import './adjustmentExerciseList.css';

const defaultHint = 'Changes apply only to today.';

export function AdjustmentExerciseList({
  exercises, editingId, onToggle, onEdit, onRemove, rirEnabled, commits, readOnly=false,
  getRowState, onRestore, renderDetails, scopeHint=defaultHint,
}) {
  const id=useId(),list=useRef(null);
  const rows=exercises.map(exercise=>{
    const row=getRowState?.(exercise) || {};
    const editable=!readOnly && !row.locked && !row.omitted;
    return {
      exercise, ...row, editable,
      removable:editable && (row.removable ?? exercises.length>1),
    };
  });
  const canSwipe=rows.some(row=>row.removable);
  useSwipeActionList(list,canSwipe);

  const updateSelection=(update,exercise,index)=>{
    if (update(exercise.id)===false) return false;
    requestAnimationFrame(()=>{
      const cards=list.current?.querySelectorAll('[data-adjust-entry-id]:not([data-row-exit])');
      const card=cards?.[Math.min(index,cards.length-1)];
      const target=card?.querySelector('.adjust-exercise-toggle:not(:disabled)');
      (target || cards?.[Math.max(0,index-1)]?.querySelector('.adjust-exercise-toggle:not(:disabled)'))?.focus({preventScroll:true});
    });
    return true;
  };

  return <div ref={list} className="adjust-exercise-list">
    {!readOnly && <p className="adjust-exercise-hint">Tap an exercise to edit. {canSwipe && 'Swipe left to remove. '}{scopeHint}</p>}
    {rows.map(({exercise,editable,removable,omitted,restorable,detail,note,removeHint},index)=>{
      const name=exerciseName(exercise),open=editable&&editingId===exercise.id,panelId=`${id}-${exercise.id}`;
      const removeLabel=`Remove ${name} from today's workout`;
      const heading=<span className="plan-editor-heading"><strong>{name}</strong><small>{detail ?? targetLabel(exercise,rirEnabled)}</small>{note&&<small>{note}</small>}</span>;
      return <SwipeActionRow as="article" key={`${exercise.id}:${omitted?'omitted':'included'}`} data-adjust-entry-id={exercise.id}
        data-adjust-omitted={omitted || undefined} enabled={removable&&!open} onRemove={()=>updateSelection(onRemove,exercise,index)}
        removeLabel={removeLabel} className={`plan-editor-exercise adjust-exercise-card${open?' is-expanded':''}`}>
        <div className="adjust-exercise-header">
          {omitted ? <button type="button" className="plan-editor-summary adjust-exercise-toggle adjust-exercise-restore"
            aria-label={`Add ${name} to today's workout`} disabled={restorable===false} onClick={()=>updateSelection(onRestore,exercise,index)}>
            {heading}<span className="plan-editor-summary-action" aria-hidden="true"><b>ADD</b></span>
          </button> : editable ? <button type="button" className="plan-editor-summary adjust-exercise-toggle" data-swipe-body={removable&&!open || undefined}
            aria-label={renderDetails ? `Edit ${name}` : `Edit targets for ${name}`} aria-expanded={open} aria-controls={panelId} onClick={()=>onToggle(open?null:exercise.id)}>
            {heading}<span className="plan-editor-summary-action" aria-hidden="true"><b>{open?'CLOSE':'EDIT'}</b><i/></span>
          </button> : <div className="adjust-exercise-readonly">{heading}</div>}
        </div>
        {editable && <Disclosure id={panelId} open={open} className="adjustment-target-disclosure" revealOnOpen>
          <div className="plan-editor-fields adjust-exercise-fields">
            {renderDetails ? renderDetails(exercise) : <AdjustmentTargetsEditor exercise={exercise} name={name} rirEnabled={rirEnabled} commits={commits}
              showScopeHint={false} onChange={target=>onEdit(exercise.id,target)}/>}
            <div className="plan-editor-actions">
              <button type="button" className="plan-exercise-remove adjust-exercise-remove danger-text" aria-label={removeLabel}
                title={removable?'Remove exercise':removeHint || 'Keep at least one exercise'} disabled={!removable} onClick={()=>updateSelection(onRemove,exercise,index)}>
                <svg className="plan-editor-action-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>Remove
              </button>
              <button type="button" className="plan-editor-done" onClick={event=>{
                const toggle=event.currentTarget.closest('.adjust-exercise-card')?.querySelector('.adjust-exercise-toggle');
                toggle?.focus({preventScroll:true});
                onToggle(null);
              }}>DONE</button>
            </div>
          </div>
        </Disclosure>}
      </SwipeActionRow>;
    })}
    {!readOnly && !getRowState && exercises.length===1 && <p className="adjust-exercise-hint">Keep at least one exercise.</p>}
  </div>;
}
