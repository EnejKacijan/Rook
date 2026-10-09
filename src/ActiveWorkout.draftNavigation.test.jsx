// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';

let root,host,current,navigate,details;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 host=document.createElement('div');document.body.append(host);root=createRoot(host);navigate=vi.fn();details=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture({mode='per_side',id='dumbbell-rear-delt-fly',sides=[null,null]}={}){
 let s=startFreestyleWorkout(createReturningUserFixture(0));Object.assign(s.profile,{showExerciseImages:false,restTimerEnabled:false,rirEnabled:true});
 for(const exerciseId of ['seated-cable-row',id,'cable-fly'])s=addFreestyleExercise(s,exerciseId);
 s.activeWorkout.exerciseIndex=1;const e=s.activeWorkout.exercises[1];e.loggingMode=mode;
 const first=e.sets[0];e.sets=[0,1].map(i=>({...structuredClone(first),id:first.id+'-'+i,weight:35,reps:8,...(mode==='per_side'?{sides:{left:{reps:sides[0]},right:{reps:sides[1]}}}:{})}));
 return s;
}
function mount(initial=fixture()){
 function Harness(){const[state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={navigate} setDetail={details}/>;}
 act(()=>root.render(<Harness/>));
}
const button=name=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent.trim()===name);
const input=field=>host.querySelector(`[data-workout-field="${field}"] input`);
const set=()=>current.activeWorkout.exercises[1].sets[0];
const click=node=>act(()=>node.click());
const type=(node,raw)=>{act(()=>node.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,raw);node.dispatchEvent(new Event('input',{bubbles:true}));});};
const advance=()=>act(()=>vi.advanceTimersByTime(1000));
const pointerClick=node=>{act(()=>node.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>document.activeElement.blur());click(node);};
it('clearing Left then focusing Right leaves both unset and moves focus without a write',()=>{
 mount();const left=input('sides.left'),right=input('sides.right'),before=structuredClone(current);type(left,'');act(()=>right.focus());expect(document.activeElement).toBe(right);expect(left.value).toBe('');expect(current).toEqual(before);
});
it('Next opens the existing incomplete decision and continues without logging either side',()=>{
 mount();const before=structuredClone(current.activeWorkout.exercises[1]);type(input('sides.right'),'');pointerClick(button('NEXT EXERCISE →'));
 expect(document.querySelector('.workout-confirm')).not.toBeNull();click(button('SKIP INCOMPLETE SETS'));advance();
 expect(current.activeWorkout.exerciseIndex).toBe(2);expect(current.activeWorkout.exercises[1].sets).toEqual(before.sets);
 click(button('← PREVIOUS EXERCISE'));advance();expect(current.activeWorkout.exerciseIndex).toBe(1);expect(input('sides.right').value).toBe('');
});
it('Previous and header Back stay available with a blank draft and preserve workout/date/timer state',()=>{
 mount();const before=structuredClone(current);type(input('sides.left'),'');click(button('← PREVIOUS EXERCISE'));advance();expect(current.activeWorkout.exerciseIndex).toBe(0);
 expect(current.activeWorkout.exercises[1].sets).toEqual(before.activeWorkout.exercises[1].sets);expect(current.program).toEqual(before.program);
 type(input('weight'),'');click(button('Back to Today'));expect(navigate).toHaveBeenCalledWith('today');expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(current.activeWorkout.rest).toEqual(before.activeWorkout.rest);
});
it.each(['Workout options','Exercise options'])('empty draft does not block %s',name=>{
 mount();type(input('sides.left'),'');click(button(name));expect(details).toHaveBeenCalledOnce();expect(set().completed).toBe(false);
});
it('touch completion preserves a cleared draft through native blur and rejects only that set',()=>{
 mount(fixture({sides:[8,9]}));type(input('sides.right'),'');pointerClick(button('Log set 1'));
 expect(set().completed).toBe(false);expect(set().sides).toEqual({left:{reps:8},right:{reps:9}});expect(host.querySelector('[role="alert"]').textContent).toContain('Enter a value');expect(document.activeElement).toBe(input('sides.right'));
 click(button('← PREVIOUS EXERCISE'));advance();expect(current.activeWorkout.exerciseIndex).toBe(0);expect(set().completed).toBe(false);
});
it('programmatic/keyboard completion also rejects a blank draft instead of logging its old value',()=>{
 mount(fixture({sides:[8,9]}));type(input('sides.left'),'');click(button('Log set 1'));expect(set().completed).toBe(false);expect(document.activeElement).toBe(input('sides.left'));
});
it('a canonically empty set gives inline feedback; valid values can then complete it',()=>{
 mount();expect(button('Log set 1').getAttribute('aria-disabled')).toBe('false');click(button('Log set 1'));expect(set().completed).toBe(false);expect(host.querySelector('[role="alert"]').textContent).toContain('required values');
 type(input('sides.left'),'8');type(input('sides.right'),'9');click(button('Log set 1'));expect(set().completed).toBe(true);expect(set().sides).toEqual({left:{reps:8},right:{reps:9}});expect(host.querySelector('.workout-input-error')).toBeNull();
});
it('strict completion is scoped to its set; another uncompleted set draft cannot block it',()=>{
 mount(fixture({sides:[8,9]}));const other=host.querySelectorAll('[data-workout-field="sides.right"] input')[1];type(other,'');click(button('Log set 1'));expect(set().completed).toBe(true);expect(current.activeWorkout.exercises[1].sets[1].completed).toBe(false);
});
it('preserves the existing factual one-sided completion contract and does not invent the other side',()=>{
 mount(fixture({sides:[8,null]}));click(button('Log set 1'));expect(set().completed).toBe(true);expect(set().sides.right.reps).toBeNull();
});
it('valid Left plus blank Right survives navigation and strict serialize/reload without NaN or fabricated reps',()=>{
 mount();type(input('sides.left'),'8');type(input('sides.right'),'');click(button('Back to Today'));expect(set().sides).toEqual({left:{reps:8},right:{reps:null}});expect(set().completed).toBe(false);
 const saved=domain.serializeState(current),loaded=domain.deserializeState(saved,{strict:true});expect(saved).not.toMatch(/NaN|undefined/);expect(loaded.activeWorkout.exercises[1].sets[0].sides).toEqual(set().sides);
 act(()=>root.render(null));mount(loaded);expect(input('sides.left').value).toBe('8');expect(input('sides.right').value).toBe('');
});
it.each(['sides.left','sides.right'])('%s restores its prior canonical value on ordinary blur independently',field=>{
 mount(fixture({sides:[8,9]}));const before=structuredClone(set()),node=input(field);type(node,'');act(()=>node.blur());expect(set()).toEqual(before);expect(node.value).toBe(field==='sides.left'?'8':'9');
});
it.each([{id:'barbell-bench-press',field:'weight'},{id:'barbell-bench-press',field:'reps'},{id:'pull-up',field:'weight'},{id:'plank',field:'reps'}])('shared %j allows clear/retype, Done and Back without autolog',options=>{
 mount(fixture({mode:'normal',id:options.id}));const node=input(options.field);type(node,'');expect(node.value).toBe('');type(node,options.field==='weight'?'42,5':'12');
 act(()=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(document.activeElement).not.toBe(node);expect(set().completed).toBe(false);
 if(options.field==='weight')expect(set().weight).toBe(42.5);else expect(set().reps).toBe(12);
 type(node,'');click(button('Back to Today'));expect(navigate).toHaveBeenCalledWith('today');expect(set().completed).toBe(false);
});
it('pointer cancellation never autologs and does not trap the next ordinary action',()=>{
 mount(fixture({sides:[8,9]}));type(input('sides.right'),'');const log=button('Log set 1');act(()=>{log.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));log.dispatchEvent(new MouseEvent('pointercancel',{bubbles:true}));});click(button('Back to Today'));expect(navigate).toHaveBeenCalledOnce();expect(set().completed).toBe(false);expect(set().sides.right.reps).toBe(9);
});

it('ordinary blur clears completion feedback after safely restoring the previous canonical value',()=>{
 mount(fixture({sides:[8,9]}));type(input('sides.right'),'');pointerClick(button('Log set 1'));expect(host.querySelector('.workout-input-error')).not.toBeNull();
 act(()=>input('sides.left').focus());expect(host.querySelector('.workout-input-error')).toBeNull();expect(input('sides.right').value).toBe('9');expect(set().completed).toBe(false);
});

it('moving focus to Next keeps feedback geometry until its click, then opens the incomplete decision',()=>{
 mount(fixture({sides:[8,9]}));type(input('sides.right'),'');pointerClick(button('Log set 1'));const next=button('NEXT EXERCISE →');
 act(()=>next.focus());expect(host.querySelector('.workout-input-error')).not.toBeNull();click(next);expect(document.querySelector('.workout-confirm')).not.toBeNull();expect(host.querySelector('.workout-input-error')).toBeNull();expect(set().completed).toBe(false);
});
