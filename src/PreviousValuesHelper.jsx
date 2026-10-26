import React,{useEffect,useLayoutEffect,useImperativeHandle,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {createPortal} from 'react-dom';
import {Snackbar} from './TransientSnackbar.jsx';
import {previousValuesHintId,previousValuesHint,updatePreviousValuesHint} from './previousValuesHints.js';
import {useDurableAction} from './useDurableAction.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesMatch,previousValuesFutureChanges} from './previousValues.js';
import {loggingModeOf} from './advancedLogging.js';
import {previousWorkingSetValues,freestylePreviousSets} from './freestyleWorkout.js';
import {exerciseName,exerciseMeasure} from './domain.js';

export function PreviousValuesHelper({state,update,exercise,set,prior,index,ordinal=index,label,screenRef,controllerRef,autoOffer=false,Modal,Header}) {
  const {commit,latest}=useDurableAction(state,update);
  const [record,setRecord]=useState(null),[undoable,setUndoable]=useState(false),[error,setError]=useState(''),[draftEdited,setDraftEdited]=useState(false);
  const [expiring,setExpiring]=useState(false);
  const liveRecord=useRef(null),pendingDrafts=useRef(null),animations=useRef([]),undoAllowed=useRef(false);
  const helper=useRef(null),focusAfterAction=useRef(false),manualTrigger=useRef(null),lifetime=useRef(null);
  const identity=previousValuesHintId(state,exercise);
  const [hint,setHint]=useState(()=>previousValuesHint(identity)),[manualOpen,setManualOpen]=useState(false),[manualHasDraft,setManualHasDraft]=useState(false);
  const consume=()=>setHint(updatePreviousValuesHint(identity,{dismissed:true}));
  const reuseIdentity={sessionId:state.activeWorkout.id,exerciseId:exercise.id,catalogExerciseId:exercise.exerciseId,profileId:state.profile.id,loggingMode:loggingModeOf(exercise),setId:set.id,ordinal};
  const expectedHistory=JSON.stringify(freestylePreviousSets(state,exercise));
  const currentMatches=!draftEdited&&previousValuesMatch(set,prior,exercise);
  const futureChanges=previousValuesFutureChanges(state,reuseIdentity);
  const copyCount=Number(!currentMatches)+futureChanges.length;
  const matches=currentMatches&&!futureChanges.length;
  const showOffer=autoOffer&&!hint.dismissed&&(!hint.setId||hint.setId===set.id)&&!set.touched&&!draftEdited&&!matches&&!record;
  useEffect(()=>{if(showOffer&&!hint.setId)setHint(updatePreviousValuesHint(identity,{setId:set.id}));},[showOffer,identity,set.id,hint.setId]);
  const supported = previousWorkingSetValues(exercise,prior);
  const fields = [...['weight','reps'].filter(key=>Object.hasOwn(supported,key)),
    ...Object.entries(supported.sides || {}).filter(([,values])=>Object.hasOwn(values,'reps')).map(([side])=>`sides.${side}`)];
  const scope = JSON.stringify({sets:[set.id],fields});
  useLayoutEffect(()=>{if(focusAfterAction.current){
    const target=record?helper.current?.querySelector('.previous-values-undo button'):screenRef.current?.querySelector('.exercise-options-button');
    target?.focus({preventScroll:true});focusAfterAction.current=false;
  }},[record]);
  const row=()=>[...screenRef?.current?.querySelectorAll('[data-set-id]')||[]].find(node=>node.dataset.setId===set.id);
  const inputs=()=>[...row()?.querySelectorAll('[data-workout-draft]')||[]];
  const snapshot=()=>inputs().filter(input=>fields.includes(input.closest('[data-workout-field]').dataset.workoutField)).map(input=>{
    const detail={};input.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));
    return {field:input.closest('[data-workout-field]').dataset.workoutField,snapshot:detail.snapshot};
  });
  const futureDraftFields=()=>[...screenRef?.current?.querySelectorAll('[data-workout-draft]')||[]].flatMap(input=>{
    const setId=input.closest('[data-set-id]')?.dataset.setId;
    if(setId===set.id||!exercise.sets.some(item=>item.id===setId))return [];
    const detail={};input.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));
    return detail.snapshot?.draft!=null?[{setId,field:input.closest('[data-workout-field]').dataset.workoutField}]:[];
  });
  const restoreDrafts=drafts=>flushSync(()=>inputs().filter(input=>fields.includes(input.closest('[data-workout-field]').dataset.workoutField)).forEach(input=>{
    const saved=drafts?.find(entry=>entry.field===input.closest('[data-workout-field]').dataset.workoutField);
    input.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:saved?.snapshot}}));
  }));
  const expire=()=>{undoAllowed.current=false;liveRecord.current=null;setUndoable(false);setRecord(null);setExpiring(false);};
  useImperativeHandle(controllerRef,()=>({identity:JSON.stringify([identity,set.id,index,loggingModeOf(exercise)]),available:()=>!matches||snapshot().some(entry=>entry.snapshot?.draft!=null),open:()=>{
    const hasDraft=snapshot().some(entry=>entry.snapshot?.draft!=null);
    if(matches&&!hasDraft)return false;
    expire();manualTrigger.current=screenRef.current?.querySelector('.exercise-options-button');setError('');setManualHasDraft(hasDraft);setManualOpen(true);return true;
  }}));
  useEffect(()=>setDraftEdited(false),[set]);
  useEffect(()=>{
    const target=screenRef.current;
    const edited=event=>{
      if(!event.target.matches('[data-workout-draft]'))return;
      const id=event.target.closest('[data-set-id]')?.dataset.setId;
      if(!exercise.sets.some(item=>item.id===id))return;
      consume();
      // Even re-entering the same number is a new manual decision. Do not let
      // a stale Undo overwrite it merely because the canonical value matches.
      if(liveRecord.current?.future?.some(change=>change.setId===id))expire();
      if(id===set.id){pendingDrafts.current=null;setDraftEdited(true);if(liveRecord.current)expire();}
    };
    target?.addEventListener('input',edited);
    return()=>target?.removeEventListener('input',edited);
  },[set.id]);
  useEffect(()=>{
    if(!record||!undoable)return;
    let timer=null,remaining=8000,startedAt;
    const owners=new Set();
    const pause=owner=>{owners.add(owner);if(timer!==null){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(Date.now()-startedAt));}};
    const resume=owner=>{owners.delete(owner);if(timer!==null||owners.size)return;startedAt=Date.now();timer=setTimeout(()=>{timer=null;setExpiring(true);},remaining);};
    lifetime.current={pause,resume};
    const visible=()=>document.visibilityState==='hidden'?pause('hidden'):resume('hidden');
    if(helper.current?.contains(document.activeElement))pause('interaction');
    document.addEventListener('visibilitychange',visible);visible();
    const viewport=window.visualViewport;
    const measure=()=>helper.current?.style.setProperty('--previous-values-keyboard-inset',`${viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop)+8:8}px`);
    viewport?.addEventListener('resize',measure);viewport?.addEventListener('scroll',measure);measure();
    return()=>{clearTimeout(timer);lifetime.current=null;document.removeEventListener('visibilitychange',visible);viewport?.removeEventListener('resize',measure);viewport?.removeEventListener('scroll',measure);};
  },[record,undoable]);
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
    if(liveRecord.current&&undoAllowed.current)return false;
    setError('');
    const drafts=pendingDrafts.current?.drafts||snapshot();
    const protectedFields=pendingDrafts.current?.protectedFields||futureDraftFields();pendingDrafts.current=null;
    let prepared;
    try{
      const result=commit(current=>{
        prepared=preparePreviousValues(current,reuseIdentity,{remaining:true,protectedFields,expectedHistory});
        return prepared.state;
      });
      setDraftEdited(false);
      // Canonical values may already match while a different raw edit is visible.
      // Resolve that UI-only draft without manufacturing a persistence write.
      if(!result.changed&&!drafts.some(entry=>entry.snapshot?.draft!=null))return;
      const liveExercise=result.state.activeWorkout?.exercises.find(e=>e.id===exercise.id);
      if(result.state.profile.id!==state.profile.id || liveExercise?.exerciseId!==exercise.exerciseId)return;
      const unchanged=liveExercise.sets.find(s=>s.id===set.id);
      if(!prepared.record&&(!unchanged||unchanged.completed||!previousValuesMatch(unchanged,prior,exercise)))return;
      const operation=prepared.record?{...prepared.record,drafts}:{sessionId:state.activeWorkout.id,exerciseId:exercise.id,catalogExerciseId:exercise.exerciseId,profileId:state.profile.id,loggingMode:loggingModeOf(exercise),setId:set.id,ordinal:index,units:state.profile.units,patch:[],after:structuredClone(unchanged),draftOnly:true,drafts};
      liveRecord.current=operation;undoAllowed.current=true;setExpiring(false);
      restoreDrafts(null);
      consume();focusAfterAction.current=!manualOpen&&helper.current?.contains(document.activeElement);setRecord(operation);setUndoable(true);acknowledge(operation);return true;
    }catch(e){setError(e.message);return false;}
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
    }catch(e){setError(e.message);return false;}
  };
  const appliedCount=record?Number(record.patch.length>0)+(record.future?.length||0):0;
  const source=<span className="previous-values-source"><small>{copyCount>1?'Previous workout':`Previous workout · set ${ordinal+1}`}</small><strong>{copyCount>1?`Set ${ordinal+1} · `:''}{label}</strong></span>;
  const useButton=(manual=false,dismissManual)=><button type="button" className={manual?'button primary previous-values-apply':'freestyle-copy'} data-workout-replaces={scope} disabled={matches&&!(manual&&manualHasDraft)}
    onPointerDown={event=>{pendingDrafts.current={drafts:snapshot(),protectedFields:futureDraftFields()};if(!manual)event.preventDefault();}} onPointerCancel={()=>{pendingDrafts.current=null;}} onKeyDown={()=>{pendingDrafts.current={drafts:snapshot(),protectedFields:futureDraftFields()};}}
    onClick={()=>{if(apply()&&manual)dismissManual();}}>Use for {Math.max(1,copyCount)} {copyCount>1?'sets':'set'}</button>;
  return <div ref={helper} className="freestyle-copy-helper">
    {showOffer&&<div className="previous-values-offer">{source}{useButton()}<button type="button" className="previous-values-hide" aria-label="Hide previous values for this exercise" data-workout-options onPointerDown={event=>event.preventDefault()} onClick={consume}>×</button></div>}
    {record&&undoable&&<Snackbar message={record.future?.length?`Previous values added to ${appliedCount} ${appliedCount===1?'set':'sets'}`:'Previous values applied'} onUndo={undo} undoScope={scope} autoDismiss={expiring} className="previous-values-undo" onDismiss={expire} onPause={()=>lifetime.current?.pause('interaction')} onResume={()=>lifetime.current?.resume('interaction')}/>}
    {error&&!manualOpen&&<p className="freestyle-copy-error" role="alert">{error}</p>}
    {manualOpen&&Modal&&Header&&createPortal(<Modal close={()=>setManualOpen(false)} backgroundRef={screenRef} returnFocusRef={manualTrigger}>
      {requestClose => <section className="screen detail-screen previous-values-sheet" role="dialog" aria-modal="true" aria-labelledby="previous-values-title">
        <Header title="Previous values" onClose={requestClose}/>
        <h1 id="previous-values-title">Use previous values</h1>
        <p>{exerciseName(exercise)} · Set {index+1}</p>
        <div className="previous-values-source-card">{source}</div>
        <section className="previous-values-current"><h2>Current set {index+1}</h2>{inputs().filter(input=>fields.includes(input.closest('[data-workout-field]').dataset.workoutField)).map(input=>{
          const field=input.closest('[data-workout-field]').dataset.workoutField;
          return <div key={field}><span>{field==='weight'?state.profile.units:field==='reps'?(exerciseMeasure(exercise)==='seconds'?'Seconds':'Reps'):field==='sides.left'?'Left reps':'Right reps'}</span><strong>{input.value||'Not entered'}</strong></div>;
        })}</section>
        <p>Available previous values replace this set’s entries. Each following unlogged set uses its matching previous values; your manual entries stay unchanged.</p>
        {error&&<p className="form-error" role="alert">{error}</p>}
        {useButton(true,requestClose)}<button type="button" className="button quiet" onClick={requestClose}>Cancel</button>
      </section>}
    </Modal>,document.body)}
  </div>;
}
