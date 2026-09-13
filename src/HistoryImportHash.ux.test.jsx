import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HistoricalWorkoutImportScreen } from './App.jsx';
import { blankState, serializeState, STORAGE_KEY } from './domain.js';
import { hevyCsv } from '../scripts/history-import-fixtures.mjs';

const fault = vi.hoisted(() => ({ hash:false }));
vi.mock('@noble/hashes/sha2.js', async importOriginal => {
  const actual = await importOriginal();
  return {...actual,sha256:bytes => { if(fault.hash)throw new Error('Internal hash implementation');return actual.sha256(bytes); }};
});
// Replace only worker transport (not parsing, hashing, decisions or Apply).
// The actual worker is covered by the LAN browser import.
vi.mock('./historyImportClient.js', async () => {
  const {HistoryImportBatch} = await import('./historyImportBatch.js');
  const {serializeState} = await import('./domain.js');
  return {createHistoryImportClient:() => {
    const batch = new HistoryImportBatch();
    return {close:vi.fn(),request:async(type,payload) => {
      if(type === 'file')return batch.read(payload.files,payload.options);
      if(type === 'parse')return batch.parse(payload.settings,payload.state);
      if(type === 'apply') {
        if(payload.persisted !== serializeState(payload.state))throw new Error('State changed');
        const transaction=batch.apply(payload.state,payload.options);
        return {...transaction,serialized:serializeState(transaction.state)};
      }
      throw new Error('Unexpected test operation');
    }};
  }};
});
let root, host, state, update;
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label));
const click = async label => { await act(async()=>{button(label).click();}); };
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('crypto',undefined);
  vi.stubGlobal('requestAnimationFrame',callback => { callback(0); return 1; });
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  state=blankState(); update=vi.fn(); fault.hash=false;
  localStorage.setItem(STORAGE_KEY,serializeState(state));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<HistoricalWorkoutImportScreen state={state} update={update} close={()=>{}}/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
async function upload(kind='workouts') {
  const text = kind === 'workouts' ? hevyCsv() : 'date,weight_kg,fat_percent,neck_cm,waist_cm,left_bicep_cm,right_bicep_cm\n2025-01-02,80,,,,,';
  const bytes=new TextEncoder().encode(text).buffer;
  const file={name:'original(1).csv',size:bytes.byteLength,arrayBuffer:async()=>bytes};
  const input=host.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
}
it.each(['workouts','measurements'])('%s: primary/fallback failure shows a safe alert, never imports partially, and permits retry',async kind=>{
  const before=localStorage.getItem(STORAGE_KEY);
  await click('Hevy');fault.hash=true;await upload(kind);
  expect(host.querySelector('[role=alert]').textContent).toBe("ROOK couldn't verify this import file on this device. Your existing history was not changed.");
  expect(host.textContent).not.toMatch(/undefined is not an object|subtle|digest|Internal hash/);
  expect(button('CHOOSE FILE')).toBeDefined();
  expect(update).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  fault.hash=false;await upload(kind);
  expect(host.querySelector('h1').textContent).toBe('Review import');
  expect(host.querySelector('[role=alert]')).toBeNull();
});
it('actual Apply handler preserves stored history and review on quota failure; retry commits once',async()=>{
  const before=localStorage.getItem(STORAGE_KEY);
  await click('Hevy');await upload();
  expect(host.querySelector('h1').textContent).toBe('Review import');
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new DOMException('Full','QuotaExceededError');});
  await click('IMPORT');
  expect(host.querySelector('[role=alert]').textContent).toMatch(/couldn’t save this import.*Existing history is unchanged/);
  expect(host.querySelector('h1').textContent).toBe('Review import');
  expect(update).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  write.mockRestore();await click('IMPORT');
  expect(update).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).workouts).toHaveLength(1);
  expect(host.querySelector('h1').textContent).toBe('1 workout imported');
});
