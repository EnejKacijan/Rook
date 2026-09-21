import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Detail,ActiveWorkout} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {createCustomExercise} from './customExercises.js';

let host,root,current,close,reduced,animations,updateWorkout;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();reduced=true;animations=[];
 vi.stubGlobal('matchMedia',query=>({matches:query.includes('reduced-motion')&&reduced,addEventListener(){},removeEventListener(){}}));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 HTMLElement.prototype.animate=function(frames,timing){const animation={node:this,frames,timing,cancel:vi.fn()};animations.push(animation);return animation;};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);close=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete HTMLElement.prototype.animate;});
const click=node=>act(()=>node.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>!b.closest('[inert],[hidden]')&&b.textContent.trim()===text);
const type=(input,value)=>act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
function fixture(kind='active'){
 let state=startFreestyleWorkout(createReturningUserFixture(0));state.profile.showExerciseImages=true;
 if(kind!=='empty')state=addFreestyleExercise(state,kind==='current'?'hack-squat':'leg-press');
 if(['queued','duplicates'].includes(kind))state=addFreestyleExercise(state,'hack-squat');
 if(kind==='duplicates')state=addFreestyleExercise(state,'hack-squat',{allowDuplicate:true});
 state.activeWorkout.rest={endsAt:Date.now()+90000,seconds:90};
 if(state.activeWorkout.exercises[0])Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:52.5,reps:10,rir:2,touched:true});
 return state;
}
function mount(initial=fixture(),workout=false){function Harness(){const[state,setState]=useState(initial);current=state;const update=fn=>setState(s=>fn(structuredClone(s)));updateWorkout=update;return <>{workout&&<ActiveWorkout state={state} update={update} setPage={()=>{}} setDetail={()=>{}}/>}<Detail detail={{freestylePicker:true}} state={state} update={update} close={close} setDetail={()=>{}}/></>;}act(()=>root.render(<Harness/>));act(()=>vi.advanceTimersByTime(80));}
function preview(query='hack squat'){type(host.querySelector('input[type=search]'),query);click(host.querySelector('.queue-search-body'));}
it('preview addition expires at five seconds through clock ticks, workout updates and preview state changes',()=>{
 mount(fixture(),true);preview();click(button('Add to Up Next'));
 const notice=()=>host.querySelector('.freestyle-queue-picker > .exercise-remove-undo');
 expect(notice().textContent).toBe('Hack Squat addedUndo');
 act(()=>vi.advanceTimersByTime(2000));
 act(()=>updateWorkout(s=>{s.activeWorkout.exercises[0].sets[0].reps=12;return s;}));
 click(button('Add again')); // Opening confirmation is not another addition.
 const pane=host.querySelector('.queue-exercise-preview');act(()=>{pane.scrollTop=90;pane.dispatchEvent(new Event('scroll'));});
 act(()=>vi.advanceTimersByTime(2999));expect(notice()).not.toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(notice()).toBeNull();
 expect(button('✓ In Up Next').disabled).toBe(true);expect(current.activeWorkout.exercises).toHaveLength(2);
 expect(current.activeWorkout.exercises[0].sets[0].reps).toBe(12);
});
it('Add again restarts Undo and a near-expiry Undo removes only that instance while retaining later workout data',()=>{
 mount();preview();click(button('Add to Up Next'));
 const session=structuredClone(current.activeWorkout),first=session.exercises[1].id;
 act(()=>vi.advanceTimersByTime(4000));click(button('Add again'));click(button('Add another instance'));
 const second=current.activeWorkout.exercises[2].id;expect(second).not.toBe(first);
 act(()=>vi.advanceTimersByTime(1000));expect(button('Undo')).toBeDefined();
 act(()=>updateWorkout(s=>{Object.assign(s.activeWorkout.exercises[0].sets[0],{weight:65,reps:14,completed:true});return s;}));
 act(()=>vi.advanceTimersByTime(3999));click(button('Undo'));
 expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual([session.exercises[0].id,first]);
 expect(current.activeWorkout.exercises[0].sets[0]).toMatchObject({weight:65,reps:14,completed:true});
 expect(current.activeWorkout.id).toBe(session.id);expect(current.activeWorkout.startedAt).toBe(session.startedAt);
 expect(current.activeWorkout.exerciseIndex).toBe(session.exerciseIndex);expect(current.activeWorkout.rest).toEqual(session.rest);
 expect(button('Undo')).toBeUndefined();expect(button('✓ In Up Next').disabled).toBe(true);
 expect(domain.deserializeState(domain.serializeState(current),{strict:true}).activeWorkout.exercises).toEqual(current.activeWorkout.exercises);
});
it('owner flow uses truthful priority, one durable addition, retained browser identity, and no preview Back-to-workout footer',()=>{
 mount();const initial=structuredClone(current),sheet=host.querySelector('.freestyle-queue-picker'),header=sheet.querySelector('header'),input=host.querySelector('input'),list=host.querySelector('[data-exercise-search-scroll]');
 type(input,'hack squat');list.scrollTop=123;click(host.querySelector('.queue-search-body'));
 expect(sheet.querySelector('header')).toBe(header);expect(sheet.classList.contains('exercise-search-sheet')).toBe(true);expect(sheet.classList.contains('has-sheet-action-footer')).toBe(true);expect(header.textContent).toContain('Exercise');expect(current).toEqual(initial);expect(button('Back to workout')).toBeUndefined();
 expect(button('Add to Up Next').className).toContain('primary');expect(button('Do now').className).toContain('secondary');expect(sheet.querySelector('[aria-label="View Hack Squat image"]')).not.toBeNull();
 const add=button('Add to Up Next'),save=vi.spyOn(domain,'saveState');act(()=>{add.click();add.click();});
 expect(save).toHaveBeenCalledOnce();expect(current.activeWorkout.exercises).toHaveLength(2);expect(current.activeWorkout.exercises[0]).toEqual(initial.activeWorkout.exercises[0]);expect(current.activeWorkout.rest).toEqual(initial.activeWorkout.rest);expect(close).not.toHaveBeenCalled();
 expect(button('✓ In Up Next').disabled).toBe(true);expect(host.querySelector('.queue-preview-added').className).toContain('is-acknowledged');
 click(host.querySelector('.detail-header-back'));expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('hack squat');expect(host.querySelector('[data-exercise-search-scroll]')).toBe(list);expect(list.scrollTop).toBe(123);expect(document.activeElement.className).toBe('queue-search-body');expect(button('Back to workout')).toBeDefined();
 click(host.querySelector('.queue-search-body'));expect(button('✓ In Up Next').disabled).toBe(true);expect(host.querySelector('.queue-exercise-preview').scrollTop).toBe(0);
 click(host.querySelector('.detail-header-close'));expect(close).toHaveBeenCalledOnce();expect(domain.deserializeState(domain.serializeState(current),{strict:true}).activeWorkout.exercises).toEqual(current.activeWorkout.exercises);
});
it('empty starts canonically once; current offers no redundant Do now or misleading Add',()=>{
 mount(fixture('empty'));preview();expect(button('Add to Up Next')).toBeUndefined();const start=button('Start with this exercise');act(()=>{start.click();start.click();});expect(current.activeWorkout.exercises).toHaveLength(1);expect(current.activeWorkout.exerciseIndex).toBe(0);expect(close).toHaveBeenCalledOnce();
 expect(button('Start with this exercise').disabled).toBe(true);act(()=>root.render(null));mount(fixture('current'));preview();expect(host.querySelector('.queue-preview-status').textContent).toBe('Current exercise');expect(button('Do now')).toBeUndefined();expect(button('Add to Up Next')).toBeUndefined();expect(button('Add again')).toBeDefined();
});
it('Add/Do now persistence failures retain actionable truthful preview, then retry succeeds',()=>{
 mount();preview();const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);
 click(button('Add to Up Next'));expect(current).toEqual(before);expect(button('✓ In Up Next')).toBeUndefined();expect(button('Add to Up Next').disabled).toBe(false);expect(host.querySelector('[role=alert]').textContent).toContain('Could not save');
 click(button('Do now'));expect(close).not.toHaveBeenCalled();expect(current).toEqual(before);save.mockRestore();click(button('Do now'));expect(close).toHaveBeenCalledOnce();expect(current.activeWorkout.exercises[0].exerciseId).toBe('hack-squat');expect(current.activeWorkout.exercises[1]).toEqual({...before.activeWorkout.exercises[0],startedAt:expect.any(Number)});
});
it('Do now twice selects the exact queued instance once and reuses scoped workout motion without touching header/rest/session',()=>{
 reduced=false;const initial=fixture('queued'),selected=initial.activeWorkout.exercises[1];mount(initial,true);preview();act(()=>vi.advanceTimersByTime(160));animations=[];
 const header=host.querySelector('.workout-header'),save=vi.spyOn(domain,'saveState'),doNow=button('Do now');act(()=>{doNow.click();doNow.click();});
 expect(save).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();expect(current.activeWorkout.id).toBe(initial.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(initial.activeWorkout.startedAt);expect(current.activeWorkout.rest).toEqual(initial.activeWorkout.rest);expect(current.activeWorkout.exercises[0].id).toBe(selected.id);expect(current.activeWorkout.exercises[1].sets).toEqual(initial.activeWorkout.exercises[0].sets);expect(host.querySelector('.workout-header')).toBe(header);
 const incoming=animations.find(a=>a.node.classList.contains('exercise-panel'));expect(incoming.timing.duration).toBe(180);expect(incoming.frames[0].transform).toBe('translateX(5px)');expect(animations.some(a=>a.node===header)).toBe(false);
});
it('ambiguous duplicates require explicit instance choice and Add again remains explicit',()=>{
 mount(fixture('duplicates'));preview();const before=structuredClone(current);click(button('Do now'));expect(current).toEqual(before);expect(close).not.toHaveBeenCalled();expect(document.activeElement).toBe(host.querySelector('.queue-preview-choice'));const choices=host.querySelectorAll('.queue-preview-choice button');expect(choices).toHaveLength(2);click(choices[1]);expect(current.activeWorkout.exercises[0].id).toBe(before.activeWorkout.exercises[2].id);
});
it('a Do now attempt during an in-progress durable Add cannot interleave mutations; retry selects the existing instance',()=>{
 mount();preview();const original=domain.saveState,doNow=button('Do now');let reentered=false;
 const save=vi.spyOn(domain,'saveState').mockImplementation(state=>{if(!reentered){reentered=true;doNow.click();}return original(state);});
 click(button('Add to Up Next'));expect(current.activeWorkout.exercises).toHaveLength(2);expect(current.activeWorkout.exercises[0].exerciseId).toBe('leg-press');expect(close).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]').textContent).toContain('Please wait');save.mockRestore();click(button('Do now'));expect(current.activeWorkout.exercises).toHaveLength(2);expect(current.activeWorkout.exercises[0].exerciseId).toBe('hack-squat');expect(close).toHaveBeenCalledOnce();
});
it('Add followed immediately by X retains the durable addition with no deferred reopen',()=>{
 mount();preview();act(()=>{button('Add to Up Next').click();host.querySelector('.detail-header-close').click();});expect(current.activeWorkout.exercises).toHaveLength(2);expect(close).toHaveBeenCalledOnce();act(()=>root.render(null));act(()=>vi.advanceTimersByTime(1000));expect(host.children).toHaveLength(0);expect(close).toHaveBeenCalledOnce();
});
it('the existing hide-images preference leaves a compact, fully actionable preview',()=>{
 const initial=fixture();initial.profile.showExerciseImages=false;mount(initial);preview();expect(host.querySelector('.queue-preview-hero')).toBeNull();expect(button('Add to Up Next')).toBeDefined();expect(button('Do now')).toBeDefined();
});
it('viewer reuses focus-safe fullscreen layer and returns to identical preview without losing search or data',()=>{
 mount();preview();const before=structuredClone(current),pane=host.querySelector('.queue-exercise-preview'),image=host.querySelector('[aria-label="View Hack Squat image"]');pane.scrollTop=45;click(image);
 expect(document.querySelector('.exercise-visual-viewer')).not.toBeNull();expect(document.querySelector('.exercise-visual-stage img').src).toBe(image.querySelector('img').src);click(document.querySelector('[aria-label="Close visual viewer"]'));
 act(()=>vi.advanceTimersByTime(32));expect(document.querySelector('.exercise-visual-viewer')).toBeNull();expect(host.querySelector('.queue-exercise-preview')).toBe(pane);expect(pane.scrollTop).toBe(45);expect(document.activeElement).toBe(image);expect(current).toEqual(before);
});
it('broken/disabled/missing artwork remains compact and does not block actions',()=>{
 const state=fixture();createCustomExercise(state,{id:'custom-preview',name:'Owner exceptionally long exercise name without artwork',equipment:['machines'],tracking:'weighted'});mount(state);preview();act(()=>host.querySelector('.queue-preview-hero img').dispatchEvent(new Event('error')));expect(host.querySelector('.queue-preview-hero')).toBeNull();expect(button('Add to Up Next')).toBeDefined();
 click(host.querySelector('.detail-header-back'));preview('Owner exceptionally');expect(host.querySelector('.queue-preview-hero')).toBeNull();click(button('Add to Up Next'));expect(current.activeWorkout.exercises.at(-1).exerciseId).toBe('custom-preview');
});
it.each([false,true])('inner motion preserves shell/search and cleans up on rapid Back/close (reduced %s)',motionReduced=>{
 reduced=motionReduced;mount();preview();const incoming=animations.filter(a=>!a.node.classList.contains('queue-preview-paint'));
 if(reduced){expect(incoming).toHaveLength(0);expect(host.querySelector('.queue-preview-paint')).toBeNull();}
 else {expect(incoming.length).toBeGreaterThan(0);expect(incoming.every(a=>a.timing.duration===160&&a.frames[0].transform==='translateX(5px)')).toBe(true);expect(host.querySelector('.queue-preview-paint').hasAttribute('inert')).toBe(true);}
 click(host.querySelector('.detail-header-back'));
 if(!reduced)expect(animations.filter(a=>!a.node.classList.contains('queue-preview-paint')).at(-1).frames[0].transform).toBe('translateX(-5px)');
 act(()=>host.querySelector('main').dispatchEvent(new CustomEvent('rook:before-sheet-close')));expect(host.querySelector('.queue-preview-paint')).toBeNull();act(()=>root.render(null));expect(document.querySelector('.queue-preview-paint')).toBeNull();expect(animations.every(a=>a.cancel.mock.calls.length>0)).toBe(true);
});
