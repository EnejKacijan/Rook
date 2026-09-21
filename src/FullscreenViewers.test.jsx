import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExerciseVisualViewer, ModalLayer, PrivateWorkoutPhotoViewer } from './App.jsx';
import { exportWorkoutPhoto } from './exportWorkoutPhoto.js';
vi.mock('./exportWorkoutPhoto.js', () => ({ workoutPhotoFile: (blob) => new File([blob], 'private.jpg', { type: 'image/jpeg' }), exportWorkoutPhoto: vi.fn(async () => 'downloaded') }));
let host, root, closes, view, remove, now, rerender;
const query = selector => document.querySelector(selector);
const click = node => act(() => node.click());
const advance = ms => act(() => { now+=ms;vi.advanceTimersByTime(ms); });
const touch = (type,y,{x=150,count=1,target=query('.exercise-visual-stage')||query('.workout-photo-viewer-panel')}={}) => act(() => {
  const point={identifier:1,clientX:x,clientY:y};const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point,...Array.from({length:count-1},(_,i)=>({...point,identifier:i+2}))]},changedTouches:{value:[point]}});target.dispatchEvent(event);
});
function drag(distance=250,ms=400) { touch('touchstart',170);advance(ms);touch('touchmove',170+distance);touch('touchend',170+distance); }
function mount(kind='exercise',instantClose=false,strict=false) {
  function Harness() {
    const [open,setOpen]=useState(false),[revision,setRevision]=useState(0);rerender=()=>setRevision(n=>n+1);
    const background=useRef(null),trigger=useRef(null);
    const close=()=>{closes();setOpen(false);};
    return <><main ref={background}><button ref={trigger} onClick={()=>setOpen(true)}>Open viewer</button><span>{revision}</span></main>
      {open&&(kind==='exercise'?<ModalLayer presentation="fullscreen" backgroundRef={background} returnFocusRef={trigger} close={close} instantClose={instantClose}><ExerciseVisualViewer exercise={{exerciseId:'leg-press'}}/></ModalLayer>:
        <PrivateWorkoutPhotoViewer returnFocusRef={trigger} photoUrl="blob:synthetic-test-only" workout={{id:'private-test',name:'Test workout',date:'2026-09-20',exercises:[]}} onClose={close} onViewWorkout={view} onDelete={remove}/>)}</>;
  }
  act(()=>root.render(strict?<React.StrictMode><Harness/></React.StrictMode>:<Harness/>));if(!strict)host.querySelector('button').focus();click(host.querySelector('button'));advance(250);
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();now=0;
  vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:44,height:44}]);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new Blob(['test'],{type:'image/jpeg'})})));
  Object.defineProperty(window,'innerHeight',{configurable:true,value:800});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);closes=vi.fn();view=vi.fn();remove=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();advance(500);vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('exercise distance exit retains modal ownership until completion and restores exact trigger',()=>{
  mount();const trigger=host.querySelector('button');drag();expect(query('.exercise-visual-viewer')).not.toBeNull();expect(closes).not.toHaveBeenCalled();expect(document.body.style.position).toBe('fixed');
  expect(host.querySelector('main').getAttribute('aria-hidden')).toBe('true');advance(219);expect(closes).not.toHaveBeenCalled();advance(1);expect(closes).toHaveBeenCalledOnce();advance(32);
  expect(query('.exercise-visual-viewer')).toBeNull();expect(document.activeElement).toBe(trigger);expect(document.body.style.position).toBe('');
});
it.each([false,true])('exercise velocity exit runs once even for instantClose=%s',instant=>{
  mount('exercise',instant);drag(70,40);advance(220);expect(closes).toHaveBeenCalledOnce();advance(500);expect(closes).toHaveBeenCalledOnce();
});
it('exercise cancel keeps focus, artwork and title; normal Close still works afterward',()=>{
  mount();const image=query('.exercise-visual-stage img'),focus=document.activeElement;drag(60,400);advance(180);
  expect(query('.exercise-visual-stage img')).toBe(image);expect(query('#exercise-visual-viewer-title').textContent).toBe('Leg Press');expect(document.activeElement).toBe(focus);expect(closes).not.toHaveBeenCalled();
  click(query('[aria-label="Close visual viewer"]'));advance(160);expect(closes).toHaveBeenCalledOnce();
});
it('exercise Close during drag cancels deferred gesture close',()=>{
  mount();touch('touchstart',170);advance(200);touch('touchmove',250);click(query('[aria-label="Close visual viewer"]'));advance(500);expect(closes).toHaveBeenCalledOnce();
});
it('exercise Escape and browser Back use the same close path',()=>{
  mount();act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));advance(160);expect(closes).toHaveBeenCalledOnce();advance(32);
  click(host.querySelector('button'));advance(250);act(()=>window.dispatchEvent(new PopStateEvent('popstate')));advance(160);expect(closes).toHaveBeenCalledTimes(2);
});
it('photo scrolled content yields; at top it dismisses and restores exact trigger',()=>{
  mount('photo');const trigger=host.querySelector('button'),panel=query('.workout-photo-viewer-panel');panel.scrollTop=60;drag();advance(220);expect(closes).not.toHaveBeenCalled();expect(panel.scrollTop).toBe(60);
  panel.scrollTop=0;drag();expect(host.hasAttribute('inert')).toBe(true);advance(220);advance(32);expect(closes).toHaveBeenCalledOnce();expect(document.activeElement).toBe(trigger);expect(host.hasAttribute('inert')).toBe(false);
});
it('photo cancel and ordinary rerenders preserve dialog, data and panel position',()=>{
  mount('photo');const panel=query('.workout-photo-viewer-panel');drag(60);advance(180);act(()=>rerender());
  expect(query('.workout-photo-viewer-panel')).toBe(panel);expect(panel.textContent).toContain('Test workout');expect(closes).not.toHaveBeenCalled();
});
it('photo View workout, Save photo and Delete retain their handlers',async()=>{
  mount('photo');await act(async()=>{});act(()=>query('.workout-photo-viewer-panel img').dispatchEvent(new Event('load')));
  const button=text=>[...document.querySelectorAll('.workout-photo-viewer button')].find(n=>n.textContent===text);
  click(button('VIEW WORKOUT'));expect(view).toHaveBeenCalledOnce();await act(async()=>button('SAVE PHOTO').click());expect(exportWorkoutPhoto).toHaveBeenCalledOnce();
  click(button('DELETE PHOTO'));expect(remove).not.toHaveBeenCalled();click(button('DELETE PHOTO'));expect(remove).toHaveBeenCalledOnce();expect(closes).not.toHaveBeenCalled();
});
it('photo confirmation blocks drag; Escape cancels confirmation before closing viewer',()=>{
  mount('photo');click(query('.workout-photo-delete'));const confirm=query('[aria-label="Confirm photo deletion"]');drag(300);advance(500);expect(closes).not.toHaveBeenCalled();expect(query('[aria-label="Confirm photo deletion"]')).toBe(confirm);
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(query('[aria-label="Confirm photo deletion"]')).toBeNull();expect(closes).not.toHaveBeenCalled();
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(closes).toHaveBeenCalledOnce();
});
it('photo traps Tab and retains existing parent document lock on close',()=>{
  document.body.style.position='fixed';document.body.style.top='-70px';mount('photo');const close=query('[aria-label="Close workout photo"]'),last=query('.workout-photo-delete');
  last.focus();act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));expect(document.activeElement).toBe(close);
  click(close);expect(document.body.style.position).toBe('fixed');expect(document.body.style.top).toBe('-70px');document.body.style.position='';document.body.style.top='';
});
it.each(['exercise','photo'])('%s rapid reopen has neutral transforms and no stale close',kind=>{
  mount(kind);drag();advance(100);act(()=>window.dispatchEvent(new Event('blur')));click(query(kind==='exercise'?'[aria-label="Close visual viewer"]':'[aria-label="Close workout photo"]'));advance(200);
  click(host.querySelector('button'));advance(500);expect(closes).toHaveBeenCalledOnce();const visual=query(kind==='exercise'?'.exercise-visual-viewer':'.workout-photo-viewer-content');expect(visual.style.transform).toBe('');
});
it('photo multitouch cancels without deleting or navigating',()=>{
  mount('photo');touch('touchstart',170);advance(120);touch('touchmove',250);touch('touchstart',250,{count:2});touch('touchend',450);advance(500);
  expect(query('.workout-photo-viewer-content').style.transform).toBe('');expect(closes).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(view).not.toHaveBeenCalled();
});
it('StrictMode photo dismissal restores the explicit trigger even when a touch never focused it',()=>{
  mount('photo',false,true);const trigger=host.querySelector('button');drag();advance(220);advance(32);
  expect(document.activeElement).toBe(trigger);expect(closes).toHaveBeenCalledOnce();expect(host.hasAttribute('inert')).toBe(false);
});
