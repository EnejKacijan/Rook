import { useLayoutEffect, useRef, useState } from 'react';
import './disclosure.css';

// Keep the last expanded render through collapse, including lazy picker data.
// Animate the outer measured height, not nested fractional grid tracks.
export function Disclosure({open, children, id, revealOnOpen = false, collapsed}) {
  const [retained,setRetained]=useState(open?children:null);
  const root=useRef(null),content=useRef(null),compact=useRef(null),initialized=useRef(false);
  const hasCompact=Boolean(collapsed);
  useLayoutEffect(()=>{if(open)setRetained(children);},[open,children]);
  useLayoutEffect(()=>{
    const node=root.current,inner=content.current,media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let geometry,fade,incoming,target=-1,disposed=false;
    const settle=()=>{if(disposed)return;geometry?.cancel();fade?.cancel();incoming?.cancel();geometry=null;node.style.height=open?'auto':`${Math.max(0,target)}px`;node.style.opacity=open||hasCompact?'1':'.7';if(!open)setRetained(null);
      if(open && revealOnOpen) requestAnimationFrame(()=>{if(!disposed)revealDisclosure(node);});
    };
    const run=()=>{
      if(disposed)return;
      const next=open?inner.getBoundingClientRect().height:compact.current?.getBoundingClientRect().height||0;
      if(next===target)return;
      const from=node.getBoundingClientRect().height,opacity=getComputedStyle(node).opacity;
      target=next;geometry?.cancel();fade?.cancel();incoming?.cancel();
      node.style.height=`${next}px`;node.style.opacity=open||hasCompact?'1':'.7';
      if(!initialized.current||media?.matches||!node.animate||Math.abs(from-next)<.5){settle();return;}
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
      geometry?.cancel();fade?.cancel();incoming?.cancel();node.style.height=`${height}px`;node.style.opacity=opacity;
    };
  },[open,revealOnOpen,hasCompact]);
  return <div ref={root} id={id} className={`rook-disclosure${open?' is-open':''}${hasCompact?' has-compact-content':''}`} aria-hidden={!open&&!hasCompact} inert={!open&&!hasCompact?'':undefined}>
    <div ref={content} className="rook-disclosure-content" aria-hidden={!open&&hasCompact||undefined} inert={!open&&hasCompact?'':undefined}>{open?children:retained}</div>
    {!open&&collapsed&&<div ref={compact} className="rook-disclosure-compact">{collapsed}</div>}
  </div>;
}

export function revealDisclosure(node) {
  let scroller = node.parentElement;
  while(scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller=scroller.parentElement;
  const pageScroll=!scroller;
  scroller ||= document.scrollingElement;
  if(!scroller)return;
  const viewport=pageScroll?{top:0,bottom:window.innerHeight}:scroller.getBoundingClientRect(),bounds=node.getBoundingClientRect();
  const footer=scroller.querySelector('.sheet-action-footer');
  const bottom=Math.min(viewport.bottom,window.visualViewport?.height || window.innerHeight,footer?.getBoundingClientRect().top ?? Infinity)-12;
  const header=scroller.querySelector('.detail-header');
  const top=Math.max(viewport.top,0,header?.getBoundingClientRect().bottom ?? 0)+12;
  const delta=bounds.height>bottom-top ? bounds.top-top : bounds.bottom>bottom ? Math.min(bounds.bottom-bottom,bounds.top-top) : bounds.top<top ? bounds.top-top : 0;
  if(delta)scroller.scrollBy({top:delta,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
