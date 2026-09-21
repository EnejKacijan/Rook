import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mainTabDirection,useMainTabTransition} from './mainTabTransition.js';

let host,root,select,animations,reduced,mediaListeners,mounts,unmounts;
function Screen({page}) {
  React.useEffect(()=>{mounts.push(page);return()=>unmounts.push(page);},[page]);
  return <main className={`screen ${page}-screen`}><input id="draft" defaultValue="saved draft"/><button>Destination action</button></main>;
}
function Harness(){
  const [page,setPage]=useState('today'),content=useRef();
  const prepare=useMainTabTransition(page,content);
  select=next=>{prepare(next);setPage(next);};
  return <div><div className="app-content" ref={content}><Screen key={page} page={page}/><nav className="bottom-nav"><button onClick={()=>select('coach')}>Coach</button></nav></div></div>;
}
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;animations=[];reduced=false;mediaListeners=[];mounts=[];unmounts=[];
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:(_,fn)=>mediaListeners.push(fn),removeEventListener:vi.fn()}));
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.matches('nav')?{left:0,top:744,bottom:800,width:390,height:56}:{left:0,top:0,bottom:1000,width:390,height:1000};});
  vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:name=>({'--rook-motion-tab':'160ms','--rook-motion-tab-reduced':'80ms','--rook-motion-tab-distance':'6px','--rook-ease-standard':'cubic-bezier(.2,0,0,1)'}[name]||'')}));
  vi.stubGlobal('Animation',class{});
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:function(frames,options){let finish;const finished=new Promise(resolve=>{finish=resolve;});const animation={element:this,frames,options,finished,finish,cancel:vi.fn()};animations.push(animation);return animation;}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();delete HTMLElement.prototype.animate;vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['today','coach','progress','profile'].flatMap((from,i)=>['today','coach','progress','profile'].filter(to=>to!==from).map(to=>[from,to,Math.sign(['today','coach','progress','profile'].indexOf(to)-i)])))('uses peer order for %s → %s', (from,to,direction)=>expect(mainTabDirection(from,to)).toBe(direction));
it('commits the destination in the same update without waiting for exit or mounting duplicate screens',()=>{
  expect(animations).toHaveLength(0);act(()=>select('coach'));
  expect(host.querySelector('.app-content > .coach-screen')).not.toBeNull();expect(mounts).toEqual(['today','coach']);expect(unmounts).toEqual(['today']);
  expect(host.querySelectorAll('#draft')).toHaveLength(1);
  const ghost=host.querySelector('.main-tab-paint');expect(ghost.hasAttribute('inert')).toBe(true);expect(ghost.getAttribute('aria-hidden')).toBe('true');expect(ghost.closest('.app-content')).toBeNull();
  expect(animations.map(a=>a.options.duration)).toEqual([160,160]);expect(animations[0].frames.at(-1).transform).toBe('translateX(-6px)');expect(animations[1].frames[0].transform).toBe('translateX(6px)');
  expect(animations.some(a=>a.element.matches('nav'))).toBe(false);
});
it('newest selection cancels prior motion and ignores its late completion',async()=>{
  act(()=>select('profile'));const old=[...animations];act(()=>select('coach'));
  expect(old.every(a=>a.cancel.mock.calls.length===1)).toBe(true);expect(host.querySelectorAll('.main-tab-paint')).toHaveLength(1);
  expect(animations.at(-1).frames[0].transform).toBe('translateX(-6px)');
  await act(async()=>old.at(-1).finish());expect(host.querySelectorAll('.main-tab-paint')).toHaveLength(1);
  await act(async()=>animations.at(-1).finish());expect(host.querySelector('.main-tab-paint')).toBeNull();
});
it('same-tab selection does not restart motion, and workout navigation cancels without animating',()=>{
  act(()=>select('coach'));act(()=>select('coach'));expect(animations).toHaveLength(2);
  act(()=>select('workout'));expect(animations).toHaveLength(2);expect(host.querySelector('.main-tab-paint')).toBeNull();expect(mainTabDirection('workout','today')).toBe(0);
});
it('keeps reduced motion to an 80 ms opacity change with zero horizontal travel',()=>{
  reduced=true;act(()=>select('coach'));expect(animations.every(a=>a.options.duration===80)).toBe(true);
  expect(animations.flatMap(a=>a.frames).every(frame=>frame.transform==='translateX(0)'||frame.transform==='translateX(0px)')).toBe(true);
});
it('releases animations and inert paint on preference changes and unmount',()=>{
  act(()=>select('coach'));act(()=>mediaListeners[0]());expect(host.querySelector('.main-tab-paint')).toBeNull();
  act(()=>select('today'));act(()=>root.render(null));expect(document.querySelector('.main-tab-paint')).toBeNull();expect(animations.every(a=>a.cancel.mock.calls.length)).toBe(true);
});
it('falls back to immediate navigation without Web Animations support',()=>{
  delete HTMLElement.prototype.animate;act(()=>select('coach'));expect(host.querySelector('.coach-screen')).not.toBeNull();expect(host.querySelector('.main-tab-paint')).toBeNull();
});
it('yields to a destination interaction without preventing its event or leaving an outgoing hit target',()=>{
  act(()=>select('coach'));const event=new Event('pointerdown',{bubbles:true,cancelable:true});
  act(()=>host.querySelector('.app-content .screen button').dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);expect(host.querySelector('.main-tab-paint')).toBeNull();expect(animations.every(a=>a.cancel.mock.calls.length)).toBe(true);
});
it('bounds the outgoing copy on unusually large screens while still entering the destination immediately',()=>{
  const screen=host.querySelector('.screen');for(let i=0;i<801;i++)screen.append(document.createElement('span'));
  act(()=>select('coach'));expect(host.querySelector('.main-tab-paint')).toBeNull();expect(animations).toHaveLength(1);expect(animations[0].element.matches('.coach-screen')).toBe(true);
});
