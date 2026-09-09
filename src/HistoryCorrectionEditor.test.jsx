import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryCorrectionEditor } from './HistoryCorrectionEditor.jsx';
import { saveState } from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';

vi.mock('./domain.js', async importOriginal => ({...await importOriginal(), saveState:vi.fn(()=>true)}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root?.unmount());host?.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
it('reviews without writing, retains the draft on back, and saves atomically only at confirmation',()=>{
  vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
  const state=createReturningUserFixture(2),workout=state.workouts[0],original=structuredClone(state),update=vi.fn(),done=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<HistoryCorrectionEditor workout={workout} state={state} update={update} onDone={done} closeSheet={()=>{}} Header={()=>null}/>));
  const click=text=>act(()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click());
  click('Harder than expected');click('REVIEW CHANGES');
  expect(saveState).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  expect(host.querySelector('.history-correction-diff').textContent).toContain('Not provided → Harder than expected');
  expect(host.textContent).toContain('This may update PRs and progression history.');
  click('BACK TO EDIT');expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Harder than expected').getAttribute('aria-pressed')).toBe('true');
  click('REVIEW CHANGES');vi.mocked(saveState).mockReturnValueOnce(false);click('SAVE CHANGES');
  expect(state).toEqual(original);expect(update).not.toHaveBeenCalled();expect(host.textContent).toContain('Your history is unchanged');
  vi.mocked(saveState).mockClear();click('TRY AGAIN');
  expect(saveState).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledTimes(1);expect(done).toHaveBeenCalledTimes(1);
});
