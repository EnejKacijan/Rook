import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Coach} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState,isoDay,startWorkout,serializeState,deserializeState,coachContext} from './domain.js';
import {AIService} from './aiService.js';
import {createCoachVisitTracker,pendingCoachWorkflows} from './coachConversations.js';
import {createCoachDayContext} from './coachDayContext.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
vi.mock('./aiService.js',async original=>({...await original(),AIService:{...(await original()).AIService,coach:vi.fn()}}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current,page,tracker,change;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T12:00:00'));
  saveState.mockReset().mockReturnValue(true);AIService.coach.mockReset().mockResolvedValue({text:'New reply.'});
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}]);HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(){
  const state=createReturningUserFixture(0);state.activeCoachConversationId='old';state.coachDraft='';
  state.coachConversationMeta={old:{id:'old',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:isoDay()}};
  state.conversations=[{id:'old-message',conversationId:'old',createdAt:Date.now(),user:'Earlier question',reply:{text:'Earlier answer.'}}];return state;
}
function mount(initial,entryIntent){
  tracker=createCoachVisitTracker();
  function Owner(){
    const[state,setState]=useState(initial),[open,setOpen]=useState(true);current=state;page=setOpen;
    change=fn=>setState(previous=>fn(structuredClone(previous)));
    return open?<Coach state={state} update={change} setPage={()=>setOpen(false)} setDetail={()=>{}} visitTracker={tracker} entryIntent={entryIntent} onEntryHandled={()=>{}}/>:<button onClick={()=>setOpen(true)}>Return to Coach</button>;
  }
  act(()=>root.render(<Owner/>));act(()=>vi.advanceTimersByTime(20));
}
const button=name=>[...(document.querySelector('.coach-new-confirm')||host).querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent.trim()===name);
const click=name=>{expect(button(name)).toBeTruthy();act(()=>button(name).click());};
const settle=()=>act(()=>vi.advanceTimersByTime(320));
const type=value=>act(()=>{const input=host.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const returnToCoach=()=>{act(()=>page(false));click('Return to Coach');};
const history=id=>{click('Chat history');act(()=>vi.advanceTimersByTime(5));act(()=>host.querySelector(`[title="${id}"]`).closest('button').click());};

it('clean cold entry is blank, has a continuation link, and keeps the transcript in history without sending',()=>{
  const before=fixture();mount(before);expect(current.activeCoachConversationId).not.toBe('old');expect(host.querySelector('.conversation').textContent).not.toContain('Earlier question');
  expect(host.querySelector('textarea').value).toBe('');expect(button('Continue previous chat')).toBeTruthy();expect(current.conversations).toEqual(before.conversations);expect(AIService.coach).not.toHaveBeenCalled();
});
it('warm tab/foreground returns keep the same conversation even after midnight, with no draft required',async()=>{
  mount(fixture());type('New question');await act(async()=>button('Send message').click());const id=current.activeCoachConversationId;
  vi.setSystemTime(new Date('2026-10-28T12:00:00'));act(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
  returnToCoach();expect(current.activeCoachConversationId).toBe(id);expect(host.querySelector('.conversation').textContent).toContain('New reply.');expect(AIService.coach).toHaveBeenCalledOnce();
});
it('an unrelated active workout does not force a clean old chat on cold entry',()=>{
  const before=fixture();before.activeWorkout=startWorkout(before,before.program.days[0]);const active=structuredClone(before.activeWorkout);
  mount(before);expect(current.activeCoachConversationId).not.toBe('old');expect(current.activeWorkout).toEqual(active);
});
it('reusing an empty chat on cold entry clears its abandoned day chip and whitespace draft',()=>{
  const before=fixture();before.conversations=[];before.coachDraft='  ';
  before.coachConversationMeta.old.dayContext=createCoachDayContext(before,'2026-10-29');
  mount(before);expect(current.activeCoachConversationId).toBe('old');expect(current.coachDraft).toBe('');
  expect(host.querySelector('textarea').value).toBe('');expect(host.querySelector('.coach-day-context')).toBeNull();
  expect(current.coachConversationMeta.old.dayContext).toBeUndefined();expect(AIService.coach).not.toHaveBeenCalled();
});
it.each(['draft','pending','interrupted'])('cold entry preserves unfinished %s without a modal or auto-send',kind=>{
  const before=fixture();if(kind==='draft')before.coachDraft='Unsent\nquestion';
  else before.conversations[0].reply=kind==='interrupted'?null:{text:'Choose workouts',combineRequest:{step:'sources',choices:[{id:'upper',label:'Upper A'},{id:'lower',label:'Lower B'}]}};
  mount(before);expect(current.activeCoachConversationId).toBe('old');expect(current.coachDraft).toBe(before.coachDraft);expect(host.querySelector('.conversation').textContent).toContain('Earlier question');
  expect(document.querySelector('.coach-new-confirm')).toBeNull();expect(AIService.coach).not.toHaveBeenCalled();
});
it('failed first entry keeps the cold-visit decision until a successful retry',()=>{
  saveState.mockReturnValue(false);const before=fixture();mount(before);expect(current).toEqual(before);expect(tracker.isColdStart(before.profile.id)).toBe(true);
  saveState.mockReturnValue(true);click('Try again');const id=current.activeCoachConversationId;expect(id).not.toBe('old');expect(tracker.isColdStart(before.profile.id)).toBe(false);
  returnToCoach();expect(current.activeCoachConversationId).toBe(id);expect(current.conversations).toEqual(before.conversations);
});
it('Continue previous chat reopens text explicitly without sending or replaying earlier actions',()=>{
  mount(fixture());click('Continue previous chat');expect(current.activeCoachConversationId).toBe('old');expect(host.querySelector('.conversation').textContent).toContain('Earlier answer.');
  expect(host.querySelector('textarea').value).toBe('');expect(current.conversations[0].coachActionsArchived).toBe(true);expect(AIService.coach).not.toHaveBeenCalled();
});
it('history continuation keeps old proposals inert and only a newly generated proposal can be applied',async()=>{
  const before=fixture(),day=before.program.days[0];day.weekday='Tue';day.exercises[0].sets=day.exercises[0].sets.slice(0,2);
  const action={type:'adapt-today',programDayId:day.id,targetDate:isoDay(),exerciseIds:day.exercises.map(e=>e.exerciseId),setTargets:[{exerciseId:day.exercises[0].exerciseId,sets:1}],minutes:40,label:'USE WORKOUT'};
  before.conversations.unshift({id:'historic-proposal',conversationId:'historic',createdAt:Date.now()-86400000,user:'Old workout proposal',reply:{text:'An old proposal',action}});
  mount(before);history('Old workout proposal');expect(host.querySelector('textarea')).toBeNull();expect(button('USE SHORTER WORKOUT')).toBeFalsy();
  click('Continue chat');expect(current.activeCoachConversationId).toBe('historic');expect(host.querySelector('textarea')).toBeTruthy();expect(button('USE SHORTER WORKOUT')).toBeFalsy();expect(host.querySelector('.coach-history-action').textContent).toContain('Read-only');
  AIService.coach.mockResolvedValueOnce({text:'Updated proposal',action});type('Please update this using my current plan');await act(async()=>button('Send message').click());
  const sent=AIService.coach.mock.calls[0][0];expect(sent.program.days[0].exercises[0].sets).toHaveLength(2);expect(coachContext(sent).conversationHistory[0].action).toBeNull();
  expect(button('USE SHORTER WORKOUT').disabled).toBe(false);click('USE SHORTER WORKOUT');
  expect(current.conversations.at(-1).actionResult).toMatchObject({status:'applied'});expect(current.todayAdaptation).not.toBeNull();expect(current.conversations.find(e=>e.id==='historic-proposal').coachWorkflowStatus).toBe('cancelled');
});
it('continuation confirms before replacing a current draft and failed persistence is retryable',()=>{
  mount(fixture());const fresh=current.activeCoachConversationId;type('Keep my current draft');history('Earlier question');click('Continue chat');
  expect(document.querySelector('.coach-new-confirm h1').textContent).toBe('Continue this chat?');click('Keep current chat');settle();expect(current.activeCoachConversationId).toBe(fresh);expect(current.coachDraft).toBe('Keep my current draft');
  click('Continue chat');const snapshot=structuredClone(current);saveState.mockReturnValue(false);click('Continue chat');expect(current).toEqual(snapshot);expect(document.querySelector('.coach-new-confirm [role="alert"]').textContent).toContain('unchanged');
  saveState.mockReturnValue(true);click('Continue chat');expect(current.activeCoachConversationId).toBe('old');expect(current.coachDraft).toBe('');expect(AIService.coach).not.toHaveBeenCalled();
});
it('continuing the active chat from History keeps its draft and actionable pending review',()=>{
  const before=fixture();before.coachDraft='Keep this';before.conversations[0].reply={text:'Choose',combineRequest:{step:'sources',choices:[{id:'upper',label:'Upper A'}]}};
  mount(before);history('Earlier question');click('Continue chat');expect(document.querySelector('.coach-new-confirm')).toBeNull();expect(current.activeCoachConversationId).toBe('old');expect(host.querySelector('textarea').value).toBe('Keep this');expect(pendingCoachWorkflows(current)).toHaveLength(1);expect(current.conversations[0].coachActionsArchived).toBeUndefined();
});
it('Ask Coach draft and day context survive warm returns and cold reload, then remain scoped for follow-up',async()=>{
  const before=fixture(),context=createCoachDayContext(before,'2026-10-29');mount(before,context);
  expect(host.querySelector('.coach-day-context')).toBeTruthy();expect(AIService.coach).not.toHaveBeenCalled();
  returnToCoach();expect(host.querySelector('.coach-day-context')).toBeTruthy();expect(host.querySelector('textarea').value).toContain('29 October 2026');
  const saved=deserializeState(serializeState(current));act(()=>root.unmount());root=createRoot(host);mount(saved);
  expect(host.querySelector('.coach-day-context')).toBeTruthy();await act(async()=>button('Send message').click());
  expect(AIService.coach.mock.calls[0][2].requestContext.date).toBe('2026-10-29');expect(host.querySelector('.coach-day-context')).toBeTruthy();
  type('A follow-up');await act(async()=>button('Send message').click());expect(AIService.coach.mock.calls[1][2].requestContext.date).toBe('2026-10-29');
  click('Remove context for 29 October 2026');returnToCoach();expect(host.querySelector('.coach-day-context')).toBeNull();
});
