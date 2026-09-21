import {useCallback,useEffect,useLayoutEffect,useRef} from 'react';
import './mainTabTransition.css';

export const MAIN_TAB_ORDER = ['today','coach','progress','profile'];
export function mainTabDirection(from,to) {
  const a=MAIN_TAB_ORDER.indexOf(from),b=MAIN_TAB_ORDER.indexOf(to);
  return a<0||b<0 ? 0 : Math.sign(b-a);
}

// A bounded, inert paint copy, never a second mounted React screen. It lives
// outside app-content so Coach's viewport/body ownership ends on real unmount.
function outgoingPaint(surface,container) {
  if(!surface||surface.querySelectorAll('*').length>800)return null;
  const doc=surface.ownerDocument,win=doc.defaultView;
  const rect=surface.getBoundingClientRect();
  const nav=container.querySelector('.bottom-nav')?.getBoundingClientRect();
  const top=Math.max(0,rect.top),bottom=Math.min(win.innerHeight,rect.bottom,nav?.height ? nav.top : win.innerHeight);
  if(bottom<=top||!rect.width)return null;
  const layer=doc.createElement('div');
  layer.className='main-tab-paint';
  layer.setAttribute('inert','');layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{left:`${rect.left}px`,top:`${top}px`,width:`${rect.width}px`,height:`${bottom-top}px`});
  const copy=surface.cloneNode(true);
  const originals=[surface,...surface.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')];
  const scrolls=originals.map(node=>({top:node.scrollTop,left:node.scrollLeft}));
  copies.forEach((node,index)=>{
    node.removeAttribute('id');node.removeAttribute('name');node.removeAttribute('autofocus');
    // Transcript and nested scrollers retain the exact visible outgoing frame.
    node.scrollTop=scrolls[index].top;node.scrollLeft=scrolls[index].left;
  });
  Object.assign(copy.style,{position:'absolute',inset:'auto',left:'0',top:`${rect.top-top}px`,margin:'0',width:`${rect.width}px`,height:`${rect.height}px`,minHeight:'0',transform:'none'});
  layer.append(copy);
  return {layer,restoreScroll:()=>copies.forEach((node,index)=>{node.scrollTop=scrolls[index].top;node.scrollLeft=scrolls[index].left;})};
}

export function useMainTabTransition(page,contentRef) {
  const current=useRef(page),pending=useRef(null),running=useRef([]),paint=useRef(null),releaseInteraction=useRef(null);
  const cancel=useCallback(()=>{
    pending.current=null;
    running.current.forEach(animation=>animation.cancel());running.current=[];
    paint.current?.remove();paint.current=null;
    releaseInteraction.current?.();releaseInteraction.current=null;
  },[]);
  const prepare=useCallback(next=>{
    const from=current.current;
    if(next===from)return;
    cancel();current.current=next;
    const direction=mainTabDirection(from,next),container=contentRef.current;
    const surface=container?.querySelector(':scope > .screen');
    if(!direction||!surface?.animate)return;
    const snapshot=outgoingPaint(surface,container);
    pending.current={direction,snapshot};
  },[cancel,contentRef]);
  useLayoutEffect(()=>{
    current.current=page;
    const transition=pending.current;pending.current=null;
    const surface=contentRef.current?.querySelector(':scope > .screen');
    if(!transition||!surface?.animate)return;
    const {direction,snapshot}=transition;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const style=getComputedStyle(surface);
    const duration=parseFloat(style.getPropertyValue(reduced?'--rook-motion-tab-reduced':'--rook-motion-tab'))||(reduced?80:160);
    const distance=reduced?0:parseFloat(style.getPropertyValue('--rook-motion-tab-distance'))||6;
    const easing=style.getPropertyValue('--rook-ease-standard').trim()||'cubic-bezier(.2,0,0,1)';
    const options={duration,easing};
    if(snapshot){
      paint.current=snapshot.layer;
      contentRef.current.parentElement.append(snapshot.layer);snapshot.restoreScroll();
      running.current.push(snapshot.layer.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*distance}px)`}],options));
    }
    const incoming=surface.animate([{opacity:0,transform:`translateX(${direction*distance}px)`},{opacity:1,transform:'translateX(0)'}],options);
    running.current.push(incoming);
    // The next interaction owns the live destination immediately, including
    // opening a sheet/subpage. Observe only; never consume its pointer event.
    const container=contentRef.current;
    container.addEventListener('pointerdown',cancel,{capture:true,passive:true,once:true});
    releaseInteraction.current=()=>container.removeEventListener('pointerdown',cancel,true);
    // No fill mode: completion releases transform ownership to normal layout.
    // Identity check keeps a late completion from clearing a newer transition.
    incoming.finished.then(()=>{if(running.current.includes(incoming))cancel();}).catch(()=>{});
  },[page,contentRef,cancel]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change',cancel);
    window.addEventListener('pagehide',cancel);
    return ()=>{cancel();media.removeEventListener('change',cancel);window.removeEventListener('pagehide',cancel);};
  },[cancel]);
  return prepare;
}
