import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {HistoricalWorkoutImportScreen} from './App.jsx';
import {blankState,serializeState,STORAGE_KEY} from './domain.js';
import {hevyCsv,hevyRow} from '../scripts/history-import-fixtures.mjs';
vi.mock('./historyImportClient.js',async()=>{
  const {HistoryImportBatch}=await import('./historyImportBatch.js');
  return {createHistoryImportClient:()=>{const batch=new HistoryImportBatch();return {close(){},async request(type,p){
    if(type==='file')return batch.read(p.files,p.options);
    if(type==='parse')return batch.parse(p.settings,p.state);
    if(type==='matches')return batch.reviewMatches(p.state);
    if(type==='resolve')return batch.resolve(p.state,p.sourceName,p.resolution);
    throw new Error('Unexpected persistence request');
  }};}};
});
let root,host,state,update;
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async(text)=>act(async()=>button(text).click());
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('requestAnimationFrame',fn=>{fn(0);return 1;});
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollTo=vi.fn();state=blankState();update=vi.fn();localStorage.setItem(STORAGE_KEY,serializeState(state));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<HistoricalWorkoutImportScreen state={state} update={update} close={()=>{}}/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
async function upload(){
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith('Hevy')).click());
  const data=new TextEncoder().encode(hevyCsv(['Bench Press','Side Bend','Unknown QA motion'].map(exercise_title=>hevyRow({exercise_title,weight_kg:''})))).buffer;
  const input=host.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[{name:'qa.csv',size:data.byteLength,arrayBuffer:async()=>data}]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
}
it('no advanced suggestions before optional review; every original can be imported immediately',async()=>{
  await upload();
  expect(host.querySelector('.history-import-resolved').open).toBe(false);
  expect(host.querySelectorAll('.history-import-review-section .needs-review')).toHaveLength(0);
  expect(host.querySelector('.history-import-summary-grid').textContent).toContain('Matched1Original names2');
  expect(button('IMPORT 1 WORKOUT').disabled).toBe(false);
  expect(host.querySelector('.history-import-suggestions')).toBeNull();
  expect(host.querySelector('.history-import-custom').open).toBe(false);
  await click('Review exercise matches · Optional');expect(host.querySelector('h1').textContent).toBe('Side Bend');
  expect(button('USE MATCH')).toBeDefined();expect(button('CHOOSE ANOTHER')).toBeDefined();expect(button('KEEP ORIGINAL')).toBeDefined();
  await click('USE MATCH');expect(host.querySelector('h1').textContent).toBe('Unknown QA motion');
  await act(async()=>host.querySelector('button[aria-label="Back"]').click());
  expect(host.querySelectorAll('.history-import-review-section .needs-review')).toHaveLength(0);
  expect(host.querySelector('.history-import-summary-grid').textContent).toContain('Original names1');
  expect(update).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).workouts).toHaveLength(0);
});
it('an automatic match remains inspectable/changeable without being a mandatory decision',async()=>{
  await upload();const row=[...host.querySelectorAll('.history-import-resolved .history-import-mapping-row')].find(r=>r.textContent.includes('Bench Press'));
  await act(async()=>row.querySelector('button').click());
  expect(host.querySelector('h1').textContent).toBe('Bench Press');
  await click('KEEP ORIGINAL');
  expect(host.querySelector('h1').textContent).toBe('Review import');
  expect(host.querySelector('.history-import-custom').textContent).toContain('Bench Press');
  expect(update).not.toHaveBeenCalled();
});
it('leaving optional matching never accepts suggested identities or persists',async()=>{
  await upload();await click('Review exercise matches · Optional');
  await act(async()=>host.querySelector('button[aria-label="Back"]').click());
  expect(host.querySelector('.history-import-summary-grid').textContent).toContain('Matched1Original names2');
  expect(host.querySelector('.history-import-custom').textContent).toContain('Unknown QA motion');
  expect(update).not.toHaveBeenCalled();
});
