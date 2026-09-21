import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {BottomNav} from './App.jsx';

let root,host,animations,reduced,listeners,setPage,commits;
function Harness(){const [page,change]=useState('today');setPage=change;commits.push(page);return <BottomNav page={page} setPage={change}/>;}
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;animations=[];reduced=false;listeners=[];commits=[];
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:(_,fn)=>listeners.push(fn),removeEventListener:(_,fn)=>{listeners=listeners.filter(f=>f!==fn);}}));
  vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:name=>({'--rook-motion-nav-select':'180ms','--rook-ease-standard':'cubic-bezier(.2,0,0,1)'}[name]||'')}));
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:function(frames,options){let finish;const finished=new Promise(resolve=>finish=resolve);const animation={element:this,frames,options,finished,finish,cancel:vi.fn()};animations.push(animation);return animation;}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();delete HTMLElement.prototype.animate;vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=id=>host.querySelector(`[aria-label="${id.toUpperCase()}"]`);
const select=id=>act(()=>button(id).click());

it('confirms committed selection immediately and scales only its icon, never a hit target or label',()=>{
  const nav=host.querySelector('nav'),buttons=[...host.querySelectorAll('button')],labels=[...host.querySelectorAll('.nav-label')];
  expect(animations).toHaveLength(0);select('coach');
  expect(button('coach').getAttribute('aria-current')).toBe('page');expect(commits).toEqual(['today','coach']);expect(animations).toHaveLength(1);
  expect(animations[0].element).toBe(button('coach').querySelector('.nav-icon'));
  expect(animations[0].frames.map(f=>f.transform)).toEqual(['scale(.96)','scale(1.07)','scale(1)']);expect(animations[0].options.duration).toBe(180);expect(animations[0].options.fill).toBeUndefined();
  expect(host.querySelector('nav')).toBe(nav);expect([...host.querySelectorAll('button')]).toEqual(buttons);expect([...host.querySelectorAll('.nav-label')]).toEqual(labels);
});
it.each([['today','coach','progress'],['profile','today','coach','profile']])('rapid %s sequence gives the newest selection sole animation ownership',async(...sequence)=>{
  for(const id of sequence)select(id);
  const last=animations.at(-1),previous=animations.slice(0,-1);
  expect(previous.every(a=>a.cancel.mock.calls.length===1)).toBe(true);
  expect(host.querySelector('[aria-current="page"]')).toBe(button(sequence.at(-1)));
  await act(async()=>{for(const a of previous)a.finish();});expect(last.cancel).not.toHaveBeenCalled();
  await act(async()=>last.finish());expect(last.cancel).toHaveBeenCalledOnce();
});
it('same-tab clicks retain navigation behavior without another pop or remount',()=>{
  select('coach');const icon=button('coach').querySelector('.nav-icon');select('coach');select('coach');
  expect(animations).toHaveLength(1);expect(button('coach').querySelector('.nav-icon')).toBe(icon);
});
it('pointer down cancels any old pop before native press feedback without preventing navigation',()=>{
  select('coach');const event=new Event('pointerdown',{bubbles:true,cancelable:true});
  act(()=>button('progress').dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(animations[0].cancel).toHaveBeenCalledOnce();
  expect(button('coach').getAttribute('aria-current')).toBe('page');select('progress');expect(animations).toHaveLength(2);expect(button('progress').getAttribute('aria-current')).toBe('page');
});
it('cancelled pointers and keyboard presses release old motion without owning selection',()=>{
  select('coach');act(()=>button('coach').dispatchEvent(new Event('pointercancel',{bubbles:true})));expect(animations[0].cancel).toHaveBeenCalledOnce();
  select('profile');act(()=>button('today').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(animations[1].cancel).toHaveBeenCalledOnce();expect(button('profile').getAttribute('aria-current')).toBe('page');
});
it('reduced motion selects immediately with no scale animation and cancels an in-flight pop on preference change',()=>{
  select('coach');reduced=true;act(()=>listeners.forEach(fn=>fn()));expect(animations[0].cancel).toHaveBeenCalledOnce();
  select('progress');expect(animations).toHaveLength(1);expect(button('progress').getAttribute('aria-current')).toBe('page');
});
it.each(['pagehide','blur','visibilitychange'])('%s settles transient motion',event=>{
  select('coach');act(()=>(event==='visibilitychange'?document:window).dispatchEvent(new Event(event)));expect(animations[0].cancel).toHaveBeenCalledOnce();
});
it('unmount releases animation/listeners and restored navigation never replays an entrance',()=>{
  select('coach');act(()=>root.render(null));expect(animations[0].cancel).toHaveBeenCalledOnce();expect(listeners).toHaveLength(0);
  act(()=>root.render(<BottomNav page="coach" setPage={()=>{}}/>));expect(animations).toHaveLength(1);
});
it('keeps native navigation without Web Animations support',()=>{
  delete HTMLElement.prototype.animate;select('profile');expect(button('profile').getAttribute('aria-current')).toBe('page');expect(animations).toHaveLength(0);
});
