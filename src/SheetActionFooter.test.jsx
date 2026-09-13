// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SheetActionFooter } from './SheetActionFooter.jsx';
let root;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';});
function render(element){const container=document.createElement('div');document.body.append(container);root=createRoot(container);const rerender=e=>act(()=>root.render(e));rerender(element);return {container,rerender};}
const screen={getByText:text=>[...document.querySelectorAll('button')].find(e=>e.textContent===text),getAllByRole:role=>[...document.querySelectorAll(`[role="${role}"]`)]};
const fireEvent={click:e=>act(()=>e.click())};
it('keeps disabled/enabled action and secondary callbacks unchanged', () => {
  const commit=vi.fn(), cancel=vi.fn();
  const view=render(<main className="detail-screen"><SheetActionFooter><button disabled onClick={commit}>Save</button><button onClick={cancel}>Back</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Back')); expect(cancel).toHaveBeenCalledOnce();
  view.rerender(<main className="detail-screen"><SheetActionFooter><button onClick={commit}>Save</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).toHaveBeenCalledOnce();
});
it('does not create a footer for excluded states and removes its scroll registration', () => {
  const view=render(<main className="detail-screen"><SheetActionFooter><button>Apply</button></SheetActionFooter></main>);
  expect(view.container.querySelector('main').classList.contains('has-sheet-action-footer')).toBe(true);
  view.rerender(<main className="detail-screen"><SheetActionFooter enabled={false}><button>Pick</button></SheetActionFooter></main>);
  expect(view.container.querySelector('footer')).toBeNull();
  expect(view.container.querySelector('main').classList.contains('has-sheet-action-footer')).toBe(false);
});
it('preserves concise action errors without duplication', () => {
  render(<main className="detail-screen"><SheetActionFooter><p role="alert">Could not save</p><button>Retry</button></SheetActionFooter></main>);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});
it('supports existing independently scrolling scaffolds without adding a second action system', () => {
  const view=render(<main className="sheet"><SheetActionFooter separate gutter={22}><button>Create</button></SheetActionFooter></main>);
  const footer=view.container.querySelector('footer');
  expect(footer.dataset.separate).toBe('true');
  expect(footer.style.getPropertyValue('--sheet-action-inner-gutter')).toBe('22px');
});
it('uses native page scrolling only for the opted-in full-page input', () => {
  const view=render(<main className="detail-screen"><textarea/><SheetActionFooter pageScroll><button>Create</button></SheetActionFooter></main>);
  const input=view.container.querySelector('textarea');input.scrollIntoView=vi.fn();
  input.getBoundingClientRect=()=>({top:400,bottom:560});
  view.container.querySelector('footer').getBoundingClientRect=()=>({top:320});
  act(()=>input.focus());expect(input.scrollIntoView).toHaveBeenCalledWith({block:'center',behavior:'instant'});
});
it('keeps the opted-in sheet anchored across keyboard pan, zoom and restoration without remounting', () => {
  const original=window.visualViewport, viewport=new EventTarget();
  Object.assign(viewport,{height:420,offsetTop:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  try {
    const view=render(<div className="modal-layer"><main className="sheet"><div className="sheet-scroll"><textarea defaultValue="Retain me"/></div><SheetActionFooter containViewport separate><button>Save</button></SheetActionFooter></main></div>);
    const layer=view.container.firstChild, panel=layer.firstChild, input=panel.querySelector('textarea');
    expect(layer.style.height).toBe('420px');
    for (const [height,offsetTop,scale,type] of [[420,115,1,'scroll'],[360,70,1.2,'resize'],[window.innerHeight,0,1,'resize'],[400,0,1,'resize']]) {
      Object.assign(viewport,{height,offsetTop,scale});act(()=>viewport.dispatchEvent(new Event(type)));
      expect(layer.style.top).toBe(`${offsetTop}px`);expect(layer.style.height).toBe(`${height}px`);
      expect(layer.firstChild).toBe(panel);expect(panel.querySelector('textarea')).toBe(input);expect(input.value).toBe('Retain me');
    }
    act(()=>root.unmount());root=null;
    expect(layer.style.top).toBe('');expect(layer.style.bottom).toBe('');expect(panel.style.maxHeight).toBe('');
    viewport.offsetTop=180;viewport.dispatchEvent(new Event('scroll'));expect(layer.style.top).toBe('');
  } finally {Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});
it('uses one full-page import scroll owner, includes labels, and handles offset-only changes',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:400,offsetTop:100,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try {
   const view=render(<main className="detail-screen initial-import-screen"><header className="detail-header"/><div className="import-decision-scroll"><label>Reps<input defaultValue="8"/></label></div><SheetActionFooter importViewport separate><button>Continue</button></SheetActionFooter></main>);
   const panel=view.container.firstChild,scroller=panel.querySelector('.import-decision-scroll'),label=panel.querySelector('label'),input=panel.querySelector('input');
   scroller.getBoundingClientRect=()=>({top:200,bottom:420});panel.querySelector('footer').getBoundingClientRect=()=>({top:420});
   label.getBoundingClientRect=()=>({top:195,bottom:270});input.getBoundingClientRect=()=>({top:225,bottom:270});
   scroller.scrollTop=80;act(()=>input.focus());expect(scroller.scrollTop).toBe(63); // includes the label above the input
   label.getBoundingClientRect=()=>({top:220,bottom:290});const prior=scroller.scrollTop;
   Object.assign(viewport,{offsetTop:130});act(()=>viewport.dispatchEvent(new Event('scroll')));
   expect(panel.style.top).toBe('130px');expect(panel.style.height).toBe('400px');expect(scroller.scrollTop).toBe(prior);
   expect(panel.querySelector('input')).toBe(input);expect(input.value).toBe('8');
   act(()=>root.unmount());root=null;expect(panel.style.top).toBe('');expect(panel.style.height).toBe('');
   viewport.offsetTop=200;viewport.dispatchEvent(new Event('scroll'));expect(panel.style.top).toBe('');
 }finally{Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});

it('opts plan editors into visible-viewport containment without changing other footers',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try {
   const view=render(<main className="detail-screen scratch-editor-screen"><div>Plan contents</div><SheetActionFooter anchorPlanViewport><button disabled>Use plan</button></SheetActionFooter></main>);
   const panel=view.container.firstChild,footer=panel.querySelector('footer');
   expect(panel.classList.contains('has-anchored-plan-footer')).toBe(true);
   for(const [height,offsetTop] of [[420,0],[420,85],[844,0]]){
     Object.assign(viewport,{height,offsetTop});act(()=>viewport.dispatchEvent(new Event('resize')));
     expect(panel.style.height).toBe(`${height}px`);expect(panel.style.top).toBe(`${offsetTop}px`);
     expect(panel.querySelector('footer')).toBe(footer);
   }
   view.rerender(<main className="detail-screen scratch-editor-screen"><div>New content</div><SheetActionFooter anchorPlanViewport><button>Use plan</button></SheetActionFooter></main>);
   expect(panel.querySelector('footer')).toBe(footer);expect(panel.querySelector('button').disabled).toBe(false);
   view.rerender(<main className="detail-screen"><SheetActionFooter><button>Other action</button></SheetActionFooter></main>);
   expect(panel.classList.contains('has-anchored-plan-footer')).toBe(false);expect(panel.style.height).toBe('');expect(panel.style.top).toBe('');
 } finally {Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});
