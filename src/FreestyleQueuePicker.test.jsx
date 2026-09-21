import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {FreestyleExercisePicker} from './FreestyleQueuePicker.jsx';
let host,root,current,close;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));HTMLElement.prototype.scrollTo=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);close=vi.fn();});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function mount(prepare=true){const initial=startFreestyleWorkout(createReturningUserFixture(0));function Harness(){const [state,setState]=useState(initial);current=state;return <FreestyleExercisePicker state={state} update={fn=>setState(s=>fn(structuredClone(s)))} close={close} Header={({onBack})=><header>{onBack&&<button onClick={onBack}>Back</button>}</header>}/>;}act(()=>root.render(<Harness/>));if(prepare)act(()=>vi.advanceTimersByTime(80));}
const click=node=>act(()=>node.click());
const row=id=>{let found=host.querySelector('[data-catalog-id="'+id+'"]');while(!found&&button('Show more exercises')){click(button('Show more exercises'));found=host.querySelector('[data-catalog-id="'+id+'"]');}return found;};
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
it('keeps focused search without cancelling the touch pointer sequence for Add and scope buttons',()=>{
 mount();const input=host.querySelector('input');act(()=>input.focus());
 const add=row('barbell-bench-press').querySelector('.queue-add-button');
 for(const target of [add,button('Saved workouts')]){
  const pointer=new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});
  act(()=>target.dispatchEvent(pointer));expect(pointer.defaultPrevented).toBe(false);
  const mouse=new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0});
  act(()=>target.dispatchEvent(mouse));expect(mouse.defaultPrevented).toBe(true);
  click(target);expect(document.activeElement).toBe(input);
 }
 expect(current.activeWorkout.exercises).toHaveLength(1);expect(button('Saved workouts').getAttribute('aria-pressed')).toBe('true');
 expect(host.querySelector('input')).toBe(input);
});
it('adds consecutive exercises without closing, remounting search or changing current work/rest',()=>{
 mount();const input=host.querySelector('input'),list=host.querySelector('[data-exercise-search-scroll]');list.scrollTop=123;
 for(const id of ['barbell-bench-press','dumbbell-bench-press','plank'])click(row(id).querySelector('.queue-add-button'));
 expect(current.activeWorkout.exercises).toHaveLength(3);expect(current.activeWorkout.exerciseIndex).toBe(0);expect(close).not.toHaveBeenCalled();
 expect(host.querySelector('input')).toBe(input);expect(list.scrollTop).toBe(123);expect(row('barbell-bench-press').textContent).toContain('Current');
 const add=row('plank').querySelector('.queue-add-button');click(add);expect(current.activeWorkout.exercises).toHaveLength(3);
});
it('body opens preview without mutation, explicit repeated instances have fresh identity and safe Undo',()=>{
 mount();click(row('barbell-bench-press').querySelector('.queue-add-button'));const before=structuredClone(current);click(row('barbell-bench-press').querySelector('.queue-search-body'));expect(current).toEqual(before);
 click(button('Add again'));click(button('Add another instance'));
 expect(current.activeWorkout.exercises).toHaveLength(2);expect(new Set(current.activeWorkout.exercises.map(e=>e.id)).size).toBe(2);
 click(button('Undo'));expect(current.activeWorkout.exercises).toHaveLength(1);expect(close).not.toHaveBeenCalled();
});
it('failed persistence publishes no addition or durable success and permits a safe retry',()=>{
 mount();const write=vi.spyOn(domain,'saveState').mockReturnValue(false),before=structuredClone(current);
 click(row('plank').querySelector('.queue-add-button'));expect(current).toEqual(before);expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');expect(host.querySelector('.queue-picker-feedback').textContent).toBe('');
 write.mockRestore();click(row('plank').querySelector('.queue-add-button'));expect(current.activeWorkout.exercises).toHaveLength(1);
});
function touch(type,target,x){const e=new Event(type,{bubbles:true,cancelable:true}),p={identifier:1,clientX:x,clientY:150};Object.assign(e,{touches:type==='touchend'?[]:[p],changedTouches:[p]});act(()=>target.dispatchEvent(e));}
it('a below-threshold Add swipe keeps the accessible button, query, scroll and session unchanged',()=>{
 mount();const input=host.querySelector('input'),list=host.querySelector('[data-exercise-search-scroll]');
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'bench');input.dispatchEvent(new Event('input',{bubbles:true}));vi.advanceTimersByTime(400);});list.scrollTop=90;
 const result=row('barbell-bench-press'),target=result.querySelector('[data-swipe-body]'),add=result.querySelector('.queue-add-button'),label=add.getAttribute('aria-label'),before=structuredClone(current);result.getBoundingClientRect=()=>({width:320});
 touch('touchstart',target,60);touch('touchmove',target,110);expect(result.hasAttribute('data-swipe-armed')).toBe(false);
 touch('touchend',target,110);touch('touchend',target,110);act(()=>vi.advanceTimersByTime(250));
 expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();expect(add.textContent).toBe('+');expect(add.getAttribute('aria-label')).toBe(label);expect(label).toMatch(/^Add .+ to Up Next$/);expect(add.disabled).toBe(false);
 expect(result.querySelector('.queue-swipe-cue').getAttribute('aria-hidden')).toBe('true');expect(document.activeElement).toBe(input);expect(input.value).toBe('bench');expect(list.scrollTop).toBe(90);expect(close).not.toHaveBeenCalled();
});
it.each([false,true])('swipe Add preserves focused query, scroll, session identity and durable boundary (failure %s)',fail=>{
 mount();const input=host.querySelector('input'),list=host.querySelector('[data-exercise-search-scroll]');
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'bench');input.dispatchEvent(new Event('input',{bubbles:true}));vi.advanceTimersByTime(400);});list.scrollTop=90;
 const result=row('barbell-bench-press'),target=result.querySelector('[data-swipe-body]'),before=structuredClone(current);result.getBoundingClientRect=()=>({width:320});
 const save=fail?vi.spyOn(domain,'saveState').mockReturnValue(false):null;
 touch('touchstart',target,60);touch('touchmove',target,230);expect(current).toEqual(before);expect(result.hasAttribute('data-swipe-armed')).toBe(true);
 touch('touchend',target,230);touch('touchend',target,230);
 expect(current).toEqual(before);act(()=>vi.advanceTimersByTime(70));
 expect(document.activeElement).toBe(input);expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('bench');expect(list.scrollTop).toBe(90);expect(close).not.toHaveBeenCalled();expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
 if(fail){expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();expect(host.querySelector('[role=alert]').textContent).toContain('Could not save');save.mockRestore();}
 else {expect(current.activeWorkout.exercises).toHaveLength(1);expect(result.textContent).toContain('Current');expect(domain.deserializeState(domain.serializeState(current),{strict:true}).activeWorkout.exercises).toEqual(current.activeWorkout.exercises);click(button('Undo'));expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);}
});
it('modest swipe adds Current then Up Next, while both existing result states reject repeat gestures',()=>{
 mount();const swipe=id=>{const result=row(id),target=result.querySelector('[data-swipe-body]');result.getBoundingClientRect=()=>({width:320});touch('touchstart',target,60);touch('touchmove',target,140);touch('touchend',target,140);act(()=>vi.advanceTimersByTime(70));return result;};
 const first=swipe('barbell-bench-press');expect(first.textContent).toContain('Current');const currentId=current.activeWorkout.exercises[0].id;
 const second=swipe('plank');expect(second.textContent).toContain('In Up Next');expect(current.activeWorkout.exercises[0].id).toBe(currentId);
 const before=structuredClone(current);swipe('barbell-bench-press');swipe('plank');expect(current).toEqual(before);expect(current.activeWorkout.exercises).toHaveLength(2);
});

it('paints only shared chrome first, prepares bounded results later and cancels preparation on close',()=>{
 mount(false);const input=host.querySelector('input'),header=host.querySelector('header');
 expect(input).not.toBeNull();expect(button('Back to workout')).toBeDefined();expect(host.querySelectorAll('.queue-search-row')).toHaveLength(0);
 act(()=>vi.advanceTimersByTime(80));expect(host.querySelectorAll('.queue-search-row')).toHaveLength(24);
 expect(host.querySelector('input')).toBe(input);expect(host.querySelector('header')).toBe(header);
 act(()=>root.render(null));act(()=>vi.advanceTimersByTime(100));expect(host.children).toHaveLength(0);
});
it('shares search/header identity, independent queries and scroll across both sources',()=>{
 mount();const input=host.querySelector('input'),header=host.querySelector('header'),list=host.querySelector('[data-exercise-search-scroll]');
 const type=value=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 type('bench');list.scrollTop=90;click(button('Saved workouts'));type('upper');
 expect(host.querySelectorAll('input[type=search]')).toHaveLength(1);expect(host.querySelector('header')).toBe(header);
 expect(host.textContent).toContain('No saved workouts yet');click(button('Exercises'));
 expect(input.value).toBe('bench');expect(list.scrollTop).toBe(90);expect(host.querySelector('input')).toBe(input);
 click(button('Saved workouts'));expect(input.value).toBe('upper');
});
it('cancels pending preparation on accepted close while a veto keeps the picker usable',async()=>{
 mount(false);const panel=host.querySelector('main');
 const veto=e=>e.preventDefault();panel.addEventListener('rook:before-sheet-close',veto);
 await act(async()=>{panel.dispatchEvent(new CustomEvent('rook:before-sheet-close',{cancelable:true}));await Promise.resolve();vi.advanceTimersByTime(80);});
 expect(host.querySelectorAll('.queue-search-row')).toHaveLength(24);panel.removeEventListener('rook:before-sheet-close',veto);
 act(()=>root.render(null));mount(false);
 await act(async()=>{host.querySelector('main').dispatchEvent(new CustomEvent('rook:before-sheet-close',{cancelable:true}));await Promise.resolve();vi.advanceTimersByTime(80);});
 expect(host.querySelectorAll('.queue-search-row')).toHaveLength(0);
});
