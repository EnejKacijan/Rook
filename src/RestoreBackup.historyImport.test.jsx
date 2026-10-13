import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {useLiftState,RestoreBackupSheet,HistoricalWorkoutImportScreen} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState,readStartupState,serializeState,STORAGE_KEY} from './domain.js';
import {buildBackupArchive} from './backup.js';
import {hevyCsv,hevyRow} from '../scripts/history-import-fixtures.mjs';

const receipt=vi.hoisted(()=>({state:null,snapshot:null,raw:null,calls:0}));
// Real JSON archive, validation and recoverable state transaction. Only the
// empty photo-store stage is isolated; these tests do not simulate photo blobs.
vi.mock('./backup.js',async importOriginal=>{
 const actual=await importOriginal();
 return {...actual,commitPreparedRestore:async(prepared,options)=>{
  const {finishRestoreTransaction}=await import('./restoreTransaction.js');
  const result=await actual.commitPreparedRestore(prepared,{...options,stagePhotos:async()=>{},finishRestore:args=>finishRestoreTransaction({...args,discardSnapshot:async()=>{}})});
  receipt.calls++;receipt.state=result;receipt.snapshot=structuredClone(result);receipt.raw=serializeState(result);return result;
 }};
});
// Preserve parser/hash/apply behavior and the worker's strict stale-state guard;
// only replace transport, which jsdom cannot execute. Browser QA uses the worker.
vi.mock('./historyImportClient.js',async()=>{
 const {HistoryImportBatch}=await import('./historyImportBatch.js');
 return {createHistoryImportClient:()=>{
  const batch=new HistoryImportBatch();return {close:vi.fn(),request:async(type,payload)=>{
   if(type==='file')return batch.read(payload.files,payload.options);
   if(type==='parse')return batch.parse(payload.settings,payload.state);
   if(type==='apply'){
    if(payload.persisted!==serializeState(payload.state))throw Error('ROOK data changed in another tab. Reopen the import to review the current history; nothing was overwritten.');
    const transaction=batch.apply(payload.state,payload.options);return {...transaction,serialized:serializeState(transaction.state)};
   }
   throw Error('Unexpected local import test operation');
  }};
 }};
});

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current,change,failed,archive,backupSource;
beforeEach(async()=>{
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('requestAnimationFrame',callback=>{callback(0);return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};
 Object.assign(receipt,{state:null,snapshot:null,raw:null,calls:0});
 backupSource=createReturningUserFixture(2);backupSource.profile.id='synthetic-restore-import-owner';
 archive=await buildBackupArchive(backupSource,[]);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function mount(strict=false,withUi=true){
 const initial=createReturningUserFixture(2);initial.profile.id=backupSource.profile.id;
 expect(saveState(initial)).toBe(true);const startup=readStartupState();
 function Owner(){[current,change,failed]=useLiftState(startup);const [mode,setMode]=useState('restore');
  if(!withUi)return <p>{failed?'Save failed':'Ready'}</p>;
  return mode==='restore'?<RestoreBackupSheet state={current} update={change} close={()=>setMode('import')}/>:<HistoricalWorkoutImportScreen state={current} update={change} close={()=>setMode('restore')}/>;
 }
 act(()=>root.render(strict?<React.StrictMode><Owner/></React.StrictMode>:<Owner/>));
}
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const click=async text=>{expect(button(text),text).toBeDefined();await act(async()=>button(text).click());};
async function choose(input,file){Object.defineProperty(input,'files',{configurable:true,value:[file]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));}
async function restore(){
 await choose(host.querySelector('input[type=file]'),{name:archive.filename,size:archive.bytes.byteLength,arrayBuffer:async()=>archive.bytes.buffer});
 expect(host.querySelector('h1').textContent).toBe('ROOK backup');await click('RESTORE & REPLACE');
 expect(host.querySelector('h1').textContent).toBe('ROOK has been restored.');expect(receipt.calls).toBe(1);
}
async function previewImport(){
 await click('DONE');const hevy=[...host.querySelectorAll('button')].find(node=>node.textContent.includes('Hevy'));await act(async()=>hevy.click());
 const text=hevyCsv([hevyRow({set_index:0,reps:8}),hevyRow({set_index:1,reps:7})],'lb'),buffer=new TextEncoder().encode(text).buffer;
 await choose(host.querySelector('input[type=file]'),{name:'authored-synthetic-hevy.csv',size:buffer.byteLength,arrayBuffer:async()=>buffer});
 expect(host.querySelector('h1').textContent).toBe('Review import');expect(button('IMPORT 1 WORKOUT')).toBeDefined();
}
it.each([false,true])('actual Restore -> Import works without reload and preserves the saved receipt, StrictMode=%s',async strict=>{
 mount(strict);await restore();
 expect(failed).toBe(false);expect(current.workouts).toHaveLength(8);expect(receipt.state).toEqual(receipt.snapshot);
 expect(current.planVersions).toEqual(receipt.snapshot.planVersions);expect(current.program.id).toBe(receipt.snapshot.program.id);
 expect(serializeState(current)).toBe(localStorage.getItem(STORAGE_KEY));
 const history=structuredClone(current.workouts);await previewImport();await click('IMPORT 1 WORKOUT');
 expect(host.querySelector('[role=alert]')).toBeNull();expect(host.querySelector('h1').textContent).toBe('1 workout imported');
 expect(current.workouts).toHaveLength(9);expect(current.workouts.filter(workout=>history.some(old=>old.id===workout.id))).toEqual(history);
 const imported=current.workouts.find(workout=>!history.some(old=>old.id===workout.id));
 expect(imported.exercises[0].sets.map(set=>set.reps)).toEqual([8,7]);expect(imported.exercises[0].sets[0].weight).toBeCloseTo(185*0.45359237);
 expect(receipt.state).toEqual(receipt.snapshot);expect(serializeState(current)).toBe(localStorage.getItem(STORAGE_KEY));
});
it('external persisted results remain immutable and normalization differences are durably saved',()=>{
 mount(false,false);const result=structuredClone(current);result.profile.equipment=['dumbbells'];
 expect(saveState(result)).toBe(true);const immutableReceipt=structuredClone(result),rawReceipt=serializeState(result);
 act(()=>change(()=>result,{persistedState:result,planVersion:false}));
 expect(result).toEqual(immutableReceipt);expect(current.profile.equipment).toEqual(current.gymProfiles.find(gym=>gym.id===current.defaultGymProfileId).equipment);
 expect(serializeState(current)).toBe(localStorage.getItem(STORAGE_KEY));expect(localStorage.getItem(STORAGE_KEY)).not.toBe(rawReceipt);expect(failed).toBe(false);
});
it('still rejects a genuine intervening storage change without importing or overwriting it',async()=>{
 mount();await restore();await previewImport();const other=structuredClone(current);other.profile.name='Changed elsewhere';expect(saveState(other)).toBe(true);const durable=localStorage.getItem(STORAGE_KEY);
 await click('IMPORT 1 WORKOUT');expect(host.querySelector('[role=alert]').textContent).toContain('changed in another tab');
 expect(host.querySelector('h1').textContent).toBe('Review import');expect(current.workouts).toHaveLength(8);expect(localStorage.getItem(STORAGE_KEY)).toBe(durable);
});
