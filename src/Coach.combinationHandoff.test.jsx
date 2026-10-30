import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./useCoachAvailability.js',()=>({useCoachAvailability:()=>({state:'ready'})}));
vi.mock('./firebaseSyncClient.js',async original=>({...await original(),firebaseConfigurationStatus:()=> 'ready',firebaseConfigured:()=>true,getFirebaseSyncClient:async()=>null}));
import {RookRoot,Coach} from './App.jsx';
import {AIService} from './aiService.js';
import {coachQualityFixture} from './coachQuality.fixture.js';
import {saveState,loadState,serializeState} from './domain.js';
import {forgetStorageSession} from './localStateStorage.js';
import {MissedWorkoutCombine} from './MissedWorkoutCombine.jsx';
let host,root;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
  localStorage.clear();forgetStorageSession(localStorage);host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();forgetStorageSession(localStorage);vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===name||node.getAttribute('aria-label')===name);
const click=async name=>act(async()=>button(name).click());
async function fixture(){
  const state=coachQualityFixture({todayThird:true}),reply=await AIService.coach(state,'Združi oba zamujena treninga za 60 minut',{requireRemoteSuccess:true});
  state.conversations=[{id:'combine-entry',conversationId:state.activeCoachConversationId,createdAt:Date.now(),user:'Združi oba zamujena treninga za 60 minut',reply}];return state;
}
it('Coach opens only the two-workout recovery, applies the chosen single move atomically, and shows the applied receipt',async()=>{
  const state=await fixture();expect(saveState(state)).toBe(true);
  await act(async()=>root.render(<React.StrictMode><RookRoot/></React.StrictMode>));await click('COACH');await act(async()=>vi.advanceTimersByTime(350));
  expect(button('Preglej združen trening')).toBeDefined();await click('Preglej združen trening');
  expect(host.textContent).toContain('Make room for today');expect(host.textContent).not.toContain('Your updated schedule');expect(loadState().todayAdaptation).toBeNull();
  await click('CANCEL');await act(async()=>vi.advanceTimersByTime(400));expect(host.querySelector('.flexible-week-sheet')).toBeNull();expect(button('Preglej združen trening')).toBeDefined();
  await click('Preglej združen trening');expect(host.textContent).toContain('Make room for today');
  act(()=>host.querySelector('[data-combine-move-date="2026-09-13"]').click());expect(host.textContent).toContain('Your combined workout');
  await click('SAVE BOTH CHANGES');await act(async()=>vi.advanceTimersByTime(400));
  const saved=loadState();expect(saved.todayAdaptation.sourceSessions).toHaveLength(2);expect(saved.conversations[0].actionResult).toMatchObject({status:'applied',scope:'combined-occurrences',workoutId:saved.todayAdaptation.id});
  expect(Object.values(saved.flexibleWeek.sessions).find(session=>session.workoutId==='lower-source').scheduledDate).toBe('2026-09-13');expect(saved.program).toEqual(state.program);
  expect(button('Preglej združen trening')).toBeUndefined();expect(host.textContent).toContain('Združen trening je pripravljen');
});
it('a prepared local combination review can still open while the AI service is unavailable',async()=>{
  const state=await fixture(),setDetail=vi.fn();act(()=>root.render(<Coach state={state} update={()=>{}} setPage={()=>{}} setDetail={setDetail} availability={{state:'offline'}}/>));
  expect(button('Preglej združen trening').disabled).toBe(false);await click('Preglej združen trening');expect(setDetail).toHaveBeenCalledOnce();
});
it('a cancelled Coach request cannot be applied from a sheet that was already open',async()=>{
  let current=await fixture(),change;const before=serializeState(current),origin={entryId:'combine-entry',conversationId:current.activeCoachConversationId};
  const Header=({onBack,onClose})=><header><button onClick={onBack}>Back</button><button onClick={onClose}>Close</button></header>;
  function Owner(){const[state,setState]=useState(current);current=state;change=setState;return <MissedWorkoutCombine state={state} update={setState} close={()=>{}} Header={Header} onBack={()=>{}} initialRequest={state.conversations[0].reply.combineRequest} coachOrigin={origin}/>;}
  act(()=>root.render(<Owner/>));act(()=>host.querySelector('[data-combine-move-date="2026-09-13"]').click());
  act(()=>change(state=>({...state,conversations:state.conversations.map(entry=>({...entry,coachWorkflowStatus:'cancelled'}))})));
  await click('SAVE BOTH CHANGES');expect(host.textContent).toContain('This Coach review changed');expect(current.todayAdaptation).toBeNull();expect(current.flexibleWeek).toEqual(JSON.parse(before).flexibleWeek);expect(localStorage.getItem('lift-v2-state')).toBeNull();
});
