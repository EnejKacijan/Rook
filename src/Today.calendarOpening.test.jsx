import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {Today} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {readFileSync} from 'node:fs';
import {useAnimationClock} from './testAnimationClock.js';

let root,host,current,original;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  useAnimationClock();vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:300,height:500,top:0,bottom:500,left:0,right:300});
  host=document.createElement('div');host.className='app-shell';document.body.append(host);root=createRoot(host);
  original=createReturningUserFixture(0);original.program.createdAt='2026-09-01T12:00:00';
  original.program.trainingBlock.startDate='2026-09-01';original.selectedDate='2026-09-21';original.selectedDay='Mon';
  original.profile.showExerciseImages=false;
  function Harness(){const [state,setState]=useState(original);current=state;return <Today state={state} update={fn=>setState(old=>fn(structuredClone(old)))} setPage={()=>{}} setDetail={()=>{}}/>;}
  act(()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const trigger=()=>host.querySelector('.week-calendar-trigger');
const panels=()=>document.querySelectorAll('.month-calendar-screen');
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
function pointer(type,x,y=40){const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});act(()=>trigger().dispatchEvent(event));return event;}
function touch(type,x,y=40,target=trigger()){
  const point={identifier:1,clientX:x,clientY:y},event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});
  act(()=>target.dispatchEvent(event));return event;
}
function click(detail=1){const event=new MouseEvent('click',{bubbles:true,cancelable:true,detail});act(()=>trigger().dispatchEvent(event));return event;}
function expectOpen(){expect(panels()).toHaveLength(1);expect(document.querySelectorAll('.modal-layer')).toHaveLength(1);expect(trigger().getAttribute('aria-expanded')).toBe('true');}

it('a normal pointer tap mounts one calendar at semantic click, before any frame/timer',()=>{
  pointer('pointerdown',160);expect(panels()).toHaveLength(0);
  pointer('pointerup',160);expect(panels()).toHaveLength(0);
  expect(click().defaultPrevented).toBe(false);expectOpen();expect(current).toEqual(original);
  // A repeated activation does not create a second portal or a pending open.
  click();expectOpen();advance(500);expectOpen();expect(current).toEqual(original);
});
it.each(['pointer','touch'])('small %s movement on the trigger remains an immediate tap',kind=>{
  const contact=kind==='pointer'?pointer:touch;
  contact(kind==='pointer'?'pointerdown':'touchstart',160);
  expect(contact(kind==='pointer'?'pointermove':'touchmove',166,43).defaultPrevented).toBe(false);
  contact(kind==='pointer'?'pointerup':'touchend',166,43);
  expect(panels()).toHaveLength(0);expect(click().defaultPrevented).toBe(false);expectOpen();expect(current).toEqual(original);
});
it('a real week swipe suppresses only its ghost click; the next contact opens without waiting 350ms',()=>{
  const viewport=host.querySelector('.week-pager-viewport');
  touch('touchstart',100,40,viewport);advance(120);touch('touchmove',260,40,viewport);touch('touchend',260,40,viewport);
  expect(click().defaultPrevented).toBe(true);expect(panels()).toHaveLength(0);
  advance(260);expect(current.selectedDate).toBe('2026-09-14');
  touch('touchstart',160);touch('touchend',160);expect(click().defaultPrevented).toBe(false);expectOpen();
  expect(current).toEqual({...original,selectedDate:'2026-09-14',selectedDay:'Mon'});
});
it('a canceled horizontal drag does not delay the next fresh calendar tap',()=>{
  touch('touchstart',160);advance(120);touch('touchmove',180);advance(120);touch('touchend',180);
  expect(click().defaultPrevented).toBe(true);expect(panels()).toHaveLength(0);
  touch('touchstart',160);touch('touchend',160);click();expectOpen();expect(current).toEqual(original);
});
it('close returns focus and immediate reopen has no stale suppression or duplicate layer',()=>{
  pointer('pointerdown',160);pointer('pointerup',160);act(()=>trigger().focus());click();expectOpen();advance(20);
  act(()=>document.querySelector('[aria-label="Close calendar"]').click());advance(220);act(()=>vi.advanceTimersToNextFrame());
  expect(panels()).toHaveLength(0);expect(trigger().getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(trigger());
  pointer('pointerdown',160);pointer('pointerup',160);click();expectOpen();advance(500);expectOpen();
});
it('keeps semantic keyboard activation and dialog accessibility',()=>{
  expect(trigger().tagName).toBe('BUTTON');expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger().getAttribute('aria-label')).toBe('Open calendar, Sep 21–27');expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(click(0).defaultPrevented).toBe(false);expectOpen();
  expect(panels()[0].getAttribute('role')).toBe('dialog');expect(panels()[0].getAttribute('aria-modal')).toBe('true');
});
it('restricts the week hover fill to fine hover pointers, leaving native keyboard focus rules intact',()=>{
  const css=readFileSync('src/calendar.css','utf8'),style=document.createElement('style');style.textContent=css;document.head.append(style);
  try {
    const hoverRules=[];
    const walk=(rules,media=[])=>{for(const rule of rules){if(rule.selectorText?.includes('.week-navigation button:hover'))hoverRules.push({rule,media});if(rule.cssRules)walk(rule.cssRules,[...media,rule.conditionText]);}};
    walk(style.sheet.cssRules);
    expect(hoverRules).toHaveLength(1);expect(hoverRules[0].media).toEqual(['(hover: hover) and (pointer: fine)']);
    expect(hoverRules[0].rule.style.background).toBe('#e9efec');
    expect(css).not.toMatch(/\.week-calendar-trigger[^{}]*:focus[^{}]*\{[^}]*outline:\s*none/);
  }finally{style.remove();}
});
