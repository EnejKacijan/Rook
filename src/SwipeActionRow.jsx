import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bindSwipeRowActions, registerSwipeRemoval, SWIPE_ROW } from './swipeRowAction.js';
import {flushSync} from 'react-dom';
import './swipeActionRow.css';
import {prepareSwipeRowExit,clearSwipeRowExits} from './swipeRowExit.js';

export function useSwipeActionList(ref, enabled=true, options={}) {
  const latest=useRef(options);latest.current=options;
  const binding=useRef(null);
  // Empty freestyle/editor states can mount the list later. Rebind only when
  // its DOM owner changes, never on the workout clock's normal rerenders.
  useLayoutEffect(()=>{
    const node=enabled?ref.current:null;
    if(binding.current?.node===node)return;
    binding.current?.release();
    binding.current=node?{node,release:bindSwipeRowActions(node,{mode:options.mode,onAdd:id=>latest.current.onAdd?.(id),feedback:options.feedback})}:null;
  });
  useEffect(()=>()=>{binding.current?.release();binding.current=null;},[]);
}

export function SwipeActionRow({as:Tag='div',enabled=true,onRemove,beforeRemove,removeLabel='Remove exercise',children,className='',...props}) {
  const ref=useRef(null),latest=useRef(null);
  latest.current={onRemove,beforeRemove,enabled};
  const remove=()=>{
    const row=ref.current;
    if(!row || !latest.current.enabled || latest.current.beforeRemove?.()===false)return false;
    const showExit=prepareSwipeRowExit(row);
    let result;
    // Active-workout handlers save before publishing; editor handlers modify
    // only their draft. The presence animation begins after that boundary.
    flushSync(()=>{result=latest.current.onRemove();});
    if(result===false)return false;
    showExit();
    return true;
  };
  useLayoutEffect(()=>registerSwipeRemoval(ref.current,()=>remove()),[]);
  return <Tag {...props} style={{...props.style,'--swipe-settle-duration':`${SWIPE_ROW.cancelDuration}ms`}} ref={ref} className={`swipe-action-row ${className}`} data-swipe-row data-swipe-enabled={enabled}>
    {enabled&&<div className="swipe-remove-background" aria-hidden="true">
      <span className="swipe-remove-affordance"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></span>
    </div>}
    <div data-swipe-content>{children}</div>
    {enabled&&<button type="button" className="swipe-remove-fallback visually-hidden" data-swipe-fallback aria-label={removeLabel} onClick={remove}>{removeLabel}</button>}
  </Tag>;
}

/** Existing Today undo surface and five-second lifetime, shared by these lists. */
export function useExerciseRemoveUndo() {
  const [notice,setNotice]=useState(null),timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{if(notice?.valid && !notice.valid()){clearTimeout(timer.current);setNotice(null);}});
  const clear=()=>{clearTimeout(timer.current);setNotice(null);};
  return {show:next=>{clearTimeout(timer.current);setNotice(next);timer.current=setTimeout(()=>setNotice(null),5000);},clear,
    surface:notice&&<aside className="today-undo exercise-remove-undo" role="status" aria-live="polite"><span>{notice.message}</span><button type="button" onClick={()=>{clearSwipeRowExits();notice.undo();clear();}}>Undo</button></aside>};
}
