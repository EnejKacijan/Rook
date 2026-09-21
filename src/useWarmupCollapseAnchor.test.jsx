import React,{act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useWarmupCollapseAnchor} from './useWarmupCollapseAnchor.js';
let host,root,notify,top,writes,headingTop,disconnect;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();top=500;writes=[];headingTop=300;disconnect=vi.fn();
  Object.defineProperty(document,'scrollingElement',{configurable:true,value:document.documentElement});
  vi.spyOn(document.documentElement,'scrollTop','get').mockImplementation(()=>top);
  vi.spyOn(document.documentElement,'scrollTop','set').mockImplementation(v=>{writes.push(v);top=v;});
  vi.stubGlobal('ResizeObserver',class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnect();}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('exercise-heading')?{top:headingTop}:{bottom:58};});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete document.scrollingElement;});
function Harness({open}){const region=useRef(null);useWarmupCollapseAnchor(open,region);return <main className="workout-screen"><header className="workout-header"/><section ref={region}/><section className="exercise-heading"/></main>;}
const render=open=>act(()=>root.render(<Harness open={open}/>));
it('checks/rerenders never reset scroll; collapse adjusts only the hidden portion of the exercise',()=>{
  render(true);render(true);expect(writes).toEqual([]);
  render(false);notify();expect(writes).toEqual([]);
  headingTop=35;notify();expect(writes).toEqual([465]);
  headingTop=70;notify();expect(writes).toHaveLength(1);
  act(()=>vi.advanceTimersByTime(220));expect(disconnect).toHaveBeenCalled();
});
it('immediate reduced collapse is corrected before paint; reversal cleans up',()=>{
  render(true);headingTop=-100;render(false);expect(writes).toEqual([330]);
  render(true);expect(disconnect).toHaveBeenCalled();expect(writes).toHaveLength(1);
});
