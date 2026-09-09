import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { PlanProcessing,PlanProgressBar,finishPlanProcessing } from './PlanProcessing.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{vi.useFakeTimers();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const render=element=>act(()=>root.render(element));
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
it('250ms operations never reveal a loading surface',()=>{render(<PlanProcessing/>);advance(250);expect(host.querySelector('[role=dialog]')).toBeNull();});
for(const duration of [800,2000,5000,12000])it(`${duration}ms jobs use stable unknown progress, never a fabricated percentage`,()=>{
 render(<PlanProcessing kind="import"/>);advance(599);expect(host.querySelector('[role=dialog]')).toBeNull();advance(duration-599);
 expect(host.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')).toBe(false);expect(host.textContent).toContain('Reading your workout notes');expect(host.textContent).not.toContain('%');
});
it('stalled work updates copy but not progress and survives background time',()=>{render(<PlanProcessing/>);advance(20000);expect(host.textContent).toContain('Still processing on this device');expect(host.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')).toBe(false);});
it('hybrid real counts never regress, extrapolate on stalls or complete before success',()=>{
 render(<PlanProgressBar/>);const node=host.firstChild;expect(node.hasAttribute('aria-valuenow')).toBe(false);
 render(<PlanProgressBar progress={{completed:4,total:10}}/>);expect(host.firstChild).toBe(node);expect(node.getAttribute('aria-valuenow')).toBe('40');advance(20000);expect(node.getAttribute('aria-valuenow')).toBe('40');
 render(<PlanProgressBar progress={{completed:2,total:10}}/>);expect(node.getAttribute('aria-valuenow')).toBe('40');
 render(<PlanProgressBar/>);expect(node.getAttribute('aria-valuenow')).toBe('40');
 render(<PlanProgressBar progress={{completed:9,total:10}}/>);advance(20000);expect(node.getAttribute('aria-valuenow')).toBe('90');
 render(<PlanProgressBar progress={{completed:10,total:10}}/>);expect(node.getAttribute('aria-valuenow')).toBe('99');
 render(<PlanProgressBar complete/>);expect(node.getAttribute('aria-valuenow')).toBe('100');
});
it('fast and visible success add no artificial closure delay',async()=>{
 const stage=vi.fn();await finishPlanProcessing(performance.now(),stage);expect(stage).not.toHaveBeenCalled();
 vi.stubGlobal('matchMedia',()=>({matches:false}));await finishPlanProcessing(performance.now()-800,stage);expect(stage).toHaveBeenCalledWith('complete');expect(vi.getTimerCount()).toBe(0);
});
for(const kind of ['program','import'])it(`${kind} stages preserve activity geometry and success never flashes 100%`,()=>{
 render(<PlanProcessing kind={kind}/>);advance(600);const bar=host.querySelector('[role=progressbar]');
 for(const stage of ['preparing','building','reading','checking','saving']){
  render(<PlanProcessing kind={kind} stage={stage}/>);expect(host.querySelector('[role=progressbar]')).toBe(bar);expect(bar.hasAttribute('aria-valuenow')).toBe(false);
 }
 render(<PlanProcessing kind={kind} stage="complete"/>);expect(host.querySelector('[role=dialog]')).toBeNull();
});
it('reduced-motion success settles immediately',async()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));const stage=vi.fn();await finishPlanProcessing(performance.now()-1000,stage);expect(stage).toHaveBeenCalledWith('complete');expect(vi.getTimerCount()).toBe(0);});
it('cancel delegates without persisting anything',()=>{const cancel=vi.fn();render(<PlanProcessing onCancel={cancel}/>);advance(600);act(()=>host.querySelector('button').click());expect(cancel).toHaveBeenCalledTimes(1);});
