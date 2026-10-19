import React,{useEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {useDurableAction} from './useDurableAction.js';
import {useExerciseRemoveUndo} from './SwipeActionRow.jsx';
import {previousValuesEligibility,preparePreviousValues,canUndoPreviousValues,undoPreviousValues} from './previousValues.js';

export function PreviousValuesHelper({state,update,exercise,screenRef}) {
  const {commit,latest}=useDurableAction(state,update);
  const [error,setError]=useState(''),[,refreshDrafts]=useState(0);
  const edited=useRef(false),revision=useRef(0),pending=useRef(null),button=useRef(null);
  const undo=useExerciseRemoveUndo({className:'previous-values-snackbar',avoidRef:screenRef});
  const identity={sessionId:state.activeWorkout.id,exerciseId:exercise.id,canonicalExerciseId:exercise.exerciseId,profileId:state.profile.id};
  const inputs=()=>[...screenRef?.current?.querySelectorAll('[data-set-id] [data-workout-draft]')||[]];
  const snapshots=()=>inputs().map(input=>{
    const detail={};input.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));
    return {setId:input.closest('[data-set-id]').dataset.setId,field:input.closest('[data-workout-field]').dataset.workoutField,snapshot:detail.snapshot};
  });
  const hasRawEdits=drafts=>drafts.some(({snapshot:s})=>s?.draft!=null&&s.draft!==String(s.value??''));
  const restore=(drafts,setIds)=>flushSync(()=>inputs().forEach(input=>{
    const setId=input.closest('[data-set-id]').dataset.setId;
    if(!setIds.includes(setId))return;
    const field=input.closest('[data-workout-field]').dataset.workoutField;
    input.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:drafts?.find(s=>s.setId===setId&&s.field===field)?.snapshot}}));
  }));
  useEffect(()=>{
    const screen=screenRef?.current;
    const onInput=event=>{if(event.target.matches('[data-workout-draft]')){edited.current=true;revision.current++;pending.current=null;refreshDrafts(n=>n+1);}};
    screen?.addEventListener('input',onInput);
    return()=>screen?.removeEventListener('input',onInput);
  },[screenRef]);
  const apply=()=>{
    if(edited.current)return;
    const drafts=pending.current||snapshots();pending.current=null;
    if(hasRawEdits(drafts))return;
    try{
      let operation;
      const result=commit(current=>{const prepared=preparePreviousValues(current,identity);operation=prepared.record;return prepared.state;});
      if(!result.changed||!operation)return;
      const setIds=operation.sets.map(s=>s.setId),appliedRevision=revision.current;
      restore(null,setIds);setError('');
      undo.show({message:'Previous values applied',valid:()=>revision.current===appliedRevision&&canUndoPreviousValues(latest.current,operation),undo:()=>{
        if(revision.current!==appliedRevision||!canUndoPreviousValues(latest.current,operation))return;
        try{
          const result=commit(current=>undoPreviousValues(current,operation));
          if(result.changed){restore(drafts,setIds);button.current?.focus({preventScroll:true});}
        }catch(e){setError(e.message);return false;}
      }});
    }catch(e){setError(e.message);}
  };
  const eligible=!edited.current&&previousValuesEligibility(state,identity).length>0;
  return <>
    {eligible&&<button ref={button} type="button" className="text-button previous-values-action"
      data-workout-replaces={JSON.stringify({sets:exercise.sets.map(s=>s.id)})}
      onPointerDown={()=>{pending.current=snapshots();}} onPointerCancel={()=>{pending.current=null;}} onClick={apply}>Use last values</button>}
    {error&&<p className="previous-values-error" role="alert">{error}</p>}
    {undo.surface&&createPortal(undo.surface,document.body)}
  </>;
}
