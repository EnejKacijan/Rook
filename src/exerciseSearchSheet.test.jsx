// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FreestyleExercisePicker } from './FreestyleWorkout.jsx';
import { useExerciseSearchSheet, bindSearchScrollBoundary } from './useExerciseSearchSheet.js';
import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';
import { createReturningUserFixture } from './demoFixture.js';
import { startFreestyleWorkout } from './freestyleWorkout.js';
import { bindScrollableSheetTouch, ModalLayer } from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, viewport, originalViewport;
beforeEach(() => {
  originalViewport = window.visualViewport;
  viewport = new EventTarget(); Object.assign(viewport, {height:844, offsetTop:0, scale:1});
  Object.defineProperty(window, 'visualViewport', {configurable:true, value:viewport});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  Object.defineProperty(window, 'visualViewport', {configurable:true, value:originalViewport});
});
const render = element => act(() => root.render(element));
function type(input, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles:true}));
  });
}
const Header = ({title,onClose}) => <header className="detail-header"><h2>{title}</h2><button onClick={onClose}>Close</button></header>;

it('shares one viewport listener set across the real modal, picker and action footer',async()=>{
  const scrollTo=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const add=vi.spyOn(viewport,'addEventListener'),remove=vi.spyOn(viewport,'removeEventListener');
  const state=startFreestyleWorkout(createReturningUserFixture(0));
  function Harness(){const background=useRef(null);return <><div ref={background}>Workout</div><ModalLayer backgroundRef={background} close={()=>{}}><FreestyleExercisePicker state={state} update={()=>{}} close={()=>{}} Header={Header}/></ModalLayer></>;}
  render(<Harness/>);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});
  const layer=host.querySelector('.modal-layer'),panel=layer.firstElementChild,input=panel.querySelector('input'),list=panel.querySelector('[data-exercise-search-scroll]');
  act(()=>input.focus());type(input,'press');input.setSelectionRange(2,4);list.scrollTop=110;
  for(const height of [660,480,436,480,844]){
    Object.assign(viewport,{height,offsetTop:height===844?0:24});act(()=>viewport.dispatchEvent(new Event('resize')));
    expect(layer.style.height).toBe('844px');expect(layer.firstElementChild).toBe(panel);expect(panel.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);expect(input.value).toBe('press');expect(input.selectionStart).toBe(2);expect(input.selectionEnd).toBe(4);expect(list.scrollTop).toBe(110);
    expect(panel.querySelectorAll('.sheet-action-footer')).toHaveLength(1);
  }
  // Row gestures also listen for resize solely to cancel an in-flight swipe.
  // The viewport geometry has exactly one shared resize/scroll callback.
  const geometryListener=add.mock.calls.find(([event])=>event==='scroll')[1];
  expect(add.mock.calls.filter(([,fn])=>fn===geometryListener).map(([event])=>event)).toEqual(['resize','scroll']);
  expect(add.mock.calls.filter(([,fn])=>fn!==geometryListener).map(([,fn])=>fn.name).sort()).toEqual(['cancel','clearSettles']);
  render(null);expect(remove.mock.calls).toHaveLength(add.mock.calls.length);for(const call of add.mock.calls)expect(remove.mock.calls).toContainEqual(call);
  expect(layer.style.height).toBe('');expect(layer.style.paddingBottom).toBe('');
  add.mockRestore();remove.mockRestore();scrollTo.mockRestore();
});

it('keeps the real Freestyle search mounted/focused across many/few/zero/clear and adds only once', async () => {
  let state = createReturningUserFixture(3); state.activeWorkout = null; state.activeOptionalSession = null;
  state = startFreestyleWorkout(state);
  const close = vi.fn(), update = fn => { state = fn(state); };
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={update} close={close} Header={Header}/></div>);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
  const panel = host.querySelector('main'), input = panel.querySelector('input');
  act(() => input.focus());
  for (const [query,count] of [['pis',6], ['pist',2], ['zzzznomatch',0], ['',null], ['pist',2]]) {
    type(input,query);
    expect(panel.querySelector('input')).toBe(input); expect(document.activeElement).toBe(input);
    expect(panel.classList.contains('exercise-search-sheet')).toBe(true);
    if (count != null) expect(panel.querySelectorAll('.queue-search-row')).toHaveLength(count);
    expect(host.querySelector('.modal-layer').style.height).toBe('844px');
  }
  const result = panel.querySelector('.queue-add-button');
  act(() => { result.click(); result.click(); });
  expect(state.activeWorkout.exercises).toHaveLength(1); expect(close).not.toHaveBeenCalled();
  act(() => panel.querySelector('.rook-search-clear').click());
  expect(input.value).toBe(''); expect(document.activeElement).toBe(input);
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={update} close={close} Header={Header}/></div>);
  type(input,'pist');
  expect(panel.querySelector('.queue-add-button').disabled).toBe(true);
  expect(panel.querySelectorAll('.queue-search-row')).toHaveLength(2);
});

it('tracks viewport height AND pan at any scale and releases only owned styles/listeners on leaving search', () => {
  function Harness({enabled}) {
    const ref = useRef(null); useExerciseSearchSheet(ref, enabled);
    return <div className="modal-layer" style={{top:3,height:700,bottom:4}}><main ref={ref} style={{maxHeight:650}}><input defaultValue="pist"/><div data-exercise-search-scroll/></main></div>;
  }
  render(<Harness enabled/>);
  const panel = host.querySelector('main'), input = panel.querySelector('input'), layer = panel.parentElement;
  for (const [height,offsetTop,scale,event] of [[380,0,1,'resize'],[380,115,1,'scroll'],[280,45,1.2,'resize'],[844,0,1,'resize']]) {
    Object.assign(viewport,{height,offsetTop,scale}); act(() => viewport.dispatchEvent(new Event(event)));
    expect(layer.style.top).toBe('0px'); expect(layer.style.height).toBe('844px');
    expect(layer.style.paddingTop).toBe(`${offsetTop}px`); expect(layer.style.paddingBottom).toBe(`${844-offsetTop-height}px`);
    expect(panel.style.getPropertyValue('--sheet-visible-height')).toBe(`${height}px`);
    expect(panel.style.maxHeight).toBe(`${height-12}px`);
    expect(panel.querySelector('input')).toBe(input); expect(input.value).toBe('pist');
  }
  render(<Harness enabled={false}/>);
  expect(panel.classList.contains('exercise-search-sheet')).toBe(false);
  expect(layer.style.height).toBe('700px'); expect(layer.style.top).toBe('3px'); expect(layer.style.bottom).toBe('4px');
  expect(panel.style.maxHeight).toBe('650px'); expect(panel.style.getPropertyValue('--sheet-visible-height')).toBe('');
  Object.assign(viewport,{height:200,offsetTop:222}); viewport.dispatchEvent(new Event('scroll'));
  expect(layer.style.top).toBe('3px');
});

it('does not change non-modal surfaces or require visualViewport support', () => {
  const screen = document.createElement('main'); host.append(screen);
  const release = bindSheetVisibleViewport(screen); expect(screen.style.length).toBe(0); release();
  Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});
  const layer = document.createElement('div'); layer.className='modal-layer'; host.append(layer);layer.append(screen);
  bindSheetVisibleViewport(screen)(); expect(screen.style.length).toBe(0);
});

it('gives nested results their own touch scroll, keeps header dismissal, and releases listeners', () => {
  const panel = document.createElement('main'); host.append(panel);
  panel.innerHTML='<header></header><div data-exercise-search-scroll><button>Result</button></div>';
  const results=panel.lastChild, row=results.firstChild, header=panel.firstChild;
  results.scrollTop=120;
  const setPosition=vi.fn(), dismiss=vi.fn(), reset=vi.fn();
  const release=bindScrollableSheetTouch({surface:panel,scroller:panel,setPosition,onDismiss:dismiss,onReset:reset});
  function touch(target,type,y){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:120,clientY:y}]});target.dispatchEvent(e);return e;}
  touch(row,'touchstart',100);const move=touch(row,'touchmove',150);
  expect(move.defaultPrevented).toBe(false);expect(setPosition).not.toHaveBeenCalled();touch(row,'touchend',150);
  touch(header,'touchstart',100);touch(header,'touchmove',270);touch(header,'touchend',270);
  expect(dismiss).toHaveBeenCalledOnce();expect(setPosition).toHaveBeenCalledWith(170);
  release();setPosition.mockClear();touch(header,'touchstart',100);touch(header,'touchmove',270);
  expect(setPosition).not.toHaveBeenCalled();
});

it('only opts dedicated picker shells into focused chrome, not ordinary embedded searches', () => {
  function Harness({focusedSearch}) {
    const ref = useRef(null); useExerciseSearchSheet(ref, true, {focusedSearch});
    return <div className="modal-layer"><main ref={ref}><header className="detail-header">Pick</header><span className="rook-search-field"><input type="search" defaultValue="row"/></span><div data-exercise-search-scroll/></main></div>;
  }
  render(<Harness focusedSearch={false}/>);
  const panel=host.querySelector('main'), input=panel.querySelector('input');
  act(()=>input.focus()); expect(panel.classList.contains('is-search-focused')).toBe(false);
  render(<Harness focusedSearch/>);
  act(()=>{input.blur();input.focus();});
  expect(panel.classList.contains('is-search-focused')).toBe(true);
  expect(panel.querySelector('input')).toBe(input); expect(input.value).toBe('row');
  render(<Harness focusedSearch={false}/>);
  expect(panel.classList.contains('is-search-focused')).toBe(false);
  act(()=>{input.blur();input.focus();}); expect(panel.classList.contains('is-search-focused')).toBe(false);
});

it('keeps query/focus through zero results and clear; keyboard close exits without remounting', () => {
  let state=createReturningUserFixture(3);state.activeWorkout=null;state.activeOptionalSession=null;state=startFreestyleWorkout(state);
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={()=>{}} close={()=>{}} Header={Header}/></div>);
  const panel=host.querySelector('main'),input=panel.querySelector('input');
  act(()=>input.focus()); type(input,'zzzznomatch');
  expect(panel.classList.contains('is-search-focused')).toBe(true);
  act(()=>panel.querySelector('.rook-search-clear').click());
  expect(panel.classList.contains('is-search-focused')).toBe(true);
  expect(document.activeElement).toBe(input); expect(input.value).toBe('');
  type(input,'row');
  Object.assign(viewport,{height:350}); act(()=>viewport.dispatchEvent(new Event('resize')));
  Object.assign(viewport,{height:window.innerHeight}); act(()=>viewport.dispatchEvent(new Event('resize')));
  expect(panel.classList.contains('is-search-focused')).toBe(false);
  expect(panel.querySelector('input')).toBe(input); expect(input.value).toBe('row');
  act(()=>input.dispatchEvent(new Event('click',{bubbles:true})));
  expect(panel.classList.contains('is-search-focused')).toBe(true);
});
it('keeps focused search chrome when the layout viewport follows the keyboard', () => {
  const height=window.innerHeight;
  let state=createReturningUserFixture(3);state.activeWorkout=null;state.activeOptionalSession=null;state=startFreestyleWorkout(state);
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={()=>{}} close={()=>{}} Header={Header}/></div>);
  const panel=host.querySelector('main'),input=panel.querySelector('input');act(()=>input.focus());type(input,'row');
  try {
    for(const next of [480,436,500]){
      Object.defineProperty(window,'innerHeight',{configurable:true,value:next});viewport.height=next;
      act(()=>{window.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('resize'));});
      expect(panel.classList.contains('is-search-focused')).toBe(true);expect(document.activeElement).toBe(input);expect(input.value).toBe('row');
    }
  } finally {Object.defineProperty(window,'innerHeight',{configurable:true,value:height});}
});

it('retains the unobscured height and live scroller throughout repeated keyboard geometry events', () => {
  let state = startFreestyleWorkout(createReturningUserFixture(0));
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={()=>{}} close={()=>{}} Header={Header}/></div>);
  const panel=host.querySelector('main'), input=panel.querySelector('input'), list=panel.querySelector('[data-exercise-search-scroll]');
  const count=list.children.length, oldHeight=window.innerHeight;
  const animate=vi.fn(); input.parentElement.animate=animate; list.animate=animate;
  list.scrollTop=160;
  act(()=>input.focus());
  try {
    for(const height of [760,660,480,436,480,660,844]) {
      Object.defineProperty(window,'innerHeight',{configurable:true,value:height});
      Object.assign(viewport,{height});
      act(()=>{window.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));});
      expect(panel.style.getPropertyValue('--sheet-reference-height')).toBe('844px');
      expect(panel.style.getPropertyValue('--sheet-visible-height')).toBe(`${height}px`);
      expect(panel.querySelector('input')).toBe(input);expect(panel.querySelector('[data-exercise-search-scroll]')).toBe(list);
      expect(list.children.length).toBe(count);expect(list.scrollTop).toBe(160);
    }
    expect(animate).not.toHaveBeenCalled();
  } finally {Object.defineProperty(window,'innerHeight',{configurable:true,value:oldHeight});}
});

it('locks nested content ownership for the gesture and never steals horizontal row swipes',()=>{
 const panel=document.createElement('main');host.append(panel);panel.innerHTML='<header></header><div data-exercise-search-scroll><button>Result</button></div>';
 const list=panel.lastChild,row=list.firstChild,setPosition=vi.fn(),onDismiss=vi.fn(),onReset=vi.fn();
 const release=bindScrollableSheetTouch({surface:panel,scroller:panel,setPosition,onDismiss,onReset});
 const touch=(type,x,y)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{touches:type==='touchend'?[]:[{clientX:x,clientY:y}]});row.dispatchEvent(e);return e;};
 list.scrollTop=100;touch('touchstart',100,100);touch('touchmove',100,130);list.scrollTop=0;
 expect(touch('touchmove',100,250).defaultPrevented).toBe(false);touch('touchend',100,250);expect(setPosition).not.toHaveBeenCalled();
 touch('touchstart',100,100);touch('touchmove',140,110);touch('touchmove',150,200);touch('touchend',150,200);expect(setPosition).not.toHaveBeenCalled();
 touch('touchstart',100,100);touch('touchmove',100,200);touch('touchcancel',100,200);expect(onReset).toHaveBeenCalledOnce();expect(onDismiss).not.toHaveBeenCalled();release();
});

it('keeps expanded browsing on local focus changes until keyboard Done, including retained DOM focus',async()=>{
 const state=startFreestyleWorkout(createReturningUserFixture(0));
 render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={()=>{}} close={()=>{}} Header={Header}/></div>);
 const panel=host.querySelector('main'),input=panel.querySelector('input'),button=panel.querySelector('.queue-search-scopes button');
 act(()=>input.focus());Object.assign(viewport,{height:400});act(()=>viewport.dispatchEvent(new Event('resize')));
 act(()=>button.focus());await act(async()=>{await new Promise(r=>requestAnimationFrame(r));});expect(panel.classList.contains('is-search-focused')).toBe(true);
 act(()=>input.focus());type(input,'squat');Object.assign(viewport,{height:844});act(()=>viewport.dispatchEvent(new Event('resize')));
 expect(document.activeElement).toBe(input);expect(input.value).toBe('squat');expect(panel.classList.contains('is-search-focused')).toBe(false);
 act(()=>viewport.dispatchEvent(new Event('scroll')));expect(panel.classList.contains('is-search-focused')).toBe(false);
});
it('opens already expanded if mounted above an existing software keyboard, but not in preview mode',()=>{
 Object.assign(viewport,{height:400});
 function Harness({browsing}){const ref=useRef(null);useExerciseSearchSheet(ref,true,{focusedSearch:true,browsing});return <div className="modal-layer"><main ref={ref}><span className="rook-search-field"><input type="search"/></span></main></div>;}
 render(<Harness browsing/>);const panel=host.querySelector('main'),input=panel.querySelector('input');expect(panel.classList.contains('is-search-focused')).toBe(true);expect(panel.classList.contains('is-search-browsing')).toBe(true);
 render(<Harness browsing={false}/>);expect(panel.classList.contains('is-search-browsing')).toBe(false);expect(panel.classList.contains('is-search-focused')).toBe(false);expect(panel.querySelector('input')).toBe(input);expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(true);
});
it('keeps keyboard result gestures in the list at either boundary, preserving handle, selection, pinch and horizontal actions',()=>{
 const panel=document.createElement('main');host.append(panel);panel.className='is-search-browsing';panel.setAttribute('data-sheet-keyboard-open','');panel.innerHTML='<header><div class="modal-drag-handle"></div><input></header><div data-exercise-search-scroll><button>Result</button></div>';
 const list=panel.lastChild,row=list.firstChild,handle=panel.querySelector('.modal-drag-handle'),input=panel.querySelector('input'),position=vi.fn(),dismiss=vi.fn();
 Object.defineProperties(list,{clientHeight:{value:200},scrollHeight:{value:600}});
 const releaseBoundary=bindSearchScrollBoundary(panel),releaseDrag=bindScrollableSheetTouch({surface:panel,scroller:panel,setPosition:position,onDismiss:dismiss,onReset:()=>{}});
 const touch=(node,type,x,y,count=1)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{touches:type==='touchend'?[]:Array.from({length:count},()=>({clientX:x,clientY:y}))});node.dispatchEvent(e);return e;};
 list.scrollTop=0;touch(row,'touchstart',100,100);expect(touch(row,'touchmove',100,180).defaultPrevented).toBe(true);touch(row,'touchend',100,180);expect(position).not.toHaveBeenCalled();
 list.scrollTop=100;touch(row,'touchstart',100,100);expect(touch(row,'touchmove',100,60).defaultPrevented).toBe(false);list.scrollTop=400;expect(touch(row,'touchmove',100,30).defaultPrevented).toBe(true);touch(row,'touchend',100,30);expect(position).not.toHaveBeenCalled();
 touch(row,'touchstart',100,100);expect(touch(row,'touchmove',160,105).defaultPrevented).toBe(false);touch(row,'touchend',160,105);
 touch(row,'touchstart',100,100,2);expect(touch(row,'touchmove',100,180,2).defaultPrevented).toBe(false);
 touch(input,'touchstart',100,100);expect(touch(input,'touchmove',100,180).defaultPrevented).toBe(false);touch(input,'touchend',100,180);
 touch(handle,'touchstart',100,100);touch(handle,'touchmove',100,280);touch(handle,'touchend',100,280);expect(dismiss).toHaveBeenCalledOnce();
 releaseBoundary();releaseDrag();position.mockClear();touch(row,'touchstart',100,100);expect(touch(row,'touchmove',100,180).defaultPrevented).toBe(false);expect(position).not.toHaveBeenCalled();
});
