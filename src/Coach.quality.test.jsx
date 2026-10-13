import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Coach,useLiftState} from './App.jsx';
import {AIService} from './aiService.js';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState,loadState,readStartupState} from './domain.js';
import {applyCoachRequestResult,createCoachReplyCommit} from './coachRequestResult.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,change,leave;
beforeEach(()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(cb,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('scrollTo',()=>{});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){const state=createReturningUserFixture(0);state.profile.name='Before';state.activeCoachConversationId='current';state.coachConversationMeta={current:{createdAt:Date.now(),updatedAt:Date.now()}};state.coachDraft='Explain this workout';return state;}
function mount(initial){expect(saveState(initial)).toBe(true);const startup=readStartupState();
 let enter;
 function Owner(){let failed;[current,change,failed]=useLiftState(startup);const [active,setActive]=useState(false);leave=()=>setActive(false);enter=()=>setActive(true);
  return active?<Coach state={current} update={change} setPage={leave} setDetail={()=>{}}/>:<p>Other tab {failed?'Save failed':''}</p>;
 }act(()=>root.render(<React.StrictMode><Owner/></React.StrictMode>));act(()=>enter());
}
function enterMessage(){act(()=>{const input=host.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Explain this workout');input.dispatchEvent(new Event('input',{bubbles:true}));});}
function pendingState(){const state=fixture();state.conversations=[{id:'entry',conversationId:'current',user:'Question',reply:null,coachRequestId:'request'}];return state;}
const identity=state=>({profileId:state.profile.id,entryId:'entry',conversationId:'current',requestId:'request'});

it('a late reply merges with current durable data after Coach unmounts under StrictMode',async()=>{
 let resolve;vi.spyOn(AIService,'coach').mockImplementation(()=>new Promise(r=>{resolve=r;}));mount(fixture());enterMessage();
 await act(async()=>host.querySelector('[aria-label="Send message"]').click());
 expect(AIService.coach,host.textContent).toHaveBeenCalledOnce();const sentId=current.conversations.at(-1).id;
 await act(async()=>leave());act(()=>change(state=>{state.profile.name='Changed in Profile';state.coachDraft='New draft';return state;},{planVersion:false}));
 const program=structuredClone(current.program),history=structuredClone(current.workouts);
 await act(async()=>resolve({text:'Synthetic answer'}));
 expect(current.profile.name).toBe('Changed in Profile');expect(current.coachDraft).toBe('New draft');
 expect(current.program).toEqual(program);expect(current.workouts).toEqual(history);
 expect(current.conversations.at(-1)).toMatchObject({id:sentId,reply:{text:'Synthetic answer'}});
 expect(current.conversations.at(-1)).not.toHaveProperty('coachRequestId');
 const persisted=loadState();expect(persisted.profile).toEqual(current.profile);expect(persisted.conversations).toEqual(current.conversations);expect(persisted.coachDraft).toBe('New draft');
});
it('a late failure changes only its pending entry and retains intervening edits',async()=>{
 let reject;vi.spyOn(AIService,'coach').mockImplementation(()=>new Promise((resolve,r)=>{reject=r;}));mount(fixture());enterMessage();
 await act(async()=>host.querySelector('[aria-label="Send message"]').click());await act(async()=>leave());
 expect(AIService.coach,JSON.stringify({draft:current.coachDraft,messages:current.conversations.length})).toHaveBeenCalledOnce();
 act(()=>change(state=>{state.profile.name='New name';state.coachDraft='Keep this';return state;},{planVersion:false}));
 await act(async()=>reject(new Error('Synthetic offline')));
 expect(current.profile.name).toBe('New name');expect(current.coachDraft).toBe('Keep this');expect(current.conversations.at(-1)).toMatchObject({reply:null,requestError:true});
 expect(loadState().profile.name).toBe('New name');
});
it.each(['profileId','entryId','conversationId','requestId'])('rejects a stale %s without mutating any data',field=>{
 const state=pendingState(),before=structuredClone(state),id={...identity(state),[field]:'stale'};
 expect(applyCoachRequestResult(state,id,{reply:{text:'Wrong'}})).toBe(state);expect(applyCoachRequestResult(state,id,{requestError:true})).toBe(state);expect(state).toEqual(before);
});
it.each(['coachWorkflowStatus','coachReviewCancelled','combineReviewCancelled'])('never resurrects %s cancellation',field=>{
 const state=pendingState();state.conversations[0][field]=field==='coachWorkflowStatus'?'cancelled':true;
 expect(applyCoachRequestResult(state,identity(state),{reply:{text:'Obsolete'}})).toBe(state);
});
it('replayed updater uses one durable result even if the next write would fail',()=>{
 const state=pendingState(),persist=vi.fn().mockReturnValueOnce(true).mockReturnValue(false),commit=createCoachReplyCommit(identity(state),{text:'Answer'},persist);
 const first=commit.update(structuredClone(state)),replayed=commit.update(structuredClone(state));
 expect(replayed).toBe(first);expect(persist).toHaveBeenCalledOnce();expect(commit.options.persistedState).toBe(first);expect(commit.result.persistenceError).toBe(false);
 expect(commit.update(first)).toBe(first);expect(persist).toHaveBeenCalledOnce();
});
it('a rebased input merges new app changes rather than reusing an old saved snapshot',()=>{
 const state=pendingState(),persist=vi.fn(()=>true),commit=createCoachReplyCommit(identity(state),{text:'Answer'},persist);commit.update(state);
 const rebased=structuredClone(state);rebased.profile.name='Rebased';rebased.coachDraft='New';const next=commit.update(rebased);
 expect(next.profile.name).toBe('Rebased');expect(next.coachDraft).toBe('New');expect(persist).toHaveBeenCalledTimes(2);expect(state.profile.name).toBe('Before');
});
it('failed durability never publishes or mutates the reply',()=>{
 const state=pendingState(),before=structuredClone(state),commit=createCoachReplyCommit(identity(state),{text:'Answer'},()=>false);
 expect(commit.update(state)).toBe(state);expect(state).toEqual(before);expect(commit.options.persistedState).toBeUndefined();expect(commit.result).toMatchObject({applied:false,persistenceError:true});
});
it('successful replay clears a previous write failure and caches the durable result',()=>{
 const state=pendingState(),persist=vi.fn().mockReturnValueOnce(false).mockReturnValue(true),commit=createCoachReplyCommit(identity(state),{text:'Answer'},persist);
 expect(commit.update(structuredClone(state))).toEqual(state);expect(commit.result).toMatchObject({applied:false,persistenceError:true,state:null});
 const saved=commit.update(structuredClone(state));
 expect(saved.conversations[0].reply).toEqual({text:'Answer'});expect(commit.result).toMatchObject({applied:true,persistenceError:false});expect(commit.result.state).toBe(saved);expect(commit.options.persistedState).toBe(saved);
 expect(commit.update(structuredClone(state))).toBe(saved);expect(persist).toHaveBeenCalledTimes(2);expect(commit.result.persistenceError).toBe(false);
});
it.each(['profile','cancelled'])('an ineligible %s rebase clears the previously applied result',reason=>{
 const state=pendingState(),persist=vi.fn(()=>true),commit=createCoachReplyCommit(identity(state),{text:'Answer'},persist);
 commit.update(structuredClone(state));expect(commit.result.applied).toBe(true);
 const rebased=structuredClone(state);
 if(reason==='profile')rebased.profile.id='other-profile';else rebased.conversations[0].coachWorkflowStatus='cancelled';
 const before=structuredClone(rebased);
 expect(commit.update(rebased)).toBe(rebased);expect(rebased).toEqual(before);expect(persist).toHaveBeenCalledOnce();expect(commit.options.persistedState).toBeUndefined();expect(commit.result).toEqual({applied:false,persistenceError:false,state:null});
});
