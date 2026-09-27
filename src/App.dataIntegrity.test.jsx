import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {useLiftState} from './App.jsx';
import {blankState,serializeState,readStartupState,saveState} from './domain.js';
import {dataReliabilityFixture} from './dataReliability.fixture.js';
import {forgetStorageSession,deleteLocalState,PRIMARY_KEY,INSTALL_META_KEY,RECOVERY_KEY} from './localStateStorage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,latest,change,failed;
const snapshot=()=>[PRIMARY_KEY,INSTALL_META_KEY,RECOVERY_KEY].map(key=>localStorage.getItem(key));
function mount(startup,strict=false){
 function Owner(){[latest,change,failed]=useLiftState(startup);return <span>{latest.profile.onboardingComplete?'Training data':'Onboarding'}</span>;}
 const host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(strict?<React.StrictMode><Owner/></React.StrictMode>:<Owner/>));
}
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';localStorage.clear();forgetStorageSession(localStorage);vi.restoreAllMocks();});
const seed=()=>{const state=dataReliabilityFixture();localStorage.setItem(PRIMARY_KEY,serializeState(state));return readStartupState();};

it.each([false,true])('rejects a partial default root before publishing it, StrictMode=%s',strict=>{
 mount(seed(),strict);const before=structuredClone(latest),durable=snapshot();
 act(()=>change(()=>({...blankState(),conversations:before.conversations})));
 expect(latest).toEqual(before);expect(failed).toBe(true);expect(document.body.textContent).toBe('Training data');expect(snapshot()).toEqual(durable);
 act(()=>change(current=>{current.profile.name+=' changed';return current;}));
 expect(latest.profile.onboardingComplete).toBe(true);expect(JSON.parse(localStorage.getItem(PRIMARY_KEY)).profile.name).toBe(latest.profile.name);
});
it('rejects a partial reset even if a caller claims it was already saved',()=>{
 mount(seed());const before=structuredClone(latest),durable=snapshot(),next={...blankState(),conversations:latest.conversations};
 act(()=>change(()=>next,{replacement:true,persistedState:next}));expect(latest).toEqual(before);expect(snapshot()).toEqual(durable);
});
it('allows a confirmed durable replacement with a different profile identity',()=>{
 mount(seed());const next=dataReliabilityFixture();next.profile.name='Explicit imported profile';
 expect(saveState(next,{replacement:true,reason:'backup-restore:user-confirmed'})).toBe(true);
 act(()=>change(()=>next,{replacement:true,persistedState:next,planVersion:false}));expect(latest.profile.id).toBe(next.profile.id);expect(failed).toBe(false);
});
it('a verified restore receipt cannot authorize publishing a different default profile',()=>{
 mount(seed());const before=structuredClone(latest),restored=dataReliabilityFixture();expect(saveState(restored,{replacement:true,reason:'backup-restore:user-confirmed'})).toBe(true);const durable=snapshot();
 act(()=>change(()=>blankState(),{replacement:true,persistedState:restored}));expect(latest).toEqual(before);expect(failed).toBe(true);expect(snapshot()).toEqual(durable);
});
it.each(['ready','empty'])('a delayed %s hydration result cannot publish or overwrite a newer saved root',status=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const startup=status==='empty'?readStartupState():seed(),newer=status==='empty'?dataReliabilityFixture():structuredClone(startup.state);newer.activeWorkout.exercises[0].sets[0].reps=19;
 expect(saveState(newer)).toBe(true);const before=snapshot();
 expect(()=>mount(startup)).toThrow(/stale-hydration/);expect(document.body.textContent).toBe('');expect(snapshot()).toEqual(before);
 act(()=>root.unmount());root=null;mount(readStartupState());expect(latest.activeWorkout.exercises[0].sets[0].reps).toBe(19);
 act(()=>change(s=>{s.ai.available=false;return s;}));expect(JSON.parse(localStorage.getItem(PRIMARY_KEY)).activeWorkout.exercises[0].sets[0].reps).toBe(19);
});
it('a failed read between hydration and mount cannot publish or persist the old result',()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const startup=seed();
 const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('Temporarily unavailable','SecurityError');});expect(readStartupState().status).toBe('error');get.mockRestore();const before=snapshot();
 expect(()=>mount(startup)).toThrow(/stale-hydration/);expect(document.body.textContent).toBe('');expect(snapshot()).toEqual(before);
});
it('StrictMode and two queued legitimate mutations retain both updates',()=>{
 mount(seed(),true);const id=latest.profile.id,workouts=structuredClone(latest.workouts);
 act(()=>{change(s=>{s.profile.name='Changed name';return s;});change(s=>{s.profile.units='kg';return s;});});
 const saved=JSON.parse(localStorage.getItem(PRIMARY_KEY));expect(saved.profile).toMatchObject({id,name:'Changed name',units:'kg',onboardingComplete:true});expect(saved.workouts).toEqual(workouts);
});
it('a confirmed deletion receipt still permits a fresh untouched landing',async()=>{
 seed();await deleteLocalState();const before=snapshot();mount(readStartupState(),true);
 expect(document.body.textContent).toBe('Onboarding');expect(snapshot()).toEqual(before);
});
