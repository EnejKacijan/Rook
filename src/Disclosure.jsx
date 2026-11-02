import { useLayoutEffect, useRef, useState } from 'react';
import './disclosure.css';
import { followDisclosure } from './disclosureFollow.js';

// Keep the last expanded render through collapse, including lazy picker data.
// Animate the outer measured height, not nested fractional grid tracks.
// A user-opened section moves its scroll container along with the height
// (disclosureFollow.js). revealOnOpen also follows opens without a recent tap.
export function Disclosure({open, children, id, className = '', revealOnOpen = false, collapsed, keepMounted = false, onRest}) {
  const [retained,setRetained]=useState(open?children:null);
  const root=useRef(null),content=useRef(null),compact=useRef(null),initialized=useRef(false);
  const hasCompact=Boolean(collapsed);
  const completion=useRef(onRest);completion.current=onRest;
  useLayoutEffect(()=>{if(open&&!keepMounted)setRetained(children);},[open,children,keepMounted]);
  useLayoutEffect(()=>{
    const node=root.current,inner=content.current,media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let geometry,fade,incoming,follow,followed=false,followInterrupted=false,target=-1,disposed=false;
    const settle=()=>{if(disposed)return;geometry?.cancel();fade?.cancel();incoming?.cancel();geometry=null;follow?.finish();follow=null;node.style.height=open?'auto':`${Math.max(0,target)}px`;node.style.opacity=open||hasCompact?'1':'.7';if(!open&&!keepMounted)setRetained(null);completion.current?.(open);};
    // Content that grows while the section opens keeps the same follow.
    const startFollow=(from,next,animated)=>{if(!open||!initialized.current||followInterrupted)return;follow?.stop();follow=followDisclosure(node,{from,to:next,animated,force:revealOnOpen||followed,onTakeover:()=>{followInterrupted=true;}});followed||=Boolean(follow);};
    const run=()=>{
      if(disposed)return;
      const next=open?inner.getBoundingClientRect().height:compact.current?.getBoundingClientRect().height||0;
      if(next===target)return;
      const from=node.getBoundingClientRect().height,opacity=getComputedStyle(node).opacity;
      target=next;geometry?.cancel();fade?.cancel();incoming?.cancel();
      node.style.height=`${next}px`;node.style.opacity=open||hasCompact?'1':'.7';
      if(!initialized.current||media?.matches||!node.animate||Math.abs(from-next)<.5){settle();startFollow(from,next,false);return;}
      startFollow(from,next,true);
      geometry=node.animate([{height:`${from}px`},{height:`${next}px`}],{duration:200,easing:'cubic-bezier(.2,0,0,1)'});
      fade=(hasCompact?inner:node).animate([{opacity:hasCompact?open?0:1:opacity},{opacity:open?1:hasCompact?0:.7}],{duration:160,easing:'ease-out',fill:'both'});
      if(!open&&compact.current)incoming=compact.current.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
      geometry.onfinish=settle;
    };
    run();initialized.current=true;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(open&&geometry||!open&&hasCompact)run();});observer?.observe(inner);if(compact.current)observer?.observe(compact.current);
    const reduce=()=>{if(media.matches)settle();};media?.addEventListener?.('change',reduce);
    return()=>{
      disposed=true;observer?.disconnect();media?.removeEventListener?.('change',reduce);
      // Preserve the in-flight frame before cancellation when taps reverse direction.
      const height=node.getBoundingClientRect().height,opacity=getComputedStyle(node).opacity;
      follow?.stop();geometry?.cancel();fade?.cancel();incoming?.cancel();node.style.height=`${height}px`;node.style.opacity=opacity;
    };
  },[open,revealOnOpen,hasCompact,keepMounted]);
  return <div ref={root} id={id} className={`rook-disclosure${open?' is-open':''}${hasCompact?' has-compact-content':''}${className?` ${className}`:''}`} aria-hidden={!open&&!hasCompact} inert={!open&&!hasCompact?'':undefined}>
    <div ref={content} className="rook-disclosure-content" aria-hidden={!open&&hasCompact||undefined} inert={!open&&hasCompact?'':undefined}>{open||keepMounted?children:retained}</div>
    {!open&&collapsed&&<div ref={compact} className="rook-disclosure-compact">{collapsed}</div>}
  </div>;
}
