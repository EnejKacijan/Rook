import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail,ModalLayer} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {normalizeGymProfilesState} from './gymProfiles.js';
import {useAnimationClock} from './testAnimationClock.js';

let host,root,current,closed,viewport,reduced;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  useAnimationClock();vi.setSystemTime(new Date('2026-09-21T12:00:00'));reduced=false;
  vi.stubGlobal('matchMedia',query=>({matches:query==='(prefers-reduced-motion: reduce)'?reduced:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('innerHeight',844);vi.stubGlobal('innerWidth',390);
  viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});vi.stubGlobal('visualViewport',viewport);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollTo=function({top=0}={}){this.scrollTop=top;};
  HTMLElement.prototype.scrollIntoView=()=>{};
  HTMLElement.prototype.setPointerCapture=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);closed=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=node=>act(()=>node.click());
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const panel=()=>host.querySelector('.modal-layer>main');
const handle=()=>panel().querySelector('.modal-drag-handle');
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const trigger=()=>host.querySelector('.plate-calculator-entry');
const configure=()=>click(button('Configure bars and plates'));
const back=()=>click(panel().querySelector('.detail-header-back'));
const type=(input,value)=>act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
function mount(){
  let initial=createReturningUserFixture(0);normalizeGymProfilesState(initial);
  initial=addFreestyleExercise(startFreestyleWorkout(initial),'barbell-bench-press');
  initial.activeWorkout.exercises[0].sets[0].weight=80;
  function Harness(){
    const[state,setState]=useState(initial),[detail,setDetail]=useState(null),background=useRef(null);current=state;
    const update=fn=>setState(previous=>fn(structuredClone(previous)));
    return <><div ref={background}><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={()=>{}}/></div>{detail&&<ModalLayer backgroundRef={background} close={()=>{closed();setDetail(null);}}>{close=><Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail}/>}</ModalLayer>}</>;
  }
  act(()=>root.render(<Harness/>));act(()=>trigger().focus());click(trigger());advance(300);
  const target=panel();Object.defineProperty(target,'offsetHeight',{configurable:true,value:500});
  vi.spyOn(target,'getBoundingClientRect').mockReturnValue({top:344,bottom:844,left:0,right:390,width:390,height:500});
}
function touch(type,target,y,x=180){
  const event=new Event(type,{bubbles:true,cancelable:true}),point={identifier:1,clientX:x,clientY:y};
  Object.assign(event,{touches:['touchend','touchcancel'].includes(type)?[]:[point],changedTouches:[point]});
  act(()=>target.dispatchEvent(event));return event;
}
function drag(distance,{target=handle(),cancel=false,elapsed=200}={}){
  touch('touchstart',target,100);advance(elapsed);touch('touchmove',target,100+distance);touch(cancel?'touchcancel':'touchend',target,100+distance);
}
function expectClosed(original){
  advance(220);act(()=>vi.advanceTimersToNextFrame());expect(panel()).toBeNull();expect(closed).toHaveBeenCalledOnce();expect(document.activeElement===trigger()).toBe(true);expect(current).toEqual(original);
}
it('real logger route has one shared handle, one X, unchanged calculation content and modal semantics',()=>{
  mount();expect(panel().matches('.plate-calculator-sheet')).toBe(true);expect(panel().getAttribute('role')).toBe('dialog');expect(panel().getAttribute('aria-modal')).toBe('true');
  expect(panel().querySelectorAll('.modal-drag-handle,.sheet-grab-zone')).toHaveLength(1);expect(panel().querySelectorAll('.detail-header-close')).toHaveLength(1);expect(panel().querySelector('.sheet-close')).toBeNull();
  expect(handle().getAttribute('tabindex')).toBe('0');expect(handle().getAttribute('aria-label')).toBe('Drag down or tap to close');
  expect(panel().textContent).toContain('PLATE CALCULATOR');expect(panel().querySelector('h2').textContent).toBe('80 kg');expect(panel().querySelector('.plate-combination').getAttribute('aria-label')).toBe('30 kg per side');expect(panel().textContent).toContain('Bar: 20 kg');expect(button('Configure bars and plates')).toBeDefined();
});
it('a small touch pull follows the finger, fades the backdrop and settles back without a ghost close',()=>{
  mount();const target=panel(),grab=handle();touch('touchstart',grab,100);advance(200);const move=touch('touchmove',grab,125);
  expect(move.defaultPrevented).toBe(true);expect(target.style.transform).toBe('translateY(25px)');expect(target.classList.contains('is-dragging')).toBe(true);expect(target.style.animation).toBe('none');
  const alpha=Number(target.parentElement.style.backgroundColor.match(/[\d.]+/g).at(-1));expect(alpha).toBeGreaterThan(0);expect(alpha).toBeLessThan(.35);
  touch('touchend',grab,125);expect(target.style.transform).toBe('');expect(target.style.transition).toBe('transform 180ms ease-out');click(grab);advance(400);expect(panel()).toBe(target);expect(closed).not.toHaveBeenCalled();
});
it.each(['drag','x','escape','handle-enter','handle-space'])('root %s closes once and returns focus to the original calculator trigger',method=>{
  mount();const original=structuredClone(current);
  if(method==='drag')drag(150);
  if(method==='x'){const x=panel().querySelector('.detail-header-close');click(x);click(x);}
  if(method==='escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  if(method.startsWith('handle-'))act(()=>handle().dispatchEvent(new KeyboardEvent('keydown',{key:method==='handle-enter'?'Enter':' ',bubbles:true,cancelable:true})));
  expectClosed(original);
});
it('touch cancellation, horizontal motion and upward scrolling never dismiss the calculator',()=>{
  mount();const target=panel();drag(180,{cancel:true});expect(target.style.transform).toBe('');advance(400);
  touch('touchstart',handle(),150,180);touch('touchmove',handle(),160,250);touch('touchend',handle(),160,250);
  touch('touchstart',target,200);touch('touchmove',target,100);touch('touchend',target,100);advance(400);expect(panel()).toBe(target);expect(closed).not.toHaveBeenCalled();
});
it('the shared touch velocity threshold dismisses a fast deliberate pull but preserves a slow one of the same length',()=>{
  mount();drag(80,{elapsed:400});advance(400);expect(closed).not.toHaveBeenCalled();
  const original=structuredClone(current);drag(80,{elapsed:100});expectClosed(original);
});
it('pointer cancellation resets a drag even after its distance would otherwise dismiss',()=>{
  mount();const grab=handle(),dispatch=(type,y)=>act(()=>grab.dispatchEvent(new MouseEvent(type,{bubbles:true,clientY:y,button:0})));
  dispatch('pointerdown',100);advance(200);dispatch('pointermove',260);expect(panel().style.transform).toBe('translateY(160px)');dispatch('pointercancel',260);advance(220);expect(panel().style.transform).toBe('');expect(closed).not.toHaveBeenCalled();
});
it('nested setup keeps one modal/header/handle, Back discards the unsaved draft and returns to the calculator',()=>{
  mount();const target=panel(),grab=handle(),original=structuredClone(current);configure();
  expect(panel()).toBe(target);expect(handle()).toBe(grab);expect(host.querySelectorAll('.modal-layer')).toHaveLength(1);expect(panel().querySelectorAll('.modal-drag-handle,.sheet-grab-zone')).toHaveLength(1);
  expect(panel().getAttribute('aria-labelledby')).toBe('calculator-plate-setup-title');expect(panel().querySelector('#calculator-plate-setup-title').textContent).toBe('Bars and plates');
  expect(panel().querySelector('.detail-header-back')).not.toBeNull();expect(panel().querySelector('.detail-header-close')).not.toBeNull();
  click(button('lb'));back();expect(panel().matches('.plate-calculator-sheet')).toBe(true);expect(panel().textContent).toContain('80 kg');expect(closed).not.toHaveBeenCalled();expect(current).toEqual(original);
  configure();expect(panel().querySelector('.plate-unit-segmented [aria-pressed=true]').textContent).toBe('kg');
});
it.each(['drag','x','escape'])('nested %s dismisses the whole flow and discards unsaved setup exactly like Close',method=>{
  mount();const original=structuredClone(current);configure();click(button('lb'));
  if(method==='drag')drag(150);if(method==='x')click(panel().querySelector('.detail-header-close'));
  if(method==='escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expectClosed(original);
});
it('setup saves only through the existing Save action and returns to the same calculator',()=>{
  mount();const workout=structuredClone(current.activeWorkout);configure();click(button('lb'));click(button('SAVE PLATE SETUP'));
  expect(panel().matches('.plate-calculator-sheet')).toBe(true);expect(panel().querySelector('h2').textContent).toContain('lb');expect(current.gymProfiles[0].plateSetup.unit).toBe('lb');expect(current.activeWorkout).toEqual(workout);expect(closed).not.toHaveBeenCalled();
});
it('scrolled setup content owns downward movement, then hands a deliberate pull to the shared dismiss path at top',()=>{
  mount();configure();const target=panel(),input=target.querySelector('input');target.scrollTop=180;
  touch('touchstart',input,100);advance(100);const scroll=touch('touchmove',input,180);expect(scroll.defaultPrevented).toBe(false);expect(target.style.transform).toBe('');expect(closed).not.toHaveBeenCalled();
  target.scrollTop=0;touch('touchmove',input,200);expect(target.style.transform).toBe('');advance(200);touch('touchmove',input,350);expect(target.style.transform).toBe('translateY(150px)');touch('touchend',input,350);expectClosed(structuredClone(current));
});
it('keyboard geometry retains the numeric draft, one viewport owner and the existing form scroll/close lifecycle',()=>{
  mount();configure();const target=panel(),original=structuredClone(current),input=target.querySelector('.plate-add-row input');
  type(input,'17.5');target.scrollTop=130;
  act(()=>{viewport.height=480;viewport.offsetTop=24;viewport.dispatchEvent(new Event('resize'));});
  expect(target.hasAttribute('data-sheet-keyboard-open')).toBe(true);expect(target.parentElement.style.height).toBe('844px');expect(target.parentElement.style.paddingBottom).toBe('340px');expect(target.style.maxHeight).toBe('468px');expect(target.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('0px');
  expect(target.querySelector('.plate-add-row input')).toBe(input);expect(document.activeElement).toBe(input);expect(input.value).toBe('17.5');expect(target.style.transform).toBe('');
  const start=target.scrollTop;touch('touchstart',input,100);advance(100);expect(touch('touchmove',input,140).defaultPrevented).toBe(false);touch('touchend',input,140);expect(target.scrollTop).toBe(start);expect(closed).not.toHaveBeenCalled();
  target.scrollTop=0;drag(150);expectClosed(original);
});
it('reduced motion reuses immediate shared settle and close without a calculator timer',()=>{
  reduced=true;mount();drag(25);expect(panel().style.transition).toBe('none');advance(400);const original=structuredClone(current);drag(150);expect(panel().style.transition).toBe('none');expectClosed(original);
});
it('the existing before-close guard applies equally to X and drag',()=>{
  mount();const guard=vi.fn(event=>event.preventDefault());panel().addEventListener('rook:before-sheet-close',guard);
  click(panel().querySelector('.detail-header-close'));drag(150);advance(220);expect(guard).toHaveBeenCalledTimes(2);expect(closed).not.toHaveBeenCalled();expect(panel().style.transform).toBe('');
});
