import React, {act, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useStepSwipeForward} from './useStepSwipeForward.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, forward;
function Questionnaire({enabled=true, active=true, step=0}) {
 const ref=useRef(null);
 useStepSwipeForward(ref,{enabled,active,step,onForward:forward});
 return <main ref={ref}><div data-swipe-back-content><p>Question {step}</p><input/></div></main>;
}
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',query=>({matches:query.includes('standalone')||query.includes('reduced-motion')}));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);forward=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
function render(props={}) {act(()=>root.render(<Questionnaire {...props}/>));host.querySelector('main').getBoundingClientRect=()=>({left:0,width:390});}
function touch(type,x=386,target=host.querySelector('main')) {
 const event=new Event(type,{bubbles:true,cancelable:true});
 Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{identifier:1,clientX:x,clientY:200}]});
 act(()=>target.dispatchEvent(event));return event;
}
function swipe(){touch('touchstart');touch('touchmove',200);touch('touchend',200);act(()=>vi.runAllTimers());}
it('calls the supplied existing Continue once without replacing form content during drag',()=>{
 render();const node=host.querySelector('input');touch('touchstart');touch('touchmove',200);
 expect(host.querySelector('input')).toBe(node);expect(forward).not.toHaveBeenCalled();touch('touchend',200);
 expect(forward).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('uses live validation and recovers immediately after correction',()=>{
 render({enabled:false});swipe();expect(forward).not.toHaveBeenCalled();render({enabled:true});swipe();expect(forward).toHaveBeenCalledOnce();
});
it('cancels if the question changes during a gesture',()=>{
 render();touch('touchstart');touch('touchmove',200);render({step:1});touch('touchend',200);act(()=>vi.runAllTimers());expect(forward).not.toHaveBeenCalled();
});
it('rechecks validation on release rather than using stale allowed state',()=>{
 render();touch('touchstart');touch('touchmove',200);render({enabled:false});touch('touchend',200);act(()=>vi.runAllTimers());expect(forward).not.toHaveBeenCalled();
});
it('does not own native browser forward navigation',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));render();swipe();expect(forward).not.toHaveBeenCalled();
});
it('does not run behind another product surface',()=>{render({active:false});swipe();expect(forward).not.toHaveBeenCalled();});
it('does not reuse the touch that dismisses an open picker as Forward',()=>{
 render({enabled:false});const event=new Event('pointerdown',{bubbles:true});Object.defineProperty(event,'pointerType',{value:'touch'});
 act(()=>host.querySelector('main').dispatchEvent(event));render({enabled:true});swipe();expect(forward).not.toHaveBeenCalled();
 swipe();expect(forward).toHaveBeenCalledOnce();
});
it('does not navigate while typing or from nested dialog content',()=>{
 render();host.querySelector('input').focus();swipe();expect(forward).not.toHaveBeenCalled();host.querySelector('input').blur();
 const dialog=document.createElement('section');dialog.setAttribute('role','dialog');host.querySelector('main').append(dialog);
 touch('touchstart',386,dialog);touch('touchmove',200,dialog);touch('touchend',200,dialog);act(()=>vi.runAllTimers());expect(forward).not.toHaveBeenCalled();
});
it('checks a synchronous caller invalidation without waiting for React to render',()=>{
 let valid=true;render({enabled:()=>valid});touch('touchstart');touch('touchmove',200);valid=false;touch('touchend');expect(forward).not.toHaveBeenCalled();
});
it('gives an explicit action priority over the in-flight forward gesture',()=>{
 render();touch('touchstart');touch('touchmove',200);act(()=>host.querySelector('p').click());touch('touchend');expect(forward).not.toHaveBeenCalled();
});
