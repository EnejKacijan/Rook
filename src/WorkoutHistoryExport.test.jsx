import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutHistoryExport } from './WorkoutHistoryExport.jsx';
import { createWorkoutHistoryExport, presentHistoryExport } from './workoutHistoryExport.js';

vi.mock('./workoutHistoryExport.js',()=>({completedExportWorkouts:()=>[],createWorkoutHistoryExport:vi.fn(),presentHistoryExport:vi.fn()}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
const file=new File(['unchanged payload'],'history.csv');
beforeEach(()=>{vi.resetAllMocks();vi.mocked(createWorkoutHistoryExport).mockResolvedValue(file);vi.mocked(presentHistoryExport).mockResolvedValue('downloaded');host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<WorkoutHistoryExport state={{}} close={()=>{}} SheetHeader={()=>null} Button={props=><button {...props}/>}/>));});
afterEach(()=>{if(root)act(()=>root.unmount());host.remove();});
const click=async text=>{await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click());};
it('fast generation prepares once without handing off until the next gesture',async()=>{
  await click('PREPARE EXPORT');expect(host.textContent).toContain('File ready');expect(createWorkoutHistoryExport).toHaveBeenCalledTimes(1);expect(presentHistoryExport).not.toHaveBeenCalled();
  await click('SHARE / DOWNLOAD');expect(presentHistoryExport).toHaveBeenCalledExactlyOnceWith(file);expect(createWorkoutHistoryExport).toHaveBeenCalledTimes(1);
});
it('async generation stays busy and closing never triggers a later handoff',async()=>{
  let resolve;vi.mocked(createWorkoutHistoryExport).mockImplementation(()=>new Promise(done=>resolve=done));
  await click('PREPARE EXPORT');expect(host.textContent).toContain('Preparing your file');expect([...host.querySelectorAll('button')].find(button=>button.textContent==='PREPARING…').disabled).toBe(true);
  act(()=>root.unmount());root=null;await act(async()=>resolve(file));expect(presentHistoryExport).not.toHaveBeenCalled();
});
it('cancelled sharing keeps the prepared file available without an error',async()=>{
  vi.mocked(presentHistoryExport).mockResolvedValueOnce('cancelled');await click('PREPARE EXPORT');await click('SHARE / DOWNLOAD');expect(host.textContent).toContain('Sharing cancelled');expect(host.querySelector('[role=alert]')).toBeNull();
  await click('SHARE / DOWNLOAD');expect(createWorkoutHistoryExport).toHaveBeenCalledTimes(1);expect(presentHistoryExport.mock.calls).toEqual([[file],[file]]);
});
it('handoff failure retains the exact payload for retry',async()=>{
  vi.mocked(presentHistoryExport).mockRejectedValueOnce(Error('denied'));await click('PREPARE EXPORT');await click('SHARE / DOWNLOAD');expect(host.querySelector('[role=alert]').textContent).toContain('Please try again');
  await click('SHARE / DOWNLOAD');expect(host.querySelector('[role=alert]')).toBeNull();expect(presentHistoryExport.mock.calls).toEqual([[file],[file]]);expect(createWorkoutHistoryExport).toHaveBeenCalledTimes(1);
});
it('failed preparation can be retried without handing off',async()=>{
  vi.mocked(createWorkoutHistoryExport).mockRejectedValueOnce(Error('failed'));await click('PREPARE EXPORT');expect(host.querySelector('[role=alert]')).not.toBeNull();await click('PREPARE EXPORT');expect(host.textContent).toContain('File ready');expect(presentHistoryExport).not.toHaveBeenCalled();
});
