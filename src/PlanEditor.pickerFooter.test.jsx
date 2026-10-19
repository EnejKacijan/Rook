import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
let root,host;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo',()=>{});Element.prototype.scrollIntoView=vi.fn();
  host=document.createElement('main');host.className='screen detail-screen';document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(text)=>[...host.querySelectorAll('button')].find(row=>row.textContent.trim()===text || row.getAttribute('aria-label')===text);
it.each([
  ['today and saved workout',{mode:'edit',workoutOnly:true,copyOverride:{action:'APPLY'}}],
  ['recurring plan',{mode:'edit'}], ['generated preview',{mode:'review',generatedAcceptance:true}],
  ['import preview',{mode:'import'}],
])('hides the commit surface throughout exercise picking in %s, and restores it after cancel and select',async(label,props)=>{
  const state=createReturningUserFixture(0),source=structuredClone(state.program);source.days=source.days.slice(0,1);source.days[0].exercises=source.days[0].exercises.slice(0,3);
  if(props.mode==='import')source.source='ai-import';
  const saved=vi.fn();
  await act(async()=>root.render(<PlanEditor source={source} profile={state.profile} exerciseState={state} onSave={saved} onCancel={()=>{}} {...props}/>));
  expect(host.querySelector('.sheet-action-footer')).not.toBeNull();
  await act(async()=>button('+ Add exercise').click());
  expect(host.querySelector('[type="search"]')).not.toBeNull();
  expect(host.querySelector('.sheet-action-footer').hidden).toBe(true);
  await act(async()=>host.querySelector('.sheet-action-footer .button').click());
  expect(saved).not.toHaveBeenCalled();
  await act(async()=>button('CANCEL').click());
  expect(host.querySelector('.sheet-action-footer').hidden).toBe(false);
  await act(async()=>button('+ Add exercise').click());
  await act(async()=>host.querySelector('[role="option"]').click());
  expect(host.querySelector('.sheet-action-footer').hidden).toBe(false);
  expect(saved).not.toHaveBeenCalled();
});
