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
export function UndoSnackbar({notice,onDismiss,className='',avoidRef}) {
  const gesture=useRef(null),surface=useRef(null);
  useLayoutEffect(()=>{
    if(!avoidRef)return;
    const node=surface.current,viewport=window.visualViewport;
    const place=()=>{
      node.style.top='';node.style.bottom='';node.style.visibility='';
      const box=node.getBoundingClientRect(),top=(viewport?.offsetTop||0)+8,bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-8;
      const controls=[...avoidRef.current?.querySelectorAll('.set-row,.sets > button,.workout-primary-action,.freestyle-actions,.rest-timer')||[]]
        .map(control=>control.getBoundingClientRect()).filter(r=>r.bottom>top&&r.top<bottom).sort((a,b)=>a.top-b.top);
      if(box.top>=top&&box.bottom<=bottom&&!controls.some(r=>box.top<r.bottom+8&&box.bottom>r.top-8))return;
      const gaps=[];let cursor=top;
      for(const r of controls){if(r.top-8-cursor>=box.height)gaps.push([cursor,r.top-8]);cursor=Math.max(cursor,r.bottom+8);}
      if(bottom-cursor>=box.height)gaps.push([cursor,bottom]);
      const positions=gaps.map(([start,end])=>Math.max(start,Math.min(box.top,end-box.height))).sort((a,b)=>Math.abs(a-box.top)-Math.abs(b-box.top));
      // A keyboard can leave no clear overlay space. Keep the same transient
      // lifetime while hiding feedback instead of covering logging controls.
      if(!positions.length){node.style.visibility='hidden';return;}
      node.style.top=`${positions[0]}px`;node.style.bottom='auto';
    };
    place();window.addEventListener('scroll',place,true);window.addEventListener('resize',place);
    viewport?.addEventListener('resize',place);viewport?.addEventListener('scroll',place);
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(place):null;
    if(avoidRef.current)observer?.observe(avoidRef.current);
    return()=>{window.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);viewport?.removeEventListener('resize',place);viewport?.removeEventListener('scroll',place);observer?.disconnect();};
  },[avoidRef]);
  const start=event=>{if(!event.target.closest('button')){gesture.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);}};
  const end=event=>{
    const from=gesture.current;gesture.current=null;
    if(from&&Math.abs(event.clientX-from.x)>=48&&Math.abs(event.clientX-from.x)>Math.abs(event.clientY-from.y))onDismiss();
  };
  return <aside ref={surface} className={`today-undo exercise-remove-undo ${className}`} role="status" aria-live="polite"
    onPointerDown={start} onPointerUp={end} onPointerCancel={()=>{gesture.current=null;}}>
    <span>{notice.message}</span><button type="button" onClick={()=>{clearSwipeRowExits();if(notice.undo()!==false)onDismiss();}}>Undo</button>
  </aside>;
}

export function useExerciseRemoveUndo({className='',avoidRef}={}) {
  const [notice,setNotice]=useState(null),timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{if(notice?.valid && !notice.valid()){clearTimeout(timer.current);setNotice(null);}});
  const clear=()=>{clearTimeout(timer.current);setNotice(null);};
  return {show:next=>{clearTimeout(timer.current);setNotice(next);timer.current=setTimeout(()=>setNotice(null),5000);},clear,
    surface:notice&&<UndoSnackbar notice={notice} onDismiss={clear} className={className} avoidRef={avoidRef}/>};
}
