import React,{StrictMode,act} from 'react';
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
