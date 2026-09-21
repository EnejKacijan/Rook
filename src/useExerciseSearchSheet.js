import { useLayoutEffect } from 'react';
import { bindSheetVisibleViewport, observeVisibleViewport } from './sheetVisibleViewport.js';
import './exerciseSearchSheet.css';

/** Only the modal exercise-search states opt into a stable expanded surface. */
export function useExerciseSearchSheet(ref, enabled = true, { focusedSearch = false, browsing = true } = {}) {
  useLayoutEffect(() => {
    const screen = ref.current;
    if (!screen || !enabled) return;
    screen.classList.add('exercise-search-sheet');
    const release = bindSheetVisibleViewport(screen);
    return () => { release(); screen.classList.remove('exercise-search-sheet'); };
  }, [ref, enabled]);
  useLayoutEffect(() => {
    const screen=ref.current;
    if(!screen||!enabled||!focusedSearch||!browsing)return;
    screen.classList.add('is-search-browsing');
    const releaseFocus=bindExerciseSearchFocus(screen),releaseScroll=bindSearchScrollBoundary(screen);
    return()=>{releaseFocus();releaseScroll();screen.classList.remove('is-search-browsing');};
  },[ref,enabled,focusedSearch,browsing]);
}

/** Opt-in picker chrome only. No input replacement, query state or search work. */
export function bindExerciseSearchFocus(screen) {
  const input = screen.querySelector('.rook-search-field > input[type="search"]');
  if (!input) return () => {};
  const field = input.parentElement;
  let focused = false, blurFrame = null;
  let keyboard = false;
  const update = next => {
    if (focused === next) return;
    focused = next;
    screen.classList.toggle('is-search-focused', next);
  };
  const enter = () => { cancelAnimationFrame(blurFrame); update(true); };
  const leave = event => {
    if (field.contains(event.relatedTarget)) return; // Clear is still searching.
    cancelAnimationFrame(blurFrame);
    blurFrame = requestAnimationFrame(() => { if (!keyboard&&!field.contains(document.activeElement)) update(false); });
  };
  const viewportChanged = ({keyboardOpen: next}) => {
    if (keyboard && !next) update(false);
    if (next) update(true);
    keyboard = next;
  };
  input.addEventListener('focus', enter);
  // A press must land on the input before chrome moves. Pointerdown expansion
  // would move a result under the finger and could turn Search into Preview.
  input.addEventListener('click', enter); // Re-enter after keyboard Done.
  input.addEventListener('blur', leave);
  const releaseViewport = observeVisibleViewport(viewportChanged);
  if(field.contains(document.activeElement))enter();
  return () => {
    cancelAnimationFrame(blurFrame);
    input.removeEventListener('focus', enter);
    input.removeEventListener('click', enter);
    input.removeEventListener('blur', leave);
    releaseViewport();
    screen.classList.remove('is-search-focused');
  };
}

// Contain only vertical boundary gestures in the opted-in keyboard browser.
// Native input selection, pinch zoom, horizontal row actions and the explicit
// drag handle keep their owners. This never scrolls the document or the panel.
export function bindSearchScrollBoundary(screen) {
  let gesture=null;
  const start=event=>{
    gesture=null;
    if(!screen.hasAttribute('data-sheet-keyboard-open')||event.touches.length!==1||screen.inert)return;
    if(event.target.closest('input,textarea,select,[contenteditable="true"],.modal-drag-handle,.sheet-grab-zone'))return;
    const point=event.touches[0];
    gesture={x:point.clientX,y:point.clientY,lastY:point.clientY,list:event.target.closest('[data-exercise-search-scroll]'),axis:null};
  };
  const move=event=>{
    if(!gesture)return;
    if(event.touches.length!==1){gesture=null;return;}
    const point=event.touches[0],dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
    if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=7)gesture.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
    const step=point.clientY-gesture.lastY;gesture.lastY=point.clientY;
    if(gesture.axis!=='y')return;
    const list=gesture.list;
    if((!list||step>0&&list.scrollTop<=0||step<0&&list.scrollTop+list.clientHeight>=list.scrollHeight-1)&&event.cancelable)event.preventDefault();
  };
  const end=()=>{gesture=null;};
  screen.addEventListener('touchstart',start,{passive:true});screen.addEventListener('touchmove',move,{passive:false});screen.addEventListener('touchend',end);screen.addEventListener('touchcancel',end);
  return()=>{screen.removeEventListener('touchstart',start);screen.removeEventListener('touchmove',move);screen.removeEventListener('touchend',end);screen.removeEventListener('touchcancel',end);};
}
