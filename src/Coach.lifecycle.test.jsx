import React, {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Coach} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState,serializeState,deserializeState} from './domain.js';
import {AIService} from './aiService.js';
import {useSemanticSwipeBack} from './useSemanticSwipeBack.js';
import {pendingCoachWorkflows} from './coachConversations.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
vi.mock('./aiService.js',async original=>({...await original(),AIService:{...(await original()).AIService,coach:vi.fn()}}));
let root,host,current,page;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));saveState.mockReset().mockReturnValue(true);AIService.coach.mockReset().mockResolvedValue({text:'Complete answer.'});
  vi.stubGlobal('matchMedia',q=>({matches:q.includes('standalone'),addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(cb,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden],[aria-hidden="true"]')?[]:[{}];});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:390,height:844,right:390,bottom:844});
  HTMLElement.prototype.getAnimations=()=>[];host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(pending=false){const state=createReturningUserFixture(0);state.activeCoachConversationId='current';state.coachDraft='Draft answer';state.conversations=[{id:'older',conversationId:'older',createdAt:new Date('2026-09-17T12:00:00').getTime(),user:'Yesterday question',reply:{text:'Yesterday answer'}},{id:'message',conversationId:'current',createdAt:Date.now(),user:'Current question',reply:pending?{text:'Which workouts?',combineRequest:{step:'sources',choices:[{id:'upper',label:'Upper A'},{id:'lower',label:'Lower B'}]}}:{text:'Current answer'}}];return state;}
function mount(initial){function Harness(){useSemanticSwipeBack();const [state,setState]=useState(initial),[active,setActive]=useState(true);current=state;page=setActive;const update=fn=>setState(prev=>fn(structuredClone(prev)));return active?<Coach state={state} update={update} setPage={()=>setActive(false)} setDetail={()=>{}}/>:<button onClick={()=>setActive(true)}>Coach</button>;}act(()=>root.render(<Harness/>));act(()=>vi.advanceTimersByTime(1));}
const button=name=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name);
const click=name=>act(()=>button(name).click());
const type=value=>act(()=>{const input=document.querySelector('textarea');input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
function history(){click('Chat history');act(()=>vi.advanceTimersByTime(1));}
function swipe(target){for(const [type,x]of [['touchstart',4],['touchmove',260],['touchend',260]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{identifier:1,clientX:x,clientY:300}]});act(()=>target.dispatchEvent(e));}act(()=>vi.advanceTimersByTime(250));}
it('M History is read-only and Back/swipe restores the same current chat/draft',()=>{
  mount(fixture());const id=current.activeCoachConversationId;history();act(()=>document.querySelector('[title="Yesterday question"]').closest('button').click());
  expect(document.querySelector('textarea')).toBeNull();expect(document.querySelector('.conversation').textContent).toContain('Yesterday answer');expect(current.activeCoachConversationId).toBe(id);
  swipe(document.querySelector('.coach-content-surface'));expect(document.querySelector('.coach-history-surface').getAttribute('aria-hidden')).toBeNull();
  swipe(document.querySelector('.coach-history-surface'));expect(document.querySelector('.coach-history-surface')).toBeNull();expect(current.activeCoachConversationId).toBe(id);expect(document.querySelector('textarea').value).toBe('Draft answer');
});
it('manual New chat is blank and same-day tab remount/reload retains it',()=>{
  mount(fixture());history();click('New chat');const id=current.activeCoachConversationId;expect(id).not.toBe('current');expect(document.querySelector('textarea').value).toBe('');
  type('Fresh draft');act(()=>page(false));click('Coach');expect(current.activeCoachConversationId).toBe(id);expect(document.querySelector('textarea').value).toBe('Fresh draft');
  expect(deserializeState(serializeState(current)).coachDraft).toBe('Fresh draft');expect(current.conversations).toHaveLength(2);
});
it('pending New chat asks first; Continue preserves choices and Start cancels only that workflow',()=>{
  mount(fixture(true));act(()=>document.querySelector('input[type="checkbox"]').click());const original=structuredClone(current);history();click('New chat');expect(document.body.textContent).toContain('Your current Coach adjustment is still in progress.');
  click('Continue current');act(()=>vi.advanceTimersByTime(400));expect(current).toEqual(original);click('New chat');click('Start new chat');
  expect(current.activeCoachConversationId).not.toBe('current');expect(current.conversations[1]).toMatchObject({coachWorkflowStatus:'cancelled',combineSelection:['upper']});expect(current.program).toEqual(original.program);expect(current.activeWorkout).toEqual(original.activeWorkout);
});
it('failed manual save retains pending confirmation, old transcript/draft and allows retry',()=>{
  mount(fixture(true));const before=structuredClone(current);history();click('New chat');saveState.mockReturnValue(false);click('Start new chat');expect(current).toEqual(before);expect(document.querySelector('.coach-new-confirm [role="alert"]').textContent).toContain('unchanged');
  saveState.mockReturnValue(true);click('Start new chat');expect(current.activeCoachConversationId).not.toBe(before.activeCoachConversationId);expect(document.querySelector('textarea').value).toBe('');
});
it('next-day entry failure keeps old state and retries without deleting history',()=>{
  vi.setSystemTime(new Date('2026-09-19T12:00:00'));const state=fixture();state.conversations[1].createdAt=new Date('2026-09-18T12:00:00').getTime();saveState.mockReturnValue(false);mount(state);
  expect(current).toEqual(state);expect(document.querySelector('[role="alert"]').textContent).toContain('unchanged');saveState.mockReturnValue(true);click('Try again');expect(current.activeCoachConversationId).not.toBe('current');expect(current.conversations).toEqual(state.conversations);
});
it('resolution stays visible during the visit; next tab entry rolls over',async()=>{
  const state=fixture(true);state.conversations[1].createdAt=new Date('2026-09-17T12:00:00').getTime();mount(state);expect(current.activeCoachConversationId).toBe('current');history();click('New chat');click('Start new chat');
  const newId=current.activeCoachConversationId;vi.setSystemTime(new Date('2026-09-19T12:00:00'));type('Plain question');await act(async()=>button('Send message').click());expect(current.activeCoachConversationId).toBe(newId);expect(AIService.coach).toHaveBeenCalledOnce();
  act(()=>page(false));click('Coach');expect(current.activeCoachConversationId).not.toBe(newId);
});
it('late reply after explicit cancellation cannot resurrect an archived workflow',async()=>{
  let resolve;AIService.coach.mockImplementation(()=>new Promise(r=>resolve=r));mount(fixture());type('Combine workouts');click('Send message');history();click('New chat');click('Start new chat');const fresh=current.activeCoachConversationId;
  await act(async()=>resolve({text:'How much time?',combineRequest:{step:'time',sourceIds:['upper','lower']}}));
  expect(current.activeCoachConversationId).toBe(fresh);expect(current.conversations.at(-1).coachWorkflowStatus).toBe('cancelled');expect(document.querySelector('.combine-choices')).toBeNull();
});
it('keeps user text selectable while only Coach responses expose an explicit Copy action',async()=>{
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  const state=fixture();state.conversations[1].user='Živjo\\nše ena vrstica';state.conversations[1].reply.text='Čist odgovor\\n\\nDruga vrstica';mount(state);
  const user=document.querySelector('.user-message');
  expect(user.textContent).toBe('Živjo\\nše ena vrstica');
  expect(user.className).toContain('user-message');
  expect(document.querySelector('[aria-label="Copy your message"]')).toBeNull();
  await act(async()=>document.querySelector('[aria-label="Copy Coach response"]').click());
  expect(writeText).toHaveBeenLastCalledWith('Čist odgovor\\n\\nDruga vrstica');
  expect(document.querySelector('[aria-label="Copied Coach response"]')).not.toBeNull();
  act(()=>vi.advanceTimersByTime(1800));
  expect(document.querySelector('[aria-label="Copied Coach response"]')).toBeNull();
});
it('reports Coach clipboard rejection without mutating the transcript',async()=>{
  const writeText=vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  const state=fixture();const original=state.conversations.map(entry=>({...entry}));mount(state);
  await act(async()=>document.querySelector('[aria-label="Copy Coach response"]').click());
  expect(document.querySelector('.coach-copy .visually-hidden').textContent).toContain("Couldn't copy");
  expect(current.conversations).toEqual(original);
});
it('does not apply pending copy feedback after switching to another conversation',async()=>{
  let resolve;
  const writeText=vi.fn().mockReturnValue(new Promise(r=>{resolve=r;}));
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  mount(fixture());
  act(()=>document.querySelector('[aria-label="Copy Coach response"]').click());
  history();act(()=>document.querySelector('[title="Yesterday question"]').closest('button').click());
  await act(async()=>resolve());
  expect(document.querySelector('[aria-label="Copied your message"]')).toBeNull();
  expect(document.querySelector('[aria-label="Copied Coach response"]')).toBeNull();
});
it('keeps the same role-based copy behavior in historical conversations',async()=>{
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  mount(fixture());history();act(()=>document.querySelector('[title="Yesterday question"]').closest('button').click());
  expect(document.querySelector('.user-message').textContent).toBe('Yesterday question');
  expect(document.querySelector('[aria-label="Copy your message"]')).toBeNull();
  await act(async()=>document.querySelector('[aria-label="Copy Coach response"]').click());
  expect(writeText).toHaveBeenCalledWith('Yesterday answer');
});
it('partial source selection survives tab remount and interrupted reply retries the same entry',async()=>{
  mount(fixture(true));act(()=>document.querySelector('input[type="checkbox"]').click());act(()=>page(false));click('Coach');expect(document.querySelector('input[type="checkbox"]').checked).toBe(true);
  AIService.coach.mockRejectedValueOnce(new Error('offline'));type('Question');await act(async()=>button('Send message').click());const count=current.conversations.length,id=current.conversations.at(-1).id;
  await act(async()=>button('Retry reply').click());expect(current.conversations).toHaveLength(count);expect(current.conversations.at(-1).id).toBe(id);expect(current.conversations.at(-1).reply.text).toBe('Complete answer.');
});
it('Adjust Today review selections survive remount, and Cancel resolves the review until it is reopened',()=>{
  const state=fixture(),day=state.program.days[0];state.conversations[1].createdAt=new Date('2026-09-17T12:00:00').getTime();state.conversations[1].reply={text:'Review a shorter workout',action:{type:'adapt-today',programDayId:day.id,targetDate:'2026-09-18',exerciseIds:day.exercises.map(e=>e.exerciseId),minutes:30,label:'USE WORKOUT'}};
  mount(state);click('REVIEW CHANGES');const controls=[...document.querySelectorAll('.adapt-review-list button:not([disabled])')];act(()=>controls.at(-1).click());const chosen=current.conversations[1].actionReview.exerciseIds;
  act(()=>page(false));click('Coach');click('REVIEW CHANGES');expect([...document.querySelectorAll('.adapt-review-list button[aria-pressed="true"]')]).toHaveLength(chosen.length);
  click('CANCEL');expect(pendingCoachWorkflows(current)).toEqual([]);expect(current.conversations[1].coachReviewCancelled).toBe(true);
  expect(current.activeCoachConversationId).toBe('current');
  click('REVIEW CHANGES');expect(pendingCoachWorkflows(current)).toHaveLength(1);
  click('CANCEL');act(()=>page(false));click('Coach');expect(current.activeCoachConversationId).not.toBe('current');
});
