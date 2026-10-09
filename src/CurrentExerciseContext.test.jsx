// @vitest-environment jsdom
import React, {act, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {CurrentExerciseContext} from './CurrentExerciseContext.jsx';
import {readFileSync} from 'node:fs';

let host, root, observers, resize, scroll, reduced;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  observers = []; resize = []; reduced = false; scroll = vi.fn();
  vi.stubGlobal('matchMedia', () => ({matches:reduced}));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback, options) {this.callback=callback; this.options=options; this.disconnect=vi.fn(); observers.push(this);}
    observe(target) {this.target=target;}
  });
  vi.stubGlobal('ResizeObserver', class {constructor(callback){this.callback=callback;resize.push(this);} observe(){} disconnect(){} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const top = this.matches('.exercise-heading') ? -200 : this.matches('h1') ? 120 : 0;
    const height = this.matches('.workout-header') ? 58 : 40;
    return {top,bottom:top+height,left:0,right:390,width:390,height};
  });
  HTMLElement.prototype.scrollTo = scroll;
  document.documentElement.scrollTop = 500;
  host = document.createElement('div'); document.body.append(host); root=createRoot(host);
});
afterEach(() => {act(()=>root.unmount());host.remove();document.documentElement.scrollTop=0;vi.restoreAllMocks();vi.unstubAllGlobals();});
function Surface({identity='first',name='Pull-ups',nested=false}) {
  const screen=useRef(null),title=useRef(null);
  const bind=node=>{screen.current=node;if(node&&nested){node.style.overflowY='auto';Object.defineProperties(node,{scrollHeight:{value:900,configurable:true},clientHeight:{value:600,configurable:true}});node.scrollTop=500;}};
  return <main ref={bind} className="workout-screen"><header className="workout-header"><span>UPPER B</span>
    <CurrentExerciseContext identity={identity} name={name} screenRef={screen} titleRef={title}/></header>
    <section className="exercise-heading"><h1 ref={title} tabIndex={-1}>{name}</h1></section><input defaultValue="8"/></main>;
}
const mount=props=>act(()=>root.render(<Surface {...props}/>));
const context=()=>host.querySelector('.logger-exercise-context');
const button=()=>host.querySelector('.logger-exercise-context-button');
function visibility(bottom,isIntersecting=false) {const observer=observers.at(-1);act(()=>observer.callback([{target:observer.target,isIntersecting,boundingClientRect:{bottom},rootBounds:{top:58}}]));}

it('observes the actual title below the sticky toolbar, hidden at top and when the title is below a long warm-up',()=>{
  mount();expect(observers[0].target).toBe(host.querySelector('h1'));
  expect(observers[0].options).toEqual({root:null,rootMargin:'-58px 0px 0px 0px',threshold:0});
  visibility(200,true);expect(context().getAttribute('aria-hidden')).toBe('true');expect(button().disabled).toBe(true);
  visibility(900,false);expect(context().classList.contains('is-visible')).toBe(false);
});
it('reveals only after the identity passes above the toolbar and hides again without moving scroll or replacing inputs',()=>{
  mount();const input=host.querySelector('input');visibility(57);
  expect(context().classList.contains('is-visible')).toBe(true);expect(button().disabled).toBe(false);
  visibility(150,true);expect(context().classList.contains('is-visible')).toBe(false);
  expect(host.querySelector('input')).toBe(input);expect(document.documentElement.scrollTop).toBe(500);expect(scroll).not.toHaveBeenCalled();
});
it('uses the actual nested scroll owner when the layout supplies one',()=>{
  mount({nested:true});expect(observers[0].options.root).toBe(host.querySelector('main'));
  expect(observers[0].options.rootMargin).toBe('-58px 0px 900px 0px');
  visibility(20);act(()=>button().click());expect(scroll).toHaveBeenCalledWith({top:242,behavior:'smooth'});
});
it('extends the lower observation boundary through real scroll content so a below-to-above jump is detected',()=>{
  Object.defineProperty(document.documentElement,'scrollHeight',{value:2500,configurable:true});mount();
  expect(observers[0].options.rootMargin).toBe('-58px 0px 2500px 0px');
  visibility(2000,true);expect(button().disabled).toBe(true);visibility(20,false);expect(button().disabled).toBe(false);
  delete document.documentElement.scrollHeight;
});
it('establishes restored-scroll visibility before the first observer delivery',()=>{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return {top:0,bottom:this.matches('h1')?20:58,height:58,width:390,left:0,right:390};});
  mount();expect(context().classList.contains('is-visible')).toBe(true);expect(scroll).not.toHaveBeenCalled();
});
it('unsupported-observer fallback coalesces scroll events and cancels its frame on unmount',()=>{
  vi.stubGlobal('IntersectionObserver',undefined);const frames=[],cancel=vi.fn();
  vi.stubGlobal('requestAnimationFrame',fn=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',cancel);
  mount();expect(frames).toHaveLength(1);
  for(let i=0;i<20;i++)document.dispatchEvent(new Event('scroll'));
  expect(frames).toHaveLength(1);act(()=>frames[0]());expect(button().disabled).toBe(true);
  document.dispatchEvent(new Event('scroll'));expect(frames).toHaveLength(2);
  act(()=>root.unmount());expect(cancel).toHaveBeenCalledWith(2);
});
it.each([false,true])('tap returns to the current hero using native scroll; reduced motion=%s',value=>{
  reduced=value;mount();visibility(20);act(()=>button().click());
  expect(scroll).toHaveBeenCalledExactlyOnceWith({top:242,behavior:value?'instant':'smooth'});
  expect(document.activeElement).toBe(host.querySelector('h1'));
});
it('does not take input focus on pointerdown and reuses the shared press/cancel treatment',()=>{
  mount();visibility(20);const input=host.querySelector('input');input.focus();
  const down=new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});
  act(()=>button().dispatchEvent(down));expect(down.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(input);expect(button().hasAttribute('data-row-pressed')).toBe(true);
  act(()=>button().dispatchEvent(new Event('pointercancel',{bubbles:true})));expect(button().hasAttribute('data-row-pressed')).toBe(false);
});
it('canonical identity changes synchronously remove stale visibility and observe the new committed title',()=>{
  mount();visibility(20);const old=observers[0];mount({identity:'second',name:'Single-Leg Romanian Deadlift'});
  expect(old.disconnect).toHaveBeenCalled();expect(button().textContent).toBe('Single-Leg Romanian Deadlift');
  expect(context().classList.contains('is-visible')).toBe(false);expect(observers.at(-1).target).toBe(host.querySelector('h1'));
  act(()=>old.callback([{target:old.target,isIntersecting:false,boundingClientRect:{bottom:20},rootBounds:{top:58}}]));
  expect(context().classList.contains('is-visible')).toBe(false);
  visibility(20);expect(button().getAttribute('aria-label')).toBe('Return to Single-Leg Romanian Deadlift');
});
it('header resizing updates the observer margin without adding a scroll listener in supported browsers',()=>{
  const listener=vi.spyOn(document,'addEventListener');mount();const count=observers.length;
  act(()=>resize[0].callback());expect(observers).toHaveLength(count);
  expect(listener.mock.calls.filter(([type,fn])=>type==='scroll'&&fn.name==='schedule')).toEqual([]);
  act(()=>root.unmount());expect(observers[0].disconnect).toHaveBeenCalled();
});
it('presentation stays out of flow, one line, token-based and immediate under Reduced Motion',()=>{
  const css=readFileSync('src/currentExerciseContext.css','utf8');
  expect(css).toContain('position: absolute');expect(css).toContain('inset: 100% 0 auto');
  expect(css).toContain('text-overflow: ellipsis');expect(css).toContain('white-space: nowrap');
  expect(css).toContain('var(--rook-motion-layout, 190ms)');expect(css).toContain('var(--rook-secondary)');
  expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition: none;[\s\S]*transform: none;/);
  expect(css).toContain(':focus-visible');
});
