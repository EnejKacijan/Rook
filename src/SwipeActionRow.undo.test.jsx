import React,{StrictMode,act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useExerciseRemoveUndo} from './SwipeActionRow.jsx';

let host,root,undo;
function Harness({revision=0}) {
  undo=useExerciseRemoveUndo();
  return <main data-revision={revision}><input aria-label="Unrelated field"/>{undo.surface}</main>;
}
const render=revision=>act(()=>root.render(<StrictMode><Harness revision={revision}/></StrictMode>));
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const surface=()=>host.querySelector('[role=status]');
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers();host=document.createElement('div');document.body.append(host);
  root=createRoot(host);render(0);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();});

it('show gives exactly five seconds despite rerenders, focus and scrolling',()=>{
  act(()=>undo.show({message:'Hack Squat added',undo:vi.fn()}));
  expect(surface().textContent).toBe('Hack Squat addedUndo');
  expect(surface().getAttribute('aria-live')).toBe('polite');
  for(let second=1;second<=4;second++){
    advance(1000);render(second);
    act(()=>{host.querySelector('input').focus();host.querySelector('main').dispatchEvent(new Event('scroll'));});
    expect(surface()).not.toBeNull();
  }
  advance(999);render(5);expect(surface()).not.toBeNull();
  advance(1);expect(surface()).toBeNull();expect(vi.getTimerCount()).toBe(0);
});
it('a new explicit event replaces the action and starts a fresh five-second lifetime',()=>{
  const first=vi.fn(),second=vi.fn();
  act(()=>undo.show({message:'First added',undo:first}));advance(4000);
  act(()=>undo.show({message:'Second added',undo:second}));
  expect(vi.getTimerCount()).toBe(1);expect(surface().textContent).toBe('Second addedUndo');
  advance(1000);expect(surface()).not.toBeNull();
  advance(3999);expect(surface()).not.toBeNull();
  advance(1);expect(surface()).toBeNull();expect(first).not.toHaveBeenCalled();expect(second).not.toHaveBeenCalled();
});
it('Undo remains actionable just before expiry and clears its timer',()=>{
  const restore=vi.fn();act(()=>undo.show({message:'Hack Squat added',undo:restore}));
  advance(4999);act(()=>surface().querySelector('button').click());
  expect(restore).toHaveBeenCalledOnce();expect(surface()).toBeNull();expect(vi.getTimerCount()).toBe(0);
  advance(5000);expect(restore).toHaveBeenCalledOnce();
});
it('invalidation removes the notice immediately and cancels expiry',()=>{
  let valid=true;const restore=vi.fn();
  act(()=>undo.show({message:'Hack Squat added',undo:restore,valid:()=>valid}));advance(1000);
  valid=false;render(1);
  expect(surface()).toBeNull();expect(vi.getTimerCount()).toBe(0);expect(restore).not.toHaveBeenCalled();
});
it('unmount cancels the pending timer',()=>{
  act(()=>undo.show({message:'Hack Squat added',undo:vi.fn()}));
  expect(vi.getTimerCount()).toBe(1);act(()=>root.render(null));expect(vi.getTimerCount()).toBe(0);
});
it('an explicitly failed Undo remains retryable without restarting its lifetime',()=>{
 const restore=vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
 act(()=>undo.show({message:'Workout moved',undo:restore}));advance(4000);
 act(()=>surface().querySelector('button').click());expect(surface()).not.toBeNull();expect(vi.getTimerCount()).toBe(1);
 advance(999);act(()=>surface().querySelector('button').click());expect(surface()).toBeNull();expect(restore).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
it.each([90,-90])('a horizontal swipe of %ipx dismisses feedback without invoking Undo',distance=>{
 const restore=vi.fn();act(()=>undo.show({message:'Previous values applied',undo:restore}));const node=surface();
 act(()=>{node.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:400}));node.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:150+distance,clientY:401}));});
 expect(surface()).toBeNull();expect(restore).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it.each(['short','vertical','cancelled','button'])('%s gesture preserves the shared notice and Undo',kind=>{
 const restore=vi.fn();act(()=>undo.show({message:'Previous values applied',undo:restore}));const node=kind==='button'?surface().querySelector('button'):surface();
 act(()=>{node.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:400}));if(kind==='cancelled')node.dispatchEvent(new Event('pointercancel',{bubbles:true}));node.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:kind==='short'?160:250,clientY:kind==='vertical'?600:401}));});
 expect(surface()).not.toBeNull();expect(restore).not.toHaveBeenCalled();act(()=>surface().querySelector('button').click());expect(restore).toHaveBeenCalledOnce();expect(surface()).toBeNull();
});
it.each(['normal','long','no room'])('logger feedback avoids primary controls in the %s layout without taking space',kind=>{
 const rect=(top,height)=>({top,bottom:top+height,height,left:0,right:320,width:320});
 const measure=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){
  if(this.classList.contains('today-undo'))return rect(690,64);
  return kind==='normal'?rect(250,200):kind==='long'?rect(256,460):rect(0,844);
 });
 const height=vi.spyOn(window,'innerHeight','get').mockReturnValue(844);
 function SafeHarness(){const screen=useRef(null);undo=useExerciseRemoveUndo({avoidRef:screen});return <main ref={screen}><div className="workout-primary-action"/>{undo.surface}</main>;}
 act(()=>root.render(<SafeHarness/>));act(()=>undo.show({message:'Previous values applied',undo:vi.fn()}));
 if(kind==='normal')expect(surface().style.top).toBe('');
 if(kind==='long'){expect(surface().style.top).toBe('724px');expect(surface().style.bottom).toBe('auto');}
 if(kind==='no room')expect(surface().style.visibility).toBe('hidden');
 expect(surface().style.position).toBe('');expect(vi.getTimerCount()).toBe(1);measure.mockRestore();height.mockRestore();
});
