import { useLayoutEffect, useRef, useState } from 'react';
import './disclosure.css';

// Keep the last expanded render through collapse, including lazy picker data.
// Animate the outer measured height, not nested fractional grid tracks.
export function Disclosure({open, children, id, revealOnOpen = false}) {
  const [retained,setRetained]=useState(open?children:null);
  const root=useRef(null),content=useRef(null),initialized=useRef(false);
  useLayoutEffect(()=>{if(open)setRetained(children);},[open,children]);
  useLayoutEffect(()=>{
    const node=root.current,inner=content.current,media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let geometry,fade,target=-1,disposed=false;
    const settle=()=>{if(disposed)return;geometry?.cancel();fade?.cancel();geometry=null;node.style.height=open?'auto':'0px';node.style.opacity=open?'1':'.7';if(!open)setRetained(null);
      if(open && revealOnOpen) requestAnimationFrame(()=>{if(!disposed)revealDisclosure(node);});
    };
    const run=()=>{
      if(disposed)return;
      const next=open?inner.getBoundingClientRect().height:0;
      if(next===target)return;
      const from=node.getBoundingClientRect().height,opacity=getComputedStyle(node).opacity;
      target=next;geometry?.cancel();fade?.cancel();
      node.style.height=`${next}px`;node.style.opacity=open?'1':'.7';
      if(!initialized.current||media?.matches||!node.animate||Math.abs(from-next)<.5){settle();return;}
      geometry=node.animate([{height:`${from}px`},{height:`${next}px`}],{duration:200,easing:'cubic-bezier(.2,0,0,1)'});
      fade=node.animate([{opacity},{opacity:open?1:.7}],{duration:160,easing:'ease-out'});
      geometry.onfinish=settle;
    };
    run();initialized.current=true;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(open&&geometry)run();});observer?.observe(inner);
    const reduce=()=>{if(media.matches)settle();};media?.addEventListener?.('change',reduce);
    return()=>{
      disposed=true;observer?.disconnect();media?.removeEventListener?.('change',reduce);
      // Preserve the in-flight frame before cancellation when taps reverse direction.
      const height=node.getBoundingClientRect().height,opacity=getComputedStyle(node).opacity;
      geometry?.cancel();fade?.cancel();node.style.height=`${height}px`;node.style.opacity=opacity;
    };
  },[open,revealOnOpen]);
  return <div ref={root} id={id} className={`rook-disclosure${open?' is-open':''}`} aria-hidden={!open} inert={!open?'':undefined}>
    <div ref={content} className="rook-disclosure-content">{open?children:retained}</div>
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
