import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {Disclosure} from './Disclosure.jsx';
import {useDurableAction} from './useDurableAction.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesMatch} from './previousValues.js';

export function PreviousValuesHelper({state,update,exercise,set,prior,index,label,screenRef}) {
  const {commit,latest}=useDurableAction(state,update);
  const [record,setRecord]=useState(null),[undoable,setUndoable]=useState(false),[error,setError]=useState(''),[draftEdited,setDraftEdited]=useState(false);
  const liveRecord=useRef(null),pendingDrafts=useRef(null),animations=useRef([]),undoAllowed=useRef(false);
  const helper=useRef(null),focusAfterAction=useRef(false);
  useLayoutEffect(()=>{if(focusAfterAction.current){helper.current?.querySelector(record?'.freestyle-copy-applied':'.freestyle-copy')?.focus({preventScroll:true});focusAfterAction.current=false;}},[record]);
  const row=()=>[...screenRef?.current?.querySelectorAll('[data-set-id]')||[]].find(node=>node.dataset.setId===set.id);
  const inputs=()=>[...row()?.querySelectorAll('[data-workout-draft]')||[]];
  const snapshot=()=>inputs().map(input=>{
    const detail={};input.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));
    return {field:input.closest('[data-workout-field]').dataset.workoutField,snapshot:detail.snapshot};
  });
  const restoreDrafts=drafts=>flushSync(()=>inputs().forEach(input=>{
    const saved=drafts?.find(entry=>entry.field===input.closest('[data-workout-field]').dataset.workoutField);
    input.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:saved?.snapshot}}));
  }));
  const expire=()=>{undoAllowed.current=false;setUndoable(false);};
  useEffect(()=>setDraftEdited(false),[set]);
  useEffect(()=>{
    const target=row();
    // An uncommitted edit may differ even while canonical values still match.
    const edited=event=>{if(event.target.matches('[data-workout-draft]')){pendingDrafts.current=null;setDraftEdited(true);if(liveRecord.current)expire();}};
    target?.addEventListener('input',edited);
    return()=>target?.removeEventListener('input',edited);
  },[set.id]);
  useEffect(()=>{
    if(!record)return;
    const timer=setTimeout(expire,5000);
    return()=>clearTimeout(timer);
  },[record]);
  useEffect(()=>{if(record&&undoAllowed.current&&!canUndoPreviousValues(state,record))expire();},[state,record]);
  useEffect(()=>()=>animations.current.forEach(a=>a.cancel()),[]);
  const acknowledge=operation=>{
    animations.current.forEach(a=>a.cancel());animations.current=[];
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    for(const field of row()?.querySelectorAll('[data-workout-field]')||[]){
      const path=field.dataset.workoutField.split('.'),key=path[0],change=operation.patch.find(p=>p.key===key);
      if(!change)continue;
      const before=path[1]?change.value?.[path[1]]?.reps:change.value;
      const after=path[1]?operation.after[key]?.[path[1]]?.reps:operation.after[key];
      if((before??null)===(after??null))continue;
      for(const value of field.querySelectorAll('input,.stepper-empty-label,.rir-value')){
        if(value.animate)animations.current.push(value.animate([{opacity:.45},{opacity:1}],{duration:160,easing:'ease-out'}));
      }
    }
  };
  const apply=()=>{
    if(liveRecord.current)return;
    setError('');
    const drafts=pendingDrafts.current?.drafts||snapshot();pendingDrafts.current=null;
    let prepared;
    try{
      const result=commit(current=>{
        prepared=preparePreviousValues(current,{sessionId:state.activeWorkout.id,exerciseId:exercise.id,setId:set.id,ordinal:index});
        return prepared.state;
      });
      setDraftEdited(false);
      // Canonical values may already match while a different raw edit is visible.
      // Resolve that UI-only draft without manufacturing a persistence write.
      if(!result.changed&&!drafts.some(entry=>entry.snapshot?.draft!=null))return;
      const unchanged=result.state.activeWorkout.exercises.find(e=>e.id===exercise.id)?.sets.find(s=>s.id===set.id);
      if(!prepared.record&&(!unchanged||unchanged.completed||!previousValuesMatch(unchanged,prior)))return;
      const operation=prepared.record?{...prepared.record,drafts}:{sessionId:state.activeWorkout.id,exerciseId:exercise.id,setId:set.id,ordinal:index,units:state.profile.units,patch:[],after:structuredClone(unchanged),draftOnly:true,drafts};
      liveRecord.current=operation;undoAllowed.current=true;
      restoreDrafts(null);
      focusAfterAction.current=true;setRecord(operation);setUndoable(true);acknowledge(operation);
    }catch(e){setError(e.message);}
  };
  const undo=()=>{
    const operation=liveRecord.current;
    if(!undoAllowed.current||!canUndoPreviousValues(latest.current,operation)){expire();return;}
    try{
      if(!operation.draftOnly){
        const result=commit(current=>undoPreviousValues(current,operation));
        if(!result.changed){expire();return;}
      }
      liveRecord.current=null;undoAllowed.current=false;
      restoreDrafts(operation.drafts);setDraftEdited(operation.drafts.some(entry=>entry.snapshot?.draft!=null));focusAfterAction.current=true;setRecord(null);setUndoable(false);setError('');acknowledge(operation);
    }catch(e){setError(e.message);}
  };
  const matches=!draftEdited&&previousValuesMatch(set,prior);
  return <div ref={helper} className="freestyle-copy-helper">
    <Disclosure open={!record} collapsed={<div className="freestyle-copy-applied" role="status" tabIndex={-1}><span><span aria-hidden="true">✓ </span>Previous values applied</span>{undoable&&<button type="button" className="text-button" data-workout-replaces={JSON.stringify({sets:[set.id]})} onClick={undo}>Undo</button>}</div>}>
      <button type="button" className="freestyle-copy" data-workout-replaces={JSON.stringify({sets:[set.id]})} disabled={matches} onPointerDown={()=>{pendingDrafts.current={drafts:snapshot()};}} onPointerCancel={()=>{pendingDrafts.current=null;}} onKeyDown={()=>{pendingDrafts.current=null;}} onClick={apply}>
        <span>Previous workout · set {index+1}<strong>{label}</strong></span><span>{matches?'VALUES MATCH':'USE VALUES'}</span>
      </button>
    </Disclosure>
    {error&&<p className="freestyle-copy-error" role="alert">{error}</p>}
  </div>;
}
