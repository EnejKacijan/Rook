import {useCallback,useEffect,useLayoutEffect,useRef} from 'react';
import {MAIN_TAB_ORDER} from './mainTabTransition.js';

// Feedback follows committed selection, never owns navigation or its timing.
// Only the icon paints at a different scale; the button and nav keep their boxes.
export function useBottomNavFeedback(page,navRef) {
  const previous=useRef(page),running=useRef(null);
  const cancel=useCallback(()=>{running.current?.cancel();running.current=null;},[]);
  useLayoutEffect(()=>{
    const from=previous.current;previous.current=page;
    if(from===page)return;
    cancel();
    if(!MAIN_TAB_ORDER.includes(from)||!MAIN_TAB_ORDER.includes(page)||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const icon=navRef.current?.querySelector('[aria-current="page"] .nav-icon');
    if(!icon?.animate)return;
    const style=getComputedStyle(icon);
    const easing=style.getPropertyValue('--rook-ease-standard').trim()||'cubic-bezier(.2,0,0,1)';
    const duration=parseFloat(style.getPropertyValue('--rook-motion-nav-select'))||180;
    const animation=icon.animate([
      {transform:'scale(.96)',offset:0,easing},
      {transform:'scale(1.07)',offset:.4,easing},
      {transform:'scale(1)',offset:1},
    ],{duration,easing:'linear'});
    running.current=animation;
    // No fill: normal CSS owns the settled state. A stale finish cannot cancel
    // the newer icon during rapid switching.
    animation.finished.then(()=>{if(running.current===animation)cancel();}).catch(()=>{});
  },[page,navRef,cancel]);
  useEffect(()=>{
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener('change',cancel);
    window.addEventListener('pagehide',cancel);window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',cancel);
    return ()=>{cancel();media?.removeEventListener('change',cancel);window.removeEventListener('pagehide',cancel);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel);};
  },[cancel]);
  return cancel;
}
