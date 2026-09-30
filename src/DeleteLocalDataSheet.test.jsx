import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Detail, ModalLayer} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {useAnimationClock} from './testAnimationClock.js';

const mocks = vi.hoisted(() => ({remove: vi.fn(), backup: vi.fn()}));
vi.mock('./localStateStorage.js', async original => ({...await original(), deleteLocalState: mocks.remove}));
vi.mock('./backup.js', async original => ({...await original(), createBackup: mocks.backup}));

let host, root, closed, loggedOut, state, reduced;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  useAnimationClock(); vi.clearAllMocks(); reduced = false;
  mocks.remove.mockResolvedValue(undefined);
  mocks.backup.mockResolvedValue({manifest:{createdAt:'2026-09-29T12:00:00Z'},bytes:new Uint8Array([1]),filename:'test.zip'});
  vi.stubGlobal('matchMedia', query => ({matches:query.includes('reduced-motion') && reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
  closed=vi.fn(); loggedOut=vi.fn(); state=createReturningUserFixture(0);
});
afterEach(() => {act(() => root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const frame = () => act(() => vi.advanceTimersToNextFrame());
const panel = () => host.querySelector('.logout-confirm-sheet');
const grab = () => panel().querySelector('.modal-drag-handle');
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.trim()===text);
const click = node => act(() => node.click());
function mount() {
  function Harness() {
    const [detail,setDetail]=useState('logout-confirm'),background=useRef(null);
    return <><div ref={background}>Data &amp; backup</div>{detail&&<ModalLayer backgroundRef={background} close={() => {closed();setDetail(null);}}>
      {close=><Detail detail={detail} state={state} update={fn=>{state=fn(structuredClone(state));}} close={close} setDetail={setDetail} onLogout={loggedOut}/>}
    </ModalLayer>}</>;
  }
  act(() => root.render(<Harness/>));advance(300);
  Object.defineProperty(panel(),'offsetHeight',{configurable:true,value:500});
  vi.spyOn(panel(),'getBoundingClientRect').mockReturnValue({x:0,y:344,top:344,bottom:844,left:0,right:390,width:390,height:500});
}
function pointer(type,y) {
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{clientY:y,clientX:180,pointerId:1,pointerType:'mouse',button:0});
  act(() => grab().dispatchEvent(event));
}
function drag(distance,end='pointerup') {
  pointer('pointerdown',100);advance(300);pointer('pointermove',100+distance);frame();pointer(end,100+distance);
}
function untouched(original) {
  expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.backup).not.toHaveBeenCalled();expect(loggedOut).not.toHaveBeenCalled();expect(state).toEqual(original);
}
it('the real Detail route has one shared handle and preserves alertdialog and all three actions',() => {
  mount();expect(panel().querySelectorAll('.modal-drag-handle')).toHaveLength(1);
  expect(panel().getAttribute('role')).toBe('alertdialog');expect(panel().getAttribute('aria-describedby')).toBe('logout-confirm-body');
  for(const text of ['BACK UP FIRST','DELETE LOCAL DATA','CANCEL'])expect(button(text)).toBeDefined();
});
it('moves 1:1 and fades before pointerup; a short drag settles without deleting or a ghost close',() => {
  mount();const original=structuredClone(state),target=panel();pointer('pointerdown',100);advance(300);pointer('pointermove',130);frame();
  expect(target.style.transform).toBe('translate3d(0, 30px, 0)');
  expect(Number(host.querySelector('.sheet-drag-scrim').style.opacity)).toBeCloseTo(1-30/(500*.65));
  expect(closed).not.toHaveBeenCalled();untouched(original);
  pointer('pointerup',130);expect(target.style.transition).toBe('transform 180ms ease-out');click(grab());advance(220);
  expect(target.style.transform).toBe('');expect(host.querySelector('.sheet-drag-scrim')).toBeNull();expect(closed).not.toHaveBeenCalled();untouched(original);
});
it.each(['drag','X','CANCEL','Escape','handle-key'])('%s safely dismisses without entering the destructive path',path => {
  mount();const original=structuredClone(state);
  if(path==='drag')drag(160);
  if(path==='X')click(panel().querySelector('.detail-header-close'));
  if(path==='CANCEL')click(button('CANCEL'));
  if(path==='Escape')act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  if(path==='handle-key')act(() => grab().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  advance(220);expect(panel()).toBeNull();expect(closed).toHaveBeenCalledOnce();untouched(original);
});
it.each(['pointercancel','lostpointercapture'])('%s clears transform/backdrop without deletion even past threshold',event => {
  mount();const original=structuredClone(state);drag(180,event);advance(220);
  expect(panel().style.transform).toBe('');expect(host.querySelector('.sheet-drag-scrim')).toBeNull();
  expect(panel().parentElement.style.backgroundColor).toBe('');expect(closed).not.toHaveBeenCalled();untouched(original);
});
it('native one-finger touch uses the same direct transform and safe dismissal',() => {
  mount();const original=structuredClone(state),target=grab();
  const touch=(type,y)=>{const e=new Event(type,{bubbles:true,cancelable:true}),point={clientX:180,clientY:y};Object.assign(e,{touches:type==='touchend'?[]:[point],changedTouches:[point]});act(()=>target.dispatchEvent(e));};
  touch('touchstart',100);advance(300);touch('touchmove',260);frame();expect(panel().style.transform).toBe('translate3d(0, 160px, 0)');
  touch('touchend',260);advance(220);expect(panel()).toBeNull();untouched(original);
});
it('a downward touch drag starting on Delete suppresses the trailing click instead of deleting',() => {
  mount();const original=structuredClone(state),target=button('DELETE LOCAL DATA');
  const touch=(type,y)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{touches:type==='touchend'?[]:[{clientX:180,clientY:y}]});act(()=>target.dispatchEvent(e));};
  touch('touchstart',100);advance(300);touch('touchmove',260);frame();touch('touchend',260);click(target);advance(220);
  expect(panel()).toBeNull();untouched(original);
});
it('Back up first opens only backup; explicit Create backup receives the unchanged state',async () => {
  mount();const original=structuredClone(state);click(button('BACK UP FIRST'));
  expect(panel()).toBeNull();expect(button('CREATE BACKUP')).toBeDefined();untouched(original);
  await act(async () => button('CREATE BACKUP').click());
  await act(async () => { await vi.waitFor(() => expect(mocks.backup).toHaveBeenCalledOnce()); });
  expect(mocks.backup).toHaveBeenCalledExactlyOnceWith(original,{allowUnavailablePhotos:false});
  expect(mocks.remove).not.toHaveBeenCalled();expect(loggedOut).not.toHaveBeenCalled();
});
it('only the explicit destructive button deletes once and calls the existing success callback',async () => {
  mount();await act(async () => button('DELETE LOCAL DATA').click());
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({clearPhotos:expect.any(Function),clearProfiles:expect.any(Function)});
  expect(loggedOut).toHaveBeenCalledOnce();expect(mocks.backup).not.toHaveBeenCalled();expect(closed).not.toHaveBeenCalled();
});
it('a deletion failure retains the existing error/retry state; subsequent Cancel never retries',async () => {
  mocks.remove.mockRejectedValueOnce(new Error('storage unavailable'));mount();await act(async () => button('DELETE LOCAL DATA').click());
  expect(panel().querySelector('[role=alert]').textContent).toContain('couldn’t finish deleting');expect(loggedOut).not.toHaveBeenCalled();
  click(button('CANCEL'));advance(220);expect(mocks.remove).toHaveBeenCalledTimes(1);expect(panel()).toBeNull();
});
it('reduced motion uses immediate reset and the shared dismissal path',() => {
  reduced=true;mount();drag(30);expect(panel().style.transition).toBe('none');advance(1);drag(160);advance(1);
  expect(panel()).toBeNull();expect(mocks.remove).not.toHaveBeenCalled();
});
