import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;host?.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(mode='scratch'){
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 const state=createReturningUserFixture(0);host=document.createElement('main');host.className='screen';document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode={mode} onSave={()=>{}} onCancel={()=>{}}/>));
 return host.querySelector('.plan-workout-drag-surface');
}
function event(target,type,fields={}){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,fields);target.dispatchEvent(e);return e;}
const point={identifier:5,clientX:25,clientY:200};
async function start(handle){await act(async()=>event(handle,'touchstart',{touches:[point]}));expect(document.querySelector('.is-week-reordering')).not.toBeNull();}
function idle(){expect(document.querySelector('.is-reordering,.is-week-reordering,.plan-reorder-preview,.reorder-live-source')).toBeNull();expect(host.querySelector('.plan-editor').style.minHeight).toBe('');expect(host.querySelector('.plan-editor').style.paddingTop).toBe('');}
it.each(['touchend','touchcancel','pointercancel','Escape','blur','visibilitychange'])('Scratch releases the touch gesture on %s',async reason=>{
 const add=vi.spyOn(window,'addEventListener'),remove=vi.spyOn(window,'removeEventListener'),handle=await mount();await start(handle);
 await act(async()=>{
  if(reason==='Escape')event(window,'keydown',{key:'Escape'});
  else if(reason==='visibilitychange')event(document,reason);
  else if(reason==='pointercancel')event(handle,reason,{pointerType:'touch',pointerId:77});
  else event(reason==='blur'?window:handle,reason,{touches:[],changedTouches:[point]});
 });idle();
 for(const [type,fn]of add.mock.calls.filter(([type,fn])=>['touchMove','touchEnd','touchCancel','pointerMove','pointerEnd'].includes(fn.name)))expect(remove.mock.calls.some(([t,f])=>t===type&&f===fn)).toBe(true);
 const move=event(host.querySelector('.plan-editor'),'touchmove',{touches:[{...point,identifier:6,clientY:100}]});expect(move.defaultPrevented).toBe(false);
});
it('installs no blocking reorder move listener while idle; unmount releases an active gesture',async()=>{
 const add=vi.spyOn(window,'addEventListener'),remove=vi.spyOn(window,'removeEventListener'),handle=await mount();
 expect(add.mock.calls.some(([type,fn])=>type==='touchmove'&&fn.name==='touchMove')).toBe(false);await start(handle);
 expect(add.mock.calls.some(([type,fn])=>type==='touchmove'&&fn.name==='touchMove')).toBe(true);
 await act(async()=>root.unmount());root=null;
 for(const [type,fn]of add.mock.calls.filter(([type,fn])=>['touchMove','touchEnd','touchCancel','pointerMove','pointerEnd'].includes(fn.name)))expect(remove.mock.calls.some(([t,f])=>t===type&&f===fn)).toBe(true);
});
it('captures non-touch pointers only during drag and releases them on Escape',async()=>{
 const handle=await mount('edit');let captured=false;
 handle.setPointerCapture=vi.fn(()=>{captured=true;});handle.hasPointerCapture=vi.fn(()=>captured);handle.releasePointerCapture=vi.fn(()=>{captured=false;});
 await act(async()=>event(handle,'pointerdown',{pointerType:'mouse',pointerId:9,button:0,clientX:25,clientY:200}));
 await act(async()=>event(handle,'pointermove',{pointerType:'mouse',pointerId:9,clientX:25,clientY:220}));expect(captured).toBe(true);
 await act(async()=>event(window,'keydown',{key:'Escape'}));expect(handle.releasePointerCapture).toHaveBeenCalledWith(9);expect(captured).toBe(false);idle();
});
it('Edit Plan uses the same cleanup and a new touch does not inherit a stale gesture',async()=>{
 const handle=await mount('edit');await start(handle);
 await act(async()=>event(host.querySelector('.plan-editor'),'touchstart',{touches:[{...point,identifier:6}]}));idle();
 await start(handle);await act(async()=>event(window,'touchcancel',{touches:[],changedTouches:[point]}));idle();
});
it('keeps a valid handle drag alive for non-cancelable moves until a terminal event',async()=>{
 const handle=await mount();await start(handle);
 await act(async()=>{const move=new Event('touchmove',{bubbles:true,cancelable:false});Object.assign(move,{touches:[{...point,clientY:220}]});handle.dispatchEvent(move);});
 expect(document.querySelector('.is-week-reordering')).not.toBeNull();
 await act(async()=>event(window,'touchcancel',{touches:[],changedTouches:[point]}));idle();
});
