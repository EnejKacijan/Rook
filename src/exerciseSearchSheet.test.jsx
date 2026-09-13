// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FreestyleExercisePicker } from './FreestyleWorkout.jsx';
import { useExerciseSearchSheet } from './useExerciseSearchSheet.js';
import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';
import { createReturningUserFixture } from './demoFixture.js';
import { startFreestyleWorkout } from './freestyleWorkout.js';
import { bindScrollableSheetTouch } from './App.jsx';

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

it('keeps the real Freestyle search mounted/focused across many/few/zero/clear and adds only once', () => {
  let state = createReturningUserFixture(3); state.activeWorkout = null; state.activeOptionalSession = null;
  state = startFreestyleWorkout(state);
  const close = vi.fn(), update = fn => { state = fn(state); };
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={update} close={close} Header={Header}/></div>);
  const panel = host.querySelector('main'), input = panel.querySelector('input');
  act(() => input.focus());
  for (const [query,count] of [['pis',6], ['pist',2], ['zzzznomatch',0], ['',null], ['pist',2]]) {
    type(input,query);
    expect(panel.querySelector('input')).toBe(input); expect(document.activeElement).toBe(input);
    expect(panel.classList.contains('exercise-search-sheet')).toBe(true);
    if (count != null) expect(panel.querySelectorAll('.list-row')).toHaveLength(count);
    expect(host.querySelector('.modal-layer').style.height).toBe('844px');
  }
  const result = panel.querySelector('.list-row');
  act(() => { result.click(); result.click(); });
  expect(state.activeWorkout.exercises).toHaveLength(1); expect(close).toHaveBeenCalled();
  act(() => panel.querySelector('.rook-search-clear').click());
  expect(input.value).toBe(''); expect(document.activeElement).toBe(input);
  render(<div className="modal-layer"><FreestyleExercisePicker state={state} update={update} close={close} Header={Header}/></div>);
  type(input,'pist');
  expect(panel.querySelector('.list-row').disabled).toBe(true);
  expect(panel.querySelectorAll('.list-row')).toHaveLength(2);
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
    expect(layer.style.top).toBe(`${offsetTop}px`); expect(layer.style.height).toBe(`${height}px`);
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
  act(()=>input.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  expect(panel.classList.contains('is-search-focused')).toBe(true);
});
