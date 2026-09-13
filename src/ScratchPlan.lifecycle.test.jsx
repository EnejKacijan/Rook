import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScratchPlan} from './App.jsx';
import {blankState} from './domain.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,close;
beforeEach(async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});vi.spyOn(window,'confirm').mockReturnValue(false);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);close=vi.fn();
 await act(async()=>root.render(<ScratchPlan state={blankState()} update={()=>{}} close={close}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const setup=()=>host.querySelector('.scratch-plan-screen');
const editor=()=>host.querySelector('.scratch-editor-screen');
const button=(name,scope=host)=>[...scope.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===name||e.textContent.trim()===name);
const click=async(name,scope=host)=>act(async()=>button(name,scope).click());
const fill=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const begin=async()=>{await click('Mon',setup());await click('Wed',setup());await click('CONTINUE',setup());};

it('retains the same editor, day IDs and renamed workout over repeated Back/Continue without edits being reset',async()=>{
 await begin();const surface=editor(),list=surface.querySelector('.plan-editor');
 const field=surface.querySelector('[aria-label="Mon workout name"]'),ids=[...surface.querySelectorAll('[data-day-id]')].map(e=>e.dataset.dayId);
 for(let i=0;i<3;i++){
  await fill(field,`Retained ${i}`);await click('Back to plan setup',surface);
  expect(surface.hidden).toBe(true);expect(surface.hasAttribute('inert')).toBe(true);expect(window.confirm).not.toHaveBeenCalled();
  await click('CONTINUE',setup());expect(editor()).toBe(surface);expect(surface.querySelector('.plan-editor')).toBe(list);
  expect(field.value).toBe(`Retained ${i}`);expect(field.isConnected).toBe(true);
  expect([...surface.querySelectorAll('[data-day-id]')].map(e=>e.dataset.dayId)).toEqual(ids);expect(surface.hidden).toBe(false);
 }
});
it('preserves an untouched draft and supports a setup-name-only change without replacing any workout',async()=>{
 await begin();const surface=editor(),field=surface.querySelector('[aria-label="Mon workout name"]');
 await click('Back to plan setup',surface);await click('CONTINUE',setup());expect(editor()).toBe(surface);
 await click('Back to plan setup',surface);await fill(setup().querySelector('input'),'Renamed week');await click('CONTINUE',setup());
 expect(editor()).toBe(surface);expect(field.isConnected).toBe(true);expect(surface.querySelector('[aria-label="Weekly plan name"]').value).toBe('Renamed week');
 await click('Back to plan setup',surface);expect(setup().querySelector('input').value).toBe('Renamed week');expect(window.confirm).not.toHaveBeenCalled();
});
it('requires explicit discard for changed days, leaves the draft intact when rejected, and only rebuilds after acceptance',async()=>{
 await begin();const surface=editor();await fill(surface.querySelector('[aria-label="Mon workout name"]'),'Meaningful work');
 await click('Back to plan setup',surface);await click('Fri',setup());await click('CONTINUE',setup());
 expect(window.confirm).toHaveBeenCalledOnce();expect(setup()).not.toBeNull();expect(editor()).toBe(surface);
 await click('Fri',setup());await click('CONTINUE',setup());expect(editor()).toBe(surface);expect(surface.querySelector('[aria-label="Mon workout name"]').value).toBe('Meaningful work');
 await click('Back to plan setup',surface);await click('Wed',setup());window.confirm.mockReturnValue(true);await click('CONTINUE',setup());
 expect(editor()).not.toBe(surface);expect(surface.isConnected).toBe(false);expect(editor().querySelectorAll('[data-reorder-workout-section]')).toHaveLength(1);
 expect(editor().querySelector('[aria-label="Mon workout name"]').value).toBe('Mon Workout');
});
it('does not overload leaving setup with silent discard of meaningful editor work',async()=>{
 await begin();await fill(editor().querySelector('[aria-label="Mon workout name"]'),'Keep me');await click('Back to plan setup',editor());
 await click('Back to start',setup());expect(close).not.toHaveBeenCalled();expect(window.confirm).toHaveBeenCalledOnce();
 window.confirm.mockReturnValue(true);await click('Back',setup());expect(close).toHaveBeenCalledOnce();
});
it('releases reorder listeners while retained but inactive, then permits the next session of editing',async()=>{
 const add=vi.spyOn(window,'addEventListener'),remove=vi.spyOn(window,'removeEventListener');await begin();
 expect(add.mock.calls.some(([type,fn])=>type==='keydown'&&fn.name==='cancelOnEscape')).toBe(true);
 await click('Back to plan setup',editor());
 for(const [type,fn]of add.mock.calls.filter(([,fn])=>['cancelOnEscape','cancelCompactWeek','clearCandidate'].includes(fn.name)))
  expect(remove.mock.calls.some(([t,f])=>t===type&&f===fn)).toBe(true);
 await click('CONTINUE',setup());expect(editor().hidden).toBe(false);
});
