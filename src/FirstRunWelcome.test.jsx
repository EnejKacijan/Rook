import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {FirstRunWelcome,WELCOME_PAGE_KEY} from './FirstRunWelcome.jsx';
import {Stepper} from './App.jsx';
import {PRIMARY_KEY} from './localStateStorage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,actions;
const click=async label=>{const node=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);expect(node).toBeTruthy();await act(async()=>node.click());};
const page=()=>host.querySelector('[aria-roledescription="slide"][data-active]').getAttribute('aria-label');
beforeEach(()=>{
  localStorage.clear();localStorage.setItem(PRIMARY_KEY,'existing data, unchanged');
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  actions={onContinue:vi.fn(),onSignIn:vi.fn(),onRestore:vi.fn()};
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const mount=async()=>act(async()=>root.render(<FirstRunWelcome {...actions} Stepper={Stepper}/>));
it('migrates the removed Pro page to the last demo in the intro-only host',async()=>{
  localStorage.setItem(WELCOME_PAGE_KEY,'3');await mount();
  expect(page()).toBe('2 of 3');expect(host.querySelectorAll('.welcome-slide')).toHaveLength(2);
  expect(host.querySelector('.welcome-pro-example')).toBeNull();
  expect(host.textContent).not.toContain('Get started');
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('existing data, unchanged');
});
it('uses the production calendar and an isolated interactive sample without saving or starting a workout',async()=>{
  await mount();expect(page()).toBe('1 of 3');expect(host.querySelector('.week-pager-viewport')).toBeTruthy();
  expect(host.querySelector('.welcome-week-example').closest('[inert],[aria-hidden="true"]')).toBeNull();
  expect(host.querySelectorAll('.welcome-week-example .week-strip button')).toHaveLength(7);
  await click('Try a set');expect(page()).toBe('2 of 3');
  expect(document.activeElement).toBe(host.querySelector('.welcome-slide[data-active] h1'));
  expect([...host.querySelectorAll('.welcome-sample-stepper output')].map(node=>node.value)).toEqual(['40','8']);
  expect(host.querySelector('.welcome-sample-controls').closest('[inert],[aria-hidden="true"]')).toBeNull();
  expect(host.querySelector('.welcome-sample-controls input')).toBeNull();
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('existing data, unchanged');
  expect(localStorage.getItem(WELCOME_PAGE_KEY)).toBe('1');
  expect(Object.values(actions).every(fn=>fn.mock.calls.length===0)).toBe(true);
});
it('exposes only the selected page while all pages reserve shared layout tracks',async()=>{
  await mount();
  for(let index=0;index<2;index++){
    if(index)await click('Next introduction page');
    const slides=[...host.querySelectorAll('[aria-roledescription="slide"]')];
    expect(slides).toHaveLength(2);
    expect(slides.filter(node=>!node.hasAttribute('aria-hidden'))).toEqual([slides[index]]);
    for(const [i,slide]of slides.entries())expect(slide.hasAttribute('inert')).toBe(i!==index);
    expect(host.querySelector('main').getAttribute('aria-labelledby')).toBe(slides[index].querySelector('h1').id);
  }
});
it.each([0,1])('keeps starting, skipping, signing in and restore accessible on page %i',async index=>{
  localStorage.setItem(WELCOME_PAGE_KEY,String(index));await mount();expect(page()).toBe(`${index+1} of 3`);
  await click('Sign in');expect(actions.onSignIn).toHaveBeenCalledOnce();
  await click('Restore backup');expect(actions.onRestore).toHaveBeenCalledOnce();
  await click('Skip intro');await click('Next introduction page');expect(actions.onContinue).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('existing data, unchanged');
});
it('remembers presentation progress while keeping keyboard navigation bounded',async()=>{
  await mount();const carousel=host.querySelector('[aria-roledescription="carousel"]');
  const key=async value=>act(async()=>carousel.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true})));
  await key('ArrowLeft');expect(page()).toBe('1 of 3');
  await key('ArrowRight');expect(page()).toBe('2 of 3');
  await key('ArrowRight');expect(actions.onContinue).toHaveBeenCalledOnce();
  await act(async()=>root.unmount());root=createRoot(host);await mount();expect(page()).toBe('2 of 3');
  expect(actions.onContinue).toHaveBeenCalledOnce();
});
it('supports horizontal swipes without hijacking vertical scroll or the screen edge',async()=>{
  await mount();const carousel=host.querySelector('[aria-roledescription="carousel"]');
  const touch=async(type,x,y)=>act(async()=>{const e=new Event(type,{bubbles:true});Object.defineProperty(e,type==='touchstart'?'touches':'changedTouches',{value:[{clientX:x,clientY:y}]});carousel.dispatchEvent(e);});
  await touch('touchstart',180,160);await touch('touchend',170,300);expect(page()).toBe('1 of 3');
  await touch('touchstart',4,160);await touch('touchend',200,160);expect(page()).toBe('1 of 3');
  await touch('touchstart',270,160);await touch('touchend',100,165);expect(page()).toBe('2 of 3');
});
it('gives the sample controls gesture ownership while keeping navigation buttons independent',async()=>{
  localStorage.setItem(WELCOME_PAGE_KEY,'1');await mount();
  const touch=async(target,type,x,y)=>act(async()=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,type==='touchstart'?'touches':'changedTouches',{value:[{clientX:x,clientY:y}]});target.dispatchEvent(event);});
  const output=host.querySelector('.welcome-sample-stepper output');
  await touch(output,'touchstart',100,160);await touch(output,'touchend',270,165);expect(page()).toBe('2 of 3');
  const heading=host.querySelector('.welcome-exercise-heading');
  await touch(heading,'touchstart',100,160);await touch(heading,'touchend',270,165);expect(page()).toBe('1 of 3');
  const next=host.querySelector('[aria-label="Next introduction page"]');
  await touch(next,'touchstart',270,160);await touch(next,'touchend',100,165);expect(page()).toBe('1 of 3');
  await click('Next introduction page');expect(page()).toBe('2 of 3');
});
it('cancels interrupted and multi-finger gestures',async()=>{
  await mount();const carousel=host.querySelector('[aria-roledescription="carousel"]');
  const touch=async(type,points)=>act(async()=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,type==='touchstart'?'touches':'changedTouches',{value:points});carousel.dispatchEvent(event);});
  await touch('touchstart',[{clientX:270,clientY:160}]);await touch('touchcancel',[]);
  await touch('touchend',[{clientX:100,clientY:165}]);expect(page()).toBe('1 of 3');
  await touch('touchstart',[{clientX:270,clientY:160},{clientX:200,clientY:160}]);
  await touch('touchend',[{clientX:100,clientY:165}]);expect(page()).toBe('1 of 3');
});
it('supports deliberate horizontal trackpad scrolling once per gesture',async()=>{
  await mount();const carousel=host.querySelector('[aria-roledescription="carousel"]');
  const wheel=async(deltaX,deltaY,time,ctrlKey=false)=>act(async()=>{const event=new WheelEvent('wheel',{deltaX,deltaY,ctrlKey,bubbles:true});Object.defineProperty(event,'timeStamp',{value:time});carousel.dispatchEvent(event);});
  await wheel(10,100,100);expect(page()).toBe('1 of 3');
  await wheel(80,0,300,true);expect(page()).toBe('1 of 3');
  await wheel(30,0,500);await wheel(30,0,520);expect(page()).toBe('2 of 3');
  await wheel(100,0,550);expect(page()).toBe('2 of 3');
  await wheel(70,0,800);expect(page()).toBe('2 of 3');
  await wheel(-70,0,1100);expect(page()).toBe('1 of 3');
  expect(actions.onContinue).toHaveBeenCalledOnce();
});
