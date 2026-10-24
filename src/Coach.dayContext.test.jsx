import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Coach,TodayActionsSheet} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {createCoachDayContext} from './coachDayContext.js';
import {saveState} from './domain.js';
import {AIService} from './aiService.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
vi.mock('./aiService.js',async original=>({...await original(),AIService:{...(await original()).AIService,coach:vi.fn()}}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));
  saveState.mockReset().mockReturnValue(true);AIService.coach.mockReset().mockResolvedValue({text:'Advice only.',action:null});
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
  HTMLElement.prototype.getAnimations=()=>[];host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const settle=()=>act(()=>vi.advanceTimersByTime(10));
function mount(draft='',availability={state:'ready'},existing=false){
  const state=createReturningUserFixture(0);state.coachDraft=draft;
  if(existing){state.activeCoachConversationId='previous-chat';state.coachConversationMeta={'previous-chat':{id:'previous-chat',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:'2026-10-23'}};state.conversations=[{id:'old-message',conversationId:'previous-chat',createdAt:Date.now(),user:'Old context',reply:{text:'Old answer',action:null}}];}
  const context=createCoachDayContext(state,'2026-10-24');
  function Harness(){const [value,setValue]=useState(state);current=value;return <Coach state={value} update={fn=>setValue(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}} availability={availability} entryIntent={context} onEntryHandled={()=>{}}/>;}
  act(()=>root.render(<Harness/>));settle();return context;
}
it('offers Ask Coach as the final neutral Today row with the selected date and no writes',()=>{
  const state=createReturningUserFixture(0),open=vi.fn();act(()=>root.render(<TodayActionsSheet state={state} update={()=>{}} close={()=>{}} setDetail={()=>{}} date="2026-10-24" hasWorkout onAskCoach={open}/>));
  const row=host.querySelector('.today-ask-coach');expect(row.textContent).toContain('Need something else?');
  expect([...host.querySelectorAll('.today-actions-sheet>.list-row')].at(-1)).toBe(row);
  act(()=>row.click());expect(open).toHaveBeenCalledWith('2026-10-24');expect(saveState).not.toHaveBeenCalled();expect(AIService.coach).not.toHaveBeenCalled();
});
it('offers a safe choice for a draft and keeps it verbatim without injecting the new date',()=>{
  mount('Keep this unsent draft');const input=host.querySelector('textarea');
  expect(input.value).toBe('Keep this unsent draft');expect(document.querySelector('[role=dialog]').textContent).toContain('Your unsent draft will be discarded');expect(host.querySelector('.coach-day-context')).toBeNull();
  expect(AIService.coach).not.toHaveBeenCalled();act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Keep current chat').click());act(()=>vi.advanceTimersByTime(300));
  expect(input.value).toBe('Keep this unsent draft');expect(host.querySelector('.coach-day-context')).toBeNull();
});
it('saves date/identity with the submitted turn and passes it to Coach only after explicit Send',async()=>{
  const context=mount();expect(host.querySelector('textarea').value).toContain('24 October 2026');expect(AIService.coach).not.toHaveBeenCalled();
  const history=structuredClone(current.workouts),plan=structuredClone(current.program);
  await act(async()=>host.querySelector('form.coach-input').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(AIService.coach).toHaveBeenCalledOnce();expect(AIService.coach.mock.calls[0][2].requestContext.occurrenceId).toBe(context.occurrenceId);
  expect(current.conversations.at(-1).requestContext.date).toBe('2026-10-24');expect(current.program).toEqual(plan);expect(current.workouts).toEqual(history);
});
it('retains draft and context while the provider is unavailable',()=>{
  mount('Keep this draft',{state:'offline'});expect(host.querySelector('textarea').value).toBe('Keep this draft');expect(document.querySelector('[role=dialog]')).toBeTruthy();expect(host.querySelector('.coach-day-context')).toBeNull();expect(AIService.coach).not.toHaveBeenCalled();
});
it('starts a fresh contextual chat only after explicitly accepting the draft discard',()=>{
  mount('Keep this draft');expect(current.coachDraft).toBe('Keep this draft');
  act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Start new chat').click());settle();
  expect(host.querySelector('textarea').value).toContain('24 October 2026');expect(current.coachDraft).toContain('24 October 2026');
  expect(host.querySelector('.coach-day-context')).toBeTruthy();expect(AIService.coach).not.toHaveBeenCalled();
});
it('keeps the old transcript in history and sends no old transcript in a deliberate fresh Ask Coach chat',async()=>{
  mount('',{state:'ready'},true);expect(current.activeCoachConversationId).not.toBe('previous-chat');expect(current.conversations[0].user).toBe('Old context');
  expect(host.querySelector('.conversation').textContent).not.toContain('Old context');
  await act(async()=>host.querySelector('form.coach-input').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const submitted=AIService.coach.mock.calls[0][0];expect(submitted.activeCoachConversationId).not.toBe('previous-chat');
  const {coachContext}=await import('./domain.js');expect(coachContext(submitted).conversationHistory).toEqual([]);
});
