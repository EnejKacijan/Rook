import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {hydrateStoredState,saveState,serializeState,startWorkout} from './domain.js';
import {readLocalState,PRIMARY_KEY} from './localStateStorage.js';
import {ensureAccountSyncLedger,readAccountSyncLedger} from './accountSyncOutbox.js';
import {planSyncReconciliation,syncEntities} from './accountSyncModel.js';
import {resolveAccountStartup} from './accountStartup.js';
import {saveWorkoutTemplate,templateDraft} from './savedWorkouts.js';
import {applyFlexibleWeek,missedFlexibleSessions,proposeFlexibleWeek} from './flexibleWeek.js';
import {createCustomExercise} from './customExercises.js';
import {useAccountSync} from './useAccountSync.js';

const firebase=vi.hoisted(()=>({client:null,cloud:null,link:vi.fn()}));
vi.mock('./firebaseSyncClient.js',()=>({
  firebaseConfigurationStatus:()=> 'ready',
  firebaseConfigured:()=>true,
  getFirebaseSyncClient:async()=>firebase.client,
  createFirebaseSyncAdapter:()=>firebase.cloud,
  resolveFirebaseIdentity:async client=>({user:client.auth.currentUser,created:false}),
  linkGoogleAnonymousAccount:(...args)=>firebase.link(...args),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{
  if(root)act(()=>root.unmount());
  host?.remove();root=null;host=null;
  localStorage.clear();
  firebase.client=null;firebase.cloud=null;firebase.link.mockReset();
  vi.useRealTimers();
});

function cloud() {
  let profileId=null,offline=true;
  const entities=new Map(),writes=[];
  return {
    entities,writes,
    setOnline:()=>{offline=false;},
    async read(){
      if(offline)throw Object.assign(new Error('Firestore offline'),{code:'unavailable'});
      return {profileId,accountSchemaVersion:profileId?1:null,entities:new Map(entities)};
    },
    async establish(uid,id){if(profileId&&profileId!==id)throw Error('Lineage conflict');profileId=id;},
    async write(uid,id,proposal,mutationId){
      if(profileId!==id)throw Error('Lineage conflict');
      const prior=entities.get(proposal.key);
      if(prior?.lastMutationId===mutationId)return prior;
      const record={syncSchemaVersion:1,profileId:id,domain:proposal.entity?.domain||proposal.key.split(':')[0],
        entityId:proposal.entity?.entityId||JSON.parse(proposal.key.slice(proposal.key.indexOf(':')+1)),
        ordinal:proposal.entity?.ordinal??prior?.ordinal??null,revision:(prior?.revision||0)+1,
        lastMutationId:mutationId,deleted:proposal.operation==='delete',digest:proposal.operation==='delete'?null:proposal.entity.digest,
        value:proposal.operation==='delete'?null:proposal.entity.value};
      entities.set(proposal.key,record);writes.push(proposal.key);return record;
    },
  };
}

function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),get length(){return values.size;},key:index=>[...values.keys()][index]??null};
}

async function waitForState(read,expected,timeout=3000) {
  const until=Date.now()+timeout;
  while(Date.now()<until){
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
    if(read().state===expected)return;
  }
  throw new Error(`Expected ${expected}; got ${JSON.stringify({state:read().state,category:read().category,pendingCount:read().pendingCount})}`);
}

it('upgrades a populated local profile in place while Firestore is offline, then backs it up once and reloads',async()=>{
  localStorage.clear();
  // Keep the historical fixture independent of the date the suite is run.
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-01T12:00:00'));
  let state=createReturningUserFixture(1);
  vi.useRealTimers();
  state.program.trainingBlock.startDate='2026-09-28';
  state.program.createdAt='2026-09-28T00:00:00';
  const missed=missedFlexibleSessions(state,'2026-10-01');
  expect(missed.length).toBeGreaterThan(0);
  const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:missed[0].logicalSessionId,toDate:'2026-10-02'},'2026-10-01');
  expect(proposal.status).toBe('ready');
  state=applyFlexibleWeek(state,proposal).state;
  state=saveWorkoutTemplate(state,{...templateDraft(state.workouts[0],state),name:'My saved workout'},{id:'saved-workout-id'});
  expect(createCustomExercise(state,{id:'custom-exercise-id',name:'My cable station',equipment:['cables'],primaryMuscle:'back'}).status).toBe('created');
  state.workouts[0].photoId='local-photo-id';
  state.activeWorkout=startWorkout(state,state.program.days[0]);
  state.profile.units='lb';
  state.profile.restTimerNotificationsEnabled=true;
  state.dataSafety.lastBackupCreatedAt='2026-09-28T12:00:00.000Z';
  state=hydrateStoredState(state);
  expect(saveState(state,{storage:localStorage,reason:'existing-profile-test'})).toBe(true);
  const before=readLocalState(localStorage,hydrateStoredState).state,raw=localStorage.getItem(PRIMARY_KEY),profileId=state.profile.id;
  expect(serializeState(state)).toBe(raw);
  ensureAccountSyncLedger(localStorage,profileId,{accountUid:'anonymous-uid'});
  firebase.client={auth:{currentUser:{uid:'anonymous-uid',isAnonymous:true}},
    authApi:{onAuthStateChanged:()=>()=>{}}};
  firebase.cloud=cloud();
  firebase.link.mockImplementation(async client=>{
    const user={uid:client.auth.currentUser.uid,isAnonymous:false,email:'owner@example.com'};
    client.auth.currentUser=user;
    return {status:'linked',uid:user.uid,user};
  });
  let current;
  const Harness=()=>{current=useAccountSync({state,update:vi.fn(),persistenceFailed:false});return null;};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<Harness/>));
  await waitForState(()=>current,'offline');
  expect(current.canSecure).toBe(true);
  let result;
  await act(async()=>{result=await current.secureWithGoogle();});
  expect(result).toMatchObject({status:'linked',uid:'anonymous-uid'});
  expect(firebase.link).toHaveBeenCalledOnce();
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  expect(readLocalState(localStorage,hydrateStoredState).state).toEqual(before);
  expect(current.linked).toBe(true);
  await waitForState(()=>current,'offline');
  firebase.cloud.setOnline();
  await act(async()=>window.dispatchEvent(new Event('online')));
  await waitForState(()=>current,'synced',5000);
  expect(current.pendingCount).toBe(0);
  expect(firebase.cloud.entities.size).toBe(syncEntities(before).size);
  expect([...firebase.cloud.entities.values()].filter(item=>item.domain==='workouts').every(item=>!('photoId' in item.value))).toBe(true);
  expect(new Set(firebase.cloud.writes).size).toBe(firebase.cloud.writes.length);
  expect(readAccountSyncLedger(localStorage,profileId)).toMatchObject({accountUid:'anonymous-uid',pending:[]});
  expect(planSyncReconciliation({localEntities:syncEntities(before),cloudEntities:firebase.cloud.entities,
    acknowledged:new Map(Object.entries(readAccountSyncLedger(localStorage,profileId).acknowledged))}).blocked).toEqual([]);
  expect(readLocalState(localStorage,hydrateStoredState).state).toEqual(before);
  const cleanDevice=memoryStorage();
  const fresh=await resolveAccountStartup({status:'empty'}, {
    storage:cleanDevice,configured:()=>true,getClient:async()=>firebase.client,getAdapter:()=>firebase.cloud,
    resolveIdentity:async()=>({user:firebase.client.auth.currentUser,created:false}),
    readLocal:store=>readLocalState(store,hydrateStoredState),
    save:(next,options)=>saveState(next,{...options,storage:cleanDevice}),
  });
  expect(fresh.status).toBe('ready');
  expect(fresh.state.profile.id).toBe(profileId);
  expect(fresh.state.profile.onboardingComplete).toBe(true);
  expect(fresh.state.program.id).toBe(before.program.id);
  expect(fresh.state.flexibleWeek).toEqual(before.flexibleWeek);
  expect(fresh.state.activeWorkout.id).toBe(before.activeWorkout.id);
  expect(fresh.state.workouts.map(item=>item.id)).toEqual(before.workouts.map(item=>item.id));
  expect(fresh.state.savedWorkoutTemplates.map(item=>item.id)).toEqual(['saved-workout-id']);
  expect(fresh.state.customExercises.map(item=>item.id)).toEqual(['custom-exercise-id']);
  expect(fresh.state.workouts[0].photoId).toBeUndefined();
  await act(async()=>root.unmount());root=null;
  root=createRoot(host);
  await act(async()=>root.render(<Harness/>));
  await waitForState(()=>current,'synced',5000);
  expect(firebase.cloud.writes.length).toBe(firebase.cloud.entities.size);
  const after=readLocalState(localStorage,hydrateStoredState).state;
  expect(after.profile.id).toBe(profileId);
  expect(after.program).toEqual(before.program);
  expect(after.flexibleWeek).toEqual(before.flexibleWeek);
  expect(after.activeWorkout).toEqual(before.activeWorkout);
  expect(after.workouts.map(item=>item.id)).toEqual(before.workouts.map(item=>item.id));
  expect(after.savedWorkoutTemplates.map(item=>item.id)).toEqual(['saved-workout-id']);
  expect(after.customExercises.map(item=>item.id)).toEqual(['custom-exercise-id']);
  expect(after.workouts[0].photoId).toBe('local-photo-id');
  expect(after.profile).toEqual(before.profile);
  expect(after.profile.onboardingComplete).toBe(true);
});

async function openLocalAccount(link){
  localStorage.clear();
  const state=hydrateStoredState(createReturningUserFixture(0));
  expect(saveState(state,{storage:localStorage,reason:'existing-profile-test'})).toBe(true);
  const raw=localStorage.getItem(PRIMARY_KEY);
  ensureAccountSyncLedger(localStorage,state.profile.id,{accountUid:'anonymous-uid'});
  firebase.client={auth:{currentUser:{uid:'anonymous-uid',isAnonymous:true}},authApi:{onAuthStateChanged:()=>()=>{}}};
  firebase.cloud=cloud();firebase.link.mockImplementation(link);
  let current;
  const Harness=()=>{current=useAccountSync({state,update:vi.fn(),persistenceFailed:false});return null;};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<Harness/>));
  await waitForState(()=>current,'offline');
  return {sync:()=>current,raw,state};
}

it('keeps the same local account after popup cancellation or provider failure',async()=>{
  const {sync,raw,state}=await openLocalAccount(async()=>{throw Object.assign(new Error('Canceled'),{code:'auth/popup-closed-by-user'});});
  await expect(sync().secureWithGoogle()).rejects.toMatchObject({code:'auth/popup-closed-by-user'});
  firebase.link.mockImplementationOnce(async()=>{throw Object.assign(new Error('Network'),{code:'auth/network-request-failed'});});
  await expect(sync().secureWithGoogle()).rejects.toMatchObject({code:'auth/network-request-failed'});
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  expect(readLocalState(localStorage,hydrateStoredState).state.profile.id).toBe(state.profile.id);
  expect(firebase.client.auth.currentUser).toMatchObject({uid:'anonymous-uid',isAnonymous:true});
  expect(sync().canSecure).toBe(true);
});

it('does not merge an already-used Google credential, and a different account can retry',async()=>{
  const {sync,raw,state}=await openLocalAccount(async()=>({status:'existing-account-conflict',uid:'anonymous-uid'}));
  expect(await sync().secureWithGoogle()).toMatchObject({status:'existing-account-conflict'});
  expect(sync().linked).toBe(false);
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  firebase.link.mockImplementationOnce(async client=>{
    client.auth.currentUser={uid:'anonymous-uid',isAnonymous:false,email:'another@example.com'};
    return {status:'linked',uid:'anonymous-uid',user:client.auth.currentUser};
  });
  await act(async()=>expect(await sync().secureWithGoogle()).toMatchObject({status:'linked'}));
  expect(sync().linked).toBe(true);
  expect(readLocalState(localStorage,hydrateStoredState).state.profile.id).toBe(state.profile.id);
});

it('rejects a stale provider callback and prevents rapid duplicate account actions',async()=>{
  let resolveLink;
  const {sync,raw}=await openLocalAccount(()=>new Promise(resolve=>{resolveLink=resolve;}));
  const first=sync().secureWithGoogle();
  await expect(sync().secureWithGoogle()).rejects.toThrow(/current account action/);
  expect(firebase.link).toHaveBeenCalledOnce();
  firebase.client.auth.currentUser={uid:'different-uid',isAnonymous:false};
  resolveLink({status:'linked',uid:'anonymous-uid',user:{uid:'anonymous-uid',isAnonymous:false}});
  await expect(first).rejects.toThrow(/Account changed during linking/);
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  expect(sync().linked).toBe(false);
});

it('keeps the saved profile after reload interrupts a pending provider callback',async()=>{
  let resolveLink;
  const {sync,raw,state}=await openLocalAccount(()=>new Promise(resolve=>{resolveLink=resolve;}));
  const pending=sync().secureWithGoogle();
  await act(async()=>root.unmount());root=null;
  firebase.client.auth.currentUser={uid:'anonymous-uid',isAnonymous:false,email:'owner@example.com'};
  resolveLink({status:'linked',uid:'anonymous-uid',user:firebase.client.auth.currentUser});
  await expect(pending).rejects.toThrow(/Account changed during linking/);
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  expect(readLocalState(localStorage,hydrateStoredState).state.profile.id).toBe(state.profile.id);
  const startup=await resolveAccountStartup(readLocalState(localStorage,hydrateStoredState),{storage:localStorage});
  expect(startup.status).toBe('ready');
  expect(startup.state.profile.onboardingComplete).toBe(true);
});

it('never starts Google linking from an unreadable local profile',async()=>{
  const {sync}=await openLocalAccount(async()=>({status:'linked'}));
  localStorage.setItem(PRIMARY_KEY,'{invalid');
  await expect(sync().secureWithGoogle()).rejects.toThrow();
  expect(firebase.link).not.toHaveBeenCalled();
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('{invalid');
});
