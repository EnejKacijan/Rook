import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HistoryCorrectionEditor} from './HistoryCorrectionEditor.jsx';
import {blankState} from './domain.js';
let root,done,update,state;
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=text=>act(()=>button(text).click());
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  state=blankState();const workout={id:'saved',name:'Upper',status:'completed',completedAt:'2026-09-06T12:00:00Z',exercises:[{id:'press',exerciseId:'barbell-bench-press',sets:[{id:'set',planned:true,completed:true,weight:60,reps:8,rir:1}]}]};
  state.workouts=[workout];done=vi.fn();update=vi.fn();const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<HistoryCorrectionEditor workout={workout} state={state} update={update} onDone={done} closeSheet={done} Header={()=>null}/>));
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
it('keeps clean Save disabled and gives a dirty discard confirmation one safe primary',()=>{
  expect(button('REVIEW CHANGES').disabled).toBe(true);click('About right');click('CANCEL');
  expect(button('KEEP EDITING').classList.contains('primary')).toBe(true);
  expect(button('DISCARD CHANGES').classList.contains('danger-text')).toBe(true);
  expect(button('DISCARD CHANGES').classList.contains('quiet')).toBe(true);
  expect(document.querySelectorAll('.history-correction-confirm .primary')).toHaveLength(1);
});
it('Keep Editing retains the draft without writing or leaving',()=>{
  click('About right');click('CANCEL');click('KEEP EDITING');
  expect(button('REVIEW CHANGES').disabled).toBe(false);expect(done).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
});
it('Discard preserves the existing exit callback and never writes the draft',()=>{
  click('About right');click('CANCEL');click('DISCARD CHANGES');
  expect(done).toHaveBeenCalledOnce();expect(update).not.toHaveBeenCalled();
});
it('review shows before/after without writing; Back retains draft; Save writes',()=>{
  const writes=vi.spyOn(Storage.prototype,'setItem');
  const input=document.querySelector('input[aria-label="Reps"]');
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'7');input.dispatchEvent(new Event('input',{bubbles:true}));});
  click('REVIEW CHANGES');expect(writes).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  expect(document.querySelector('.history-correction-diff').textContent).toContain('Reps: 8 → 7');
  click('BACK TO EDIT');expect(document.querySelector('input[aria-label="Reps"]').value).toBe('7');
  click('REVIEW CHANGES');click('SAVE CHANGES');expect(writes).toHaveBeenCalled();expect(update).toHaveBeenCalledOnce();expect(done).toHaveBeenCalledOnce();
  expect(state.workouts[0].exercises[0].sets[0].reps).toBe(8);
  expect(JSON.parse(localStorage.getItem('lift-v2-state')).workouts[0].exercises[0].sets[0].reps).toBe(7);
});
it('failed Save preserves original history and leaves retry available',()=>{
  const original=JSON.stringify(state.workouts);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Quota','QuotaExceededError');});
  click('About right');click('REVIEW CHANGES');click('SAVE CHANGES');
  expect(JSON.stringify(state.workouts)).toBe(original);expect(update).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();expect(button('TRY AGAIN')).toBeTruthy();
  expect(document.querySelector('[role="alert"]').textContent).toContain('history is unchanged');
});
