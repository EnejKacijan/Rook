import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {StorageDiagnostics, diagnosticTime} from './StorageDiagnostics.jsx';
import {Profile} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {storageDiagnostics, inspectStorageProtection} from './localStateStorage.js';

vi.mock('./localStateStorage.js', async original => ({...await original(), storageDiagnostics:vi.fn(), inspectStorageProtection:vi.fn()}));
let root, value, copy, clipboardDescriptor;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  value={primaryChars:1250,lastSuccessfulWriteAt:'2026-09-19T21:01:00Z',lastSuccessfulReadAt:'2026-09-19T21:02:00Z',startupOutcome:'ready',persistentStorage:{result:'granted'},generation:8,committedGeneration:8,schemaVersion:3,writePending:false,deletePending:false};
  storageDiagnostics.mockImplementation(()=>value); inspectStorageProtection.mockResolvedValue({result:'granted'});
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  copy=vi.fn().mockResolvedValue(undefined); clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete navigator.clipboard;vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
async function render(element){const host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(element));}
const button=text=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes(text));
const status=label=>[...document.querySelectorAll('dt')].find(e=>e.textContent===label)?.nextElementSibling.textContent;

it('shows a readable summary and keeps internal fields out of the initial screen',async()=>{
  await render(<StorageDiagnostics/>);
  expect(status('LOCAL DATA')).toBe('Available');expect(status('STARTUP STATUS')).toBe('Ready');expect(status('STORAGE PROTECTION')).toBe('Enabled');
  expect(document.querySelector('pre')).toBeNull();expect(document.body.textContent).not.toMatch(/generation|schemaVersion|writePending|deletePending/);
  expect(document.body.textContent).toContain('Nothing is uploaded');expect(inspectStorageProtection).toHaveBeenCalledWith();
});
it.each([[null,'Not available'],[0,'Not found']])('does not claim available data for %s bytes',async(primaryChars,label)=>{
  value={primaryChars};await render(<StorageDiagnostics/>);expect(status('LOCAL DATA')).toBe(label);expect(status('LAST SAVED')).toBe('Not recorded');expect(status('LAST LOADED')).toBe('Not recorded');expect(status('STARTUP STATUS')).toBe('Not recorded');
});
it.each([['unsupported','Not available'],['unavailable','Not available'],['not-granted','Not enabled'],['requested','Requested'],[undefined,'Not requested']])('labels storage protection %s without inventing a grant or request',async(result,label)=>{
  value.persistentStorage={result};await render(<StorageDiagnostics/>);expect(status('STORAGE PROTECTION')).toBe(label);
});
it('refreshes on entry without requesting protection and can leave before inspection completes',async()=>{
  let finish;inspectStorageProtection.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await render(<StorageDiagnostics/>);act(()=>root.unmount());root=null;await act(async()=>finish({result:'granted'}));
  expect(inspectStorageProtection).toHaveBeenCalledOnce();expect(storageDiagnostics).toHaveBeenCalledOnce();
});
it('copies a fresh complete privacy-safe diagnostic snapshot without revealing JSON',async()=>{
  await render(<StorageDiagnostics/>);value={...value,generation:9,committedGeneration:9};
  await act(async()=>button('Copy diagnostics').click());expect(copy).toHaveBeenCalledOnce();expect(JSON.parse(copy.mock.calls[0][0])).toEqual(value);
  expect(document.querySelector('[role=status]').textContent).toBe('Diagnostics copied.');expect(document.querySelector('pre')).toBeNull();
});
it('offers selectable technical details if copying is unavailable, and details can be hidden again',async()=>{
  copy.mockRejectedValue(new Error('Clipboard unavailable'));await render(<StorageDiagnostics/>);
  await act(async()=>button('Copy diagnostics').click());expect(document.querySelector('[role=status]').textContent).toContain('Couldn’t copy');
  expect(JSON.parse(document.querySelector('pre').textContent)).toEqual(value);expect(document.querySelector('details').open).toBe(true);
  act(()=>{const details=document.querySelector('details');details.open=false;details.dispatchEvent(new Event('toggle'));});expect(document.querySelector('pre')).toBeNull();
});
it('reveals the existing technical payload only after explicitly opening details',async()=>{
  await render(<StorageDiagnostics/>);act(()=>{const details=document.querySelector('details');details.open=true;details.dispatchEvent(new Event('toggle'));});
  expect(JSON.parse(document.querySelector('pre').textContent)).toEqual(value);expect(document.querySelector('pre').tabIndex).toBe(0);
});
it('formats local Today/Yesterday and older dates, including midnight and invalid dates',()=>{
  const now=new Date(2026,8,19,23,30);
  expect(diagnosticTime(new Date(2026,8,19,23,1).toISOString(),now)).toBe('Today, 23:01');
  expect(diagnosticTime(new Date(2026,8,18,0,1).toISOString(),now)).toBe('Yesterday, 00:01');
  expect(diagnosticTime(new Date(2025,8,17,9,1).toISOString(),now)).toContain('2025');expect(diagnosticTime('bad',now)).toBe('Not recorded');
});
it('keeps Data & backup compact, preserves actions, and returns through Data to Profile with focus and scroll restored',async()=>{
  const state=createReturningUserFixture(0),before=JSON.stringify(state),setDetail=vi.fn(),update=vi.fn(),onLogout=vi.fn();
  await render(<Profile state={state} update={update} setDetail={setDetail} onLogout={onLogout}/>);
  act(()=>button('Data & backup').click());
  for(const [label,detail] of [['Import workout history','import-workout-history'],['Export workout history','export-workout-history'],['Back up ROOK','backup-rook'],['Restore backup','restore-backup']]){act(()=>button(label).click());expect(setDetail).toHaveBeenLastCalledWith(detail);}
  expect(document.querySelector('pre,details,.storage-status-summary')).toBeNull();expect(document.body.textContent).toContain('Keep a ROOK backup file somewhere safe.');expect(inspectStorageProtection).not.toHaveBeenCalled();
  vi.stubGlobal('scrollY',275);await act(async()=>button('Storage diagnostics').click());
  expect(document.querySelector('button[aria-label="Back to Data & backup"]')).toBe(document.activeElement);expect(document.querySelector('pre')).toBeNull();
  act(()=>document.querySelector('main').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('[data-profile-area="diagnostics"]')).toBe(document.activeElement);expect(window.scrollTo).toHaveBeenLastCalledWith(0,275);
  expect(button('Restore backup')).toBeDefined();act(()=>button('Delete local data').click());expect(onLogout).toHaveBeenCalledOnce();
  act(()=>document.querySelector('button[aria-label="Back to Profile"]').click());expect(document.querySelector('[data-profile-area="data"]')).toBe(document.activeElement);
  expect(JSON.stringify(state)).toBe(before);expect(update).not.toHaveBeenCalled();
});
