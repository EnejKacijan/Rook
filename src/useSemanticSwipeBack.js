import {useEffect} from 'react';
import {bindEdgeBack,standaloneNavigation} from './edgeBack.js';
import {pageBackMotion} from './swipePageMotion.js';
const SURFACE = 'main.screen,.screen,.workout-screen,.profile-screen,.onboarding,.coach-history-surface,.supplemental-limits-input';
export function semanticBackSurface(target) {
  if(!(target instanceof Element)||target.closest('.import-plan-screen,.import-resolution,[data-no-edge-back]'))return null;
  const surface=target.closest(SURFACE);
  if(!surface||surface.closest('[inert],[aria-hidden="true"]'))return null;
  // A close-only overlay must never borrow its parent's Back action.
  const layer='[role="dialog"],[role="alertdialog"],[role="menu"],.modal-layer';
  if(target.closest(layer)!==surface.closest(layer))return null;
  const button=[...surface.querySelectorAll('button[aria-label]')].find(node=>
    /^Back(?:\s|$)/i.test(node.getAttribute('aria-label'))&&!node.disabled&&node.getClientRects().length&&
    node.closest(SURFACE)===surface);
  return button?{surface,button}:null;
}
export function useSemanticSwipeBack(){
  useEffect(()=>{
    let selected=null, motion=null;
    const enabled=event=>{
      if(event) { selected=semanticBackSurface(event.target); motion?.clear(); motion=null; }
      return standaloneNavigation()&&!!selected&&selected.surface.isConnected&&selected.button.isConnected&&!selected.button.disabled&&selected.surface.getAttribute('aria-busy')!=='true';
    };
    return bindEdgeBack(document.documentElement,{
      enabled,getBounds:()=>selected.surface.getBoundingClientRect(),
      duration:(gesture,commit)=>motion ? Math.min(200,Math.max(40,200*(commit ? gesture.width-gesture.distance : gesture.distance)/gesture.width)) : 0,
      clear:()=>{motion?.clear();motion=null;},
      render:(x,ms)=>{motion ||= pageBackMotion(selected.surface);motion?.render(x,ms);},
      onBack:()=>{selected.surface.dataset.swipeBackCommitted='true';selected.button.click();},
    });
  },[]);
}
