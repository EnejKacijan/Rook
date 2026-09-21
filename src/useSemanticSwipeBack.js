import {useEffect} from 'react';
import {bindEdgeBack,standaloneNavigation} from './edgeBack.js';
import {pageBackMotion} from './swipePageMotion.js';
const SURFACE = 'main.screen,.screen,.workout-screen,.profile-screen,.onboarding,.coach-history-surface,.coach-content-surface,.supplemental-limits-input,.import-resolution,.combine-review-surface';
function workoutOverlayOpen(surface) {
  return surface.hasAttribute('data-active-workout') && [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[role="tooltip"],.modal-layer')].some(layer=>!layer.closest('[inert],[aria-hidden="true"],[hidden]')&&layer.getClientRects().length);
}
function firstRunOverlayOpen(surface) {
  const page = surface?.closest('.first-run-page');
  return !!page && [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],.modal-layer')].some(layer =>
    !layer.contains(surface) && !layer.closest('[hidden],[inert],[aria-hidden="true"]') && layer.getClientRects().length);
}
export function semanticBackSurface(target) {
  if(!(target instanceof Element)||target.closest('[data-no-edge-back]'))return null;
  let surface=target.closest(SURFACE),edgeSurface=surface;
  if(!surface||surface.closest('[inert],[aria-hidden="true"]'))return null;
  const importScreen=target.closest('.import-plan-screen');
  if(importScreen){
    const decision=importScreen.querySelector('.import-resolution[data-import-step-back="true"]');
    // The visible screen owns its padded left edge, not the inset decision
    // content. Delegate only to its active wizard's existing Back button.
    // This includes Step 1's existing return-to-notes path, never compose/Close.
    if(decision) {
      if(surface!==importScreen&&surface!==decision)return null;
      surface=decision;edgeSurface=importScreen;
    } else if (!importScreen.closest('[data-first-run-page="import"]') || surface!==importScreen) return null;
  }else if(surface.matches('.import-resolution'))return null;
  if(surface.closest('[inert],[aria-hidden="true"]')||workoutOverlayOpen(surface)||firstRunOverlayOpen(surface))return null;
  // A close-only overlay must never borrow its parent's Back action.
  const layer='[role="dialog"],[role="alertdialog"],[role="menu"],.modal-layer';
  if(target.closest(layer)!==surface.closest(layer))return null;
  const button=[...surface.querySelectorAll('button[aria-label]')].find(node=>
    (/^Back(?:\s|$)/i.test(node.getAttribute('aria-label')) ||
      surface.matches('.restore-backup-screen') && surface.closest('[data-first-run-page="restore"]') && node.getAttribute('aria-label')==='Close Restore backup')&&!node.disabled&&node.getClientRects().length&&
    node.closest(SURFACE)===surface);
  return button?{surface,button,edgeSurface}:null;
}
export function useSemanticSwipeBack(){
  useEffect(()=>{
    let selected=null, motion=null, pointerBlocked=false;
    const pointerStart=event=>{
      if(event.pointerType==='touch')pointerBlocked=firstRunOverlayOpen(event.target.closest?.(SURFACE));
    };
    const enabled=event=>{
      if(event) { selected=pointerBlocked?null:semanticBackSurface(event.target); pointerBlocked=false; motion?.clear(); motion=null; }
      return standaloneNavigation()&&!!selected&&selected.surface.isConnected&&selected.button.isConnected&&!selected.button.disabled&&selected.surface.getAttribute('aria-busy')!=='true'&&!selected.surface.closest('[inert],[aria-hidden="true"]')&&!workoutOverlayOpen(selected.surface)&&!firstRunOverlayOpen(selected.surface);
    };
    document.addEventListener('pointerdown',pointerStart,true);
    const dispose=bindEdgeBack(document.documentElement,{
      enabled,allowFocusedInput:input=>selected?.surface.hasAttribute('data-active-workout')&&selected.surface.contains(input),getBounds:()=>selected.edgeSurface.getBoundingClientRect(),
      duration:(gesture,commit)=>motion ? Math.min(200,Math.max(40,200*(commit ? gesture.width-gesture.distance : gesture.distance)/gesture.width)) : 0,
      clear:()=>{motion?.clear();motion=null;},
      render:(x,ms)=>{motion ||= pageBackMotion(selected.surface);motion?.render(x,ms);},
      onBack:()=>{selected.surface.dataset.swipeBackCommitted='true';selected.button.click();},
    });
    return()=>{document.removeEventListener('pointerdown',pointerStart,true);dispose();};
  },[]);
}
