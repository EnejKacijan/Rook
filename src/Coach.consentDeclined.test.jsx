import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Coach} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState} from './domain.js';
import {AIService} from './aiService.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
vi.mock('./aiService.js',async original=>({...await original(),AIService:{...(await original()).AIService,coach:vi.fn()}}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,changeState;
const declined=()=>Object.assign(new Error('AI data sharing is off. You can change it in Profile → Privacy & legal. Your local training is unchanged.'),{code:'ai-consent-required'});
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));
  saveState.mockReset().mockReturnValue(true);AIService.coach.mockReset();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
  HTMLElement.prototype.getAnimations=()=>[];host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function mount(draft){
  const state=createReturningUserFixture(0);state.coachDraft=draft;
  function Harness(){const [value,setValue]=useState(state);current=value;changeState=setValue;return <Coach state={value} update={fn=>setValue(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}} availability={{state:'ready'}}/>;}
  act(()=>root.render(<Harness/>));act(()=>vi.advanceTimersByTime(10));
}
const send=()=>act(async()=>host.querySelector('form.coach-input').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const type=value=>act(()=>{
  const input=host.querySelector('textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
});
const rejectLater=()=>{
  let reject;AIService.coach.mockImplementation(()=>new Promise((resolve,fail)=>{reject=fail;}));
  return ()=>act(async()=>{reject(declined());await Promise.resolve();});
};

it('declined AI sharing keeps the message unsent in the composer instead of showing an interrupted reply',async()=>{
  AIService.coach.mockRejectedValue(declined());
  mount('I only have 30 minutes today.');
  await send();await act(async()=>{await Promise.resolve();});
  expect(AIService.coach).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('The reply didn’t finish.');
  expect(host.querySelector('textarea').value).toBe('I only have 30 minutes today.');
  expect(current.coachDraft).toBe('I only have 30 minutes today.');
  expect(current.conversations.some(entry=>entry.user==='I only have 30 minutes today.')).toBe(false);
  expect(host.querySelector('.coach-consent-notice').textContent).toContain('Message not sent');
});

it('a real request failure still offers Retry reply',async()=>{
  AIService.coach.mockRejectedValue(Object.assign(new Error('Network'),{code:'network'}));
  mount('Plan my week.');
  await send();await act(async()=>{await Promise.resolve();});
  expect(host.textContent).toContain('The reply didn’t finish.');
  expect(host.querySelector('.coach-consent-notice')).toBeNull();
});

it('does not replace a newer composer draft when consent is declined later',async()=>{
  const decline=rejectLater();mount('Original question.');await send();
  type('My next question.');await decline();
  expect(current.coachDraft).toBe('My next question.');
  expect(host.querySelector('textarea').value).toBe('My next question.');
  expect(current.conversations.some(entry=>entry.user==='Original question.')).toBe(false);
});

it('does not restore a cancelled request or show its notice in a new chat',async()=>{
  const decline=rejectLater();mount('Original question.');await send();
  act(()=>changeState(previous=>{
    const next=structuredClone(previous);
    Object.assign(next.conversations.at(-1),{coachWorkflowStatus:'cancelled'});
    next.activeCoachConversationId='fresh-chat';next.coachDraft='';return next;
  }));
  await decline();
  expect(current.activeCoachConversationId).toBe('fresh-chat');
  expect(current.coachDraft).toBe('');
  expect(current.conversations.at(-1).coachWorkflowStatus).toBe('cancelled');
  expect(host.querySelector('textarea').value).toBe('');
  expect(host.querySelector('.coach-consent-notice')).toBeNull();
});

it('does not mutate a different profile after an old consent request rejects',async()=>{
  const decline=rejectLater();mount('Original question.');await send();
  act(()=>changeState(previous=>({...previous,profile:{...previous.profile,id:'other-profile'},coachDraft:'Other profile draft.'})));
  const before=structuredClone(current),composer=host.querySelector('textarea').value;
  await decline();
  expect(current).toEqual(before);
  expect(host.querySelector('textarea').value).toBe(composer);
  expect(host.querySelector('.coach-consent-notice')).toBeNull();
});
