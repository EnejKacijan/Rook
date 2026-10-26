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
it('separate action areas accept the responsive sheet gutter without freezing it to pixels',()=>{
  const commit=vi.fn();
  const view=render(<main className="sheet replace-sheet"><SheetActionFooter separate gutter="var(--rook-sheet-content-inline)"><button onClick={commit}>Save</button></SheetActionFooter></main>);
  const footer=view.container.querySelector('footer');
  expect(footer.style.getPropertyValue('--sheet-action-inner-gutter')).toBe('var(--rook-sheet-content-inline)');
  expect(footer.hasAttribute('data-separate')).toBe(true);
  fireEvent.click(screen.getByText('Save'));expect(commit).toHaveBeenCalledOnce();
  view.rerender(<main className="sheet"><SheetActionFooter gutter={22}><button>Save</button></SheetActionFooter></main>);
  expect(view.container.querySelector('footer').style.getPropertyValue('--sheet-action-inner-gutter')).toBe('22px');
});
it('a hidden search footer cannot pan the editor toward its empty rectangle',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:350,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const view=render(<main className="detail-screen"><input/><SheetActionFooter anchorPlanViewport hideWhileSearching><button>Review</button></SheetActionFooter></main>);
  const panel=view.container.firstChild,input=panel.querySelector('input');input.getBoundingClientRect=()=>({top:200,bottom:240});panel.scrollTop=50;
  expect(panel.querySelector('footer').hidden).toBe(true);act(()=>input.focus());expect(panel.scrollTop).toBe(50);expect(document.activeElement).toBe(input);
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});
it('keeps disabled/enabled action and secondary callbacks unchanged', () => {
  const commit=vi.fn(), cancel=vi.fn();
  const view=render(<main className="detail-screen"><SheetActionFooter><button disabled onClick={commit}>Save</button><button onClick={cancel}>Back</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Back')); expect(cancel).toHaveBeenCalledOnce();
  view.rerender(<main className="detail-screen"><SheetActionFooter><button onClick={commit}>Save</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).toHaveBeenCalledOnce();
});
it('bounds an ordinary footer sheet when both viewport heights shrink, including offset-only pan', () => {
  const original=window.visualViewport, originalHeight=window.innerHeight;
  const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  try {
    const view=render(<div className="modal-layer"><main className="detail-screen"><input defaultValue="Keep draft"/><SheetActionFooter><button>Save</button></SheetActionFooter></main></div>);
    const layer=view.container.firstChild,panel=layer.firstChild,input=panel.querySelector('input');
    expect(layer.style.height).toBe('');
    Object.defineProperty(window,'innerHeight',{configurable:true,value:480});Object.assign(viewport,{height:480,offsetTop:24});
    act(()=>viewport.dispatchEvent(new Event('resize')));
    expect(layer.style.height).toBe('844px');expect(layer.style.paddingBottom).toBe('340px');expect(panel.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('0px');
    viewport.offsetTop=72;act(()=>viewport.dispatchEvent(new Event('scroll')));expect(layer.style.top).toBe('0px');expect(layer.style.paddingTop).toBe('72px');
    expect(panel.querySelector('input')).toBe(input);expect(input.value).toBe('Keep draft');
    viewport.height=844;act(()=>viewport.dispatchEvent(new Event('resize')));expect(layer.style.height).toBe('');
  } finally {act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});Object.defineProperty(window,'innerHeight',{configurable:true,value:originalHeight});}
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
    expect(layer.style.height).toBe(`${window.innerHeight}px`);expect(layer.style.paddingBottom).toBe(`${window.innerHeight-420}px`);
    for (const [height,offsetTop,scale,type] of [[420,115,1,'scroll'],[360,70,1.2,'resize'],[window.innerHeight,0,1,'resize'],[400,0,1,'resize']]) {
      Object.assign(viewport,{height,offsetTop,scale});act(()=>viewport.dispatchEvent(new Event(type)));
      expect(layer.style.top).toBe('0px');expect(layer.style.height).toBe(`${window.innerHeight}px`);
      expect(layer.style.paddingTop).toBe(`${offsetTop}px`);expect(layer.style.paddingBottom).toBe(`${window.innerHeight-offsetTop-height}px`);
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
it('only hides an explicitly redundant browsing footer and removes its owned space until the keyboard closes',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const element=hide=><div className="modal-layer"><main className="detail-screen is-search-browsing"><input/><SheetActionFooter hideWhileSearching={hide} separate><button>Action</button></SheetActionFooter></main></div>;
  const view=render(element(true)),panel=view.container.querySelector('main'),footer=panel.querySelector('footer'),input=panel.querySelector('input');footer.getBoundingClientRect=()=>({top:350,height:footer.hidden?0:68});input.getBoundingClientRect=()=>({top:100,bottom:150});
  expect(footer.hidden).toBe(false);panel.scrollTop=27;act(()=>input.focus());expect(panel.scrollTop).toBe(27);
  Object.assign(viewport,{height:400});act(()=>viewport.dispatchEvent(new Event('resize')));expect(footer.hidden).toBe(true);expect(panel.style.getPropertyValue('--sheet-action-height')).toBe('0px');expect(panel.classList.contains('has-sheet-action-footer')).toBe(false);expect(panel.scrollTop).toBe(27);
  view.rerender(element(false));expect(panel.querySelector('footer')).toBe(footer);expect(footer.hidden).toBe(false);expect(panel.style.getPropertyValue('--sheet-action-height')).toBe('68px');
  view.rerender(element(true));expect(footer.hidden).toBe(true);Object.assign(viewport,{height:844});act(()=>viewport.dispatchEvent(new Event('resize')));expect(footer.hidden).toBe(false);expect(panel.style.getPropertyValue('--sheet-action-height')).toBe('68px');expect(panel.classList.contains('has-sheet-action-footer')).toBe(true);
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});

it('pins only an opted-in short task with room for its label and input, then flows without replacing the draft',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const save=vi.fn(),view=render(<div className="modal-layer"><main className="detail-screen"><header className="detail-header"/><label>Name<input defaultValue="Keep this exact draft"/></label><SheetActionFooter keyboardBehavior="pin-if-room"><button onClick={save}>Save</button></SheetActionFooter></main></div>);
  const panel=view.container.querySelector('main'),input=panel.querySelector('input'),footer=panel.querySelector('footer');
  panel.getBoundingClientRect=()=>({top:0,bottom:viewport.height});panel.querySelector('header').getBoundingClientRect=()=>({bottom:64});
  input.getBoundingClientRect=()=>({top:100,bottom:148,height:48});input.closest('label').getBoundingClientRect=()=>({top:76,bottom:148,height:72});footer.getBoundingClientRect=()=>({top:viewport.height-64,height:64});
  act(()=>input.focus());input.setSelectionRange(6,6);
  const resize=height=>{Object.assign(viewport,{height});act(()=>viewport.dispatchEvent(new Event('resize')));};
  resize(400);expect(footer.dataset.keyboardLayout).toBe('pin');expect(save).not.toHaveBeenCalled();
  resize(190);expect(footer.dataset.keyboardLayout).toBe('flow');expect(panel.querySelector('input')).toBe(input);expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(6);expect(input.value).toBe('Keep this exact draft');
  resize(400);expect(footer.dataset.keyboardLayout).toBe('pin');
  act(()=>footer.querySelector('button').focus());expect(footer.dataset.keyboardLayout).toBe('pin');expect(save).not.toHaveBeenCalled();
  act(()=>input.focus());input.setSelectionRange(6,6);
  resize(844);expect(footer.hasAttribute('data-keyboard-layout')).toBe(false);expect(footer.hasAttribute('data-keyboard-active')).toBe(false);expect(save).not.toHaveBeenCalled();
  fireEvent.click(footer.querySelector('button'));expect(save).toHaveBeenCalledOnce();
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});

it('long forms flow by default and reveal the field in their own scroller instead of chasing the submit button',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const view=render(<div className="modal-layer"><main className="detail-screen"><header className="detail-header"/><div data-sheet-form-scroll><input defaultValue="Unsubmitted"/><SheetActionFooter><button disabled>Review</button></SheetActionFooter></div></main></div>);
  const panel=view.container.querySelector('main'),scroller=panel.querySelector('[data-sheet-form-scroll]'),input=panel.querySelector('input'),footer=panel.querySelector('footer');
  scroller.getBoundingClientRect=()=>({top:64,bottom:400});panel.querySelector('header').getBoundingClientRect=()=>({bottom:64});input.getBoundingClientRect=()=>({top:320,bottom:368,height:48});footer.getBoundingClientRect=()=>({top:900,height:64});
  act(()=>input.focus());scroller.scrollTop=20;panel.scrollTop=0;Object.assign(viewport,{height:400});act(()=>viewport.dispatchEvent(new Event('resize')));
  expect(footer.dataset.keyboardLayout).toBe('flow');expect(scroller.scrollTop).toBe(20);expect(panel.scrollTop).toBe(0);expect(footer.querySelector('button').disabled).toBe(true);expect(input.value).toBe('Unsubmitted');
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});

it('gives a textarea and a growing field error priority over an opted-in pinned action',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const view=render(<div className="modal-layer"><main className="sheet"><header className="sheet-header-chrome"/><label>Note<textarea style={{fontSize:16,lineHeight:'24px'}} aria-invalid="true" aria-describedby="note-error"/></label><p id="note-error" role="alert">Please review this note.</p><SheetActionFooter keyboardBehavior="pin-if-room"><button>Save</button></SheetActionFooter></main></div>);
  const panel=view.container.querySelector('main'),input=panel.querySelector('textarea'),footer=panel.querySelector('footer');let errorHeight=20;
  panel.getBoundingClientRect=()=>({top:0,bottom:viewport.height});panel.querySelector('header').getBoundingClientRect=()=>({bottom:64});
  input.getBoundingClientRect=()=>({top:100,bottom:240,height:140});input.closest('label').getBoundingClientRect=()=>({height:164});panel.querySelector('[role="alert"]').getBoundingClientRect=()=>({height:errorHeight});footer.getBoundingClientRect=()=>({top:viewport.height-64,height:64});
  act(()=>input.focus());Object.assign(viewport,{height:400});act(()=>viewport.dispatchEvent(new Event('resize')));expect(footer.dataset.keyboardLayout).toBe('pin');
  errorHeight=130;Object.assign(viewport,{height:399});act(()=>viewport.dispatchEvent(new Event('resize')));expect(footer.dataset.keyboardLayout).toBe('flow');expect(panel.querySelector('[role="alert"]').textContent).toBe('Please review this note.');
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});

it('does not treat zoom alone or a nested sheet input as a reason to compact or pan its parent form',()=>{
 const original=window.visualViewport,viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 try{
  const view=render(<main className="detail-screen"><input aria-label="Parent"/><SheetActionFooter keyboardBehavior="pin-if-room"><button>Save</button></SheetActionFooter><section className="sheet"><input aria-label="Nested"/></section></main>);
  const panel=view.container.firstChild,footer=panel.querySelector('footer');act(()=>panel.querySelector('input').focus());
  Object.assign(viewport,{height:422,scale:2});act(()=>viewport.dispatchEvent(new Event('resize')));expect(footer.hasAttribute('data-keyboard-active')).toBe(false);
  panel.scrollTop=55;act(()=>panel.querySelector('section input').focus());Object.assign(viewport,{height:300,scale:1});act(()=>viewport.dispatchEvent(new Event('resize')));
  expect(footer.hasAttribute('data-keyboard-active')).toBe(false);expect(panel.scrollTop).toBe(55);
 }finally{act(()=>root.unmount());root=null;Object.defineProperty(window,'visualViewport',{configurable:true,value:original});}
});
