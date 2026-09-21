// @vitest-environment jsdom
import React,{act,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,PlanEditor,UpNextExerciseOptions} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import * as domain from './domain.js';
import {SwipeActionRow,useSwipeActionList} from './SwipeActionRow.jsx';
let root,host,current;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 host=document.createElement('main');host.className='screen';document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=element=>act(()=>root.render(element));
const click=el=>act(()=>el.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
function setupEditor(mode='edit',custom=false) {
 const state=createReturningUserFixture(0),source=structuredClone(state.program);
 source.days=source.days.slice(0,1);source.days[0].exercises=source.days[0].exercises.slice(0,3);
 const e=source.days[0].exercises[1];e.notes='Exact multiline\ncustom prescription';e.personalNote='Personal';e.sets[0].weight=123.5;e.repMin=7;
 if(custom)Object.assign(e,{exerciseId:'custom-owner-row',exerciseSource:'custom',matchStatus:'confirmed-custom',importedName:'Owner row',importedExercise:{name:'Owner row',equipment:['bodyweight'],primaryMuscles:['Back']},copiedFromExerciseId:'source-copy'});
 const draft={current:null};const save=vi.fn(),cancel=vi.fn();render(<PlanEditor source={source} profile={state.profile} exerciseState={state} mode={mode} scratchSessionRef={draft} onSave={save} onCancel={cancel}/>);
 return {source,save,cancel,draft};
}
it.each(['edit','scratch'])('%s removal is draft-only; Undo restores metadata and order; Save and Cancel use existing boundaries',mode=>{
 const {source,save,cancel}=setupEditor(mode),before=structuredClone(source),ids=()=>[...host.querySelectorAll('.plan-editor-exercise')].map(e=>e.id);
 const initial=ids();click(host.querySelectorAll('[data-swipe-fallback]')[1]);
 expect(ids()).toEqual([initial[0],initial[2]]);expect(source).toEqual(before);expect(save).not.toHaveBeenCalled();
 click(button('Undo'));expect(ids()).toEqual(initial);
 click(host.querySelectorAll('[data-swipe-fallback]')[1]);
 const submit=[...host.querySelectorAll('.sheet-action-footer button')].find(b=>b.classList.contains('primary'));
 expect(submit.disabled).toBe(false);click(submit);expect(save).toHaveBeenCalledOnce();
 expect(save.mock.calls[0][0].days[0].exercises.map(e=>e.id)).toEqual([before.days[0].exercises[0].id,before.days[0].exercises[2].id]);
 expect(source).toEqual(before);
 const cancelButton=host.querySelector('.sheet-action-footer [aria-label="Back"]');
 expect(cancelButton).not.toBeNull();click(cancelButton);expect(cancel).toHaveBeenCalledOnce();expect(source).toEqual(before);
});
it('editor restores a copied custom exercise, notes and prescription exactly',()=>{
 const {source,draft}=setupEditor('edit',true),before=structuredClone(draft.current.read().program);
 click(host.querySelectorAll('[data-swipe-fallback]')[1]);click(button('Undo'));
 expect(draft.current.read().program).toEqual(before);expect(source.days[0].exercises[1].exerciseId).toBe('custom-owner-row');
});
it('a later draft edit invalidates Undo without overwriting newer work',()=>{
 const {source,draft}=setupEditor();const before=structuredClone(source);
 click(host.querySelectorAll('[data-swipe-fallback]')[1]);
 const name=host.querySelector('.plan-name-field input');expect(name).not.toBeNull();
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'Changed draft');name.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(button('Undo')).toBeUndefined();expect(draft.current.read().program.days[0].exercises).toHaveLength(2);expect(source).toEqual(before);
});
it.each([false,true])('Up Next commits raw input without remounting or losing timer (RIR %s)',rir=>{
 const initial=createReturningUserFixture(0);initial.profile.rirEnabled=rir;initial.profile.restTimerEnabled=true;
 initial.activeWorkout=startWorkout(initial,initial.program.days[0]);
 initial.activeWorkout.exercises[0].sets[0].completed=true;
 initial.activeWorkout.rest={endsAt:Date.now()+60000};
 const before=structuredClone(initial.activeWorkout);
 function Harness(){const [state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}
 render(<Harness/>);
 const input=host.querySelector('[aria-label="Weight in kg for set 2"]');
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'142.5');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(current.activeWorkout.exercises[0].sets[1].weight).not.toBe(142.5);
 click(host.querySelector('.up-next [data-swipe-fallback]'));
 expect(current.activeWorkout.exercises).toHaveLength(before.exercises.length-1);
 expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(142.5);
 expect(current.activeWorkout.rest).toEqual(before.rest);expect(current.activeWorkout.startedAt).toBe(before.startedAt);expect(current.activeWorkout.exerciseIndex).toBe(0);
 expect(host.querySelector('[aria-label="Weight in kg for set 2"]')).toBe(input);
 click(button('Undo'));expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual(before.exercises.map(e=>e.id));
 expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(142.5);
});
it('removal saves the draft before its inert exit and cleans up after unmount',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 const {draft}=setupEditor();const initial=host.querySelectorAll('.plan-editor-exercise').length;
 click(host.querySelectorAll('[data-swipe-fallback]')[1]);expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(initial);
 expect(draft.current.read().program.days[0].exercises).toHaveLength(initial-1);expect(host.querySelector('[data-row-exit][inert][aria-hidden=true]')).not.toBeNull();act(()=>vi.advanceTimersByTime(220));expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(initial-1);
 click(host.querySelector('[data-swipe-fallback]'));render(<div>Left screen</div>);act(()=>vi.advanceTimersByTime(500));expect(host.textContent).toBe('Left screen');
});

it('the contextual row sheet offers the same eligible-only removal without a gesture',()=>{
 const state=createReturningUserFixture(0),workout=startWorkout(state,state.program.days[0]),remove=vi.fn(),close=vi.fn();
 workout.exercises[2].sets[0].completed=true;
 render(<UpNextExerciseOptions workout={workout} request={{sessionId:workout.id,exerciseId:workout.exercises[1].id}} onRemoveUpNext={remove} close={close}/>);
 const choices=[...host.querySelectorAll('button')].filter(b=>b.textContent==='Remove from this workout');
 expect(choices).toHaveLength(1);
 expect(choices.every(b=>b.textContent.includes('Remove from this workout'))).toBe(true);
 click(choices[0]);expect(remove).toHaveBeenCalledExactlyOnceWith(workout.exercises[1].id);expect(close).toHaveBeenCalledOnce();
});

it.each(['per_side','seconds'])('Up Next keeps independently edited %s values and mounted inputs',kind=>{
 const initial=createReturningUserFixture(0);initial.activeWorkout=startWorkout(initial,initial.program.days[0]);
 const exercise=initial.activeWorkout.exercises[0];
 if(kind==='per_side'){exercise.loggingMode='per_side';exercise.sets.forEach(s=>s.sides={left:{reps:8},right:{reps:9}});}
 else {exercise.exerciseId='plank';exercise.measure='seconds';exercise.loadRequirement='none';exercise.sets.forEach(s=>s.reps=30);}
 function Harness(){const [state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}
 render(<Harness/>);
 const label=kind==='per_side'?'left reps for set 1':'Seconds for set 1';
 const input=host.querySelector(`[aria-label="${label}"]`);expect(input).not.toBeNull();
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'37');input.dispatchEvent(new Event('input',{bubbles:true}));});
 click(host.querySelector('.up-next [data-swipe-fallback]'));
 const set=current.activeWorkout.exercises[0].sets[0];
 if(kind==='per_side'){expect(set.sides.left.reps).toBe(37);expect(set.sides.right.reps).toBe(9);}else expect(set.reps).toBe(37);
 expect(host.querySelector(`[aria-label="${label}"]`)).toBe(input);
});

function touch(type,target,x,y=100){const e=new Event(type,{bubbles:true,cancelable:true}),point={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:['touchend','touchcancel'].includes(type)?[]:[point],changedTouches:[point]});act(()=>target.dispatchEvent(e));}
it('binds a list mounted after empty state, preserving live finger tracking across clock rerenders',()=>{
 const remove=vi.fn();
 function Harness({empty,tick}){const ref=useRef(null);useSwipeActionList(ref);return empty?<p>Empty</p>:<section ref={ref}><span>{tick}</span><SwipeActionRow onRemove={remove}><span className="touch-body">Exercise</span></SwipeActionRow></section>;}
 render(<Harness empty/>);render(<Harness tick={1}/>);
 const target=host.querySelector('.touch-body'),row=host.querySelector('[data-swipe-row]');row.getBoundingClientRect=()=>({width:320,height:48});
 touch('touchstart',target,280);touch('touchmove',target,80);
 expect(row.hasAttribute('data-swipe-armed')).toBe(true);render(<Harness tick={2}/>);
 expect(host.querySelector('[data-swipe-row]')).toBe(row);expect(row.hasAttribute('data-swipe-armed')).toBe(true);expect(remove).not.toHaveBeenCalled();
 touch('touchend',target,250);expect(remove).not.toHaveBeenCalled();expect(row.querySelector('[data-swipe-content]').style.transform).toBe('');
});
it.each(['body','handle'])('direct %s removal exits continuously, has no action behind it, and restores exact draft on Undo',origin=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 const {draft,source}=setupEditor('edit',true),before=structuredClone(draft.current.read().program),persisted=structuredClone(source);
 const row=host.querySelectorAll('[data-swipe-row]')[1];row.getBoundingClientRect=()=>({width:320,height:64});
 const target=row.querySelector(origin==='body'?'.plan-editor-heading':'[data-reorder-kind]');
 touch('touchstart',target,290);touch('touchmove',target,110);
 expect(row.querySelector('[data-swipe-content]').style.transform).toContain('-180px');expect(draft.current.read().program).toEqual(before);
 expect(row.querySelector('[data-swipe-action]')).toBeNull();expect(row.querySelector('.swipe-remove-background').textContent).toBe('');
 touch('touchend',target,110);touch('touchend',target,110);expect(row.isConnected).toBe(false);const exit=host.querySelector('[data-row-exit]');expect(exit.querySelector('[data-swipe-content]').style.transform).toContain('-320px');expect(exit.hasAttribute('data-removing')).toBe(true);expect(draft.current.read().program.days[0].exercises).toHaveLength(2);expect(exit.querySelector('[data-reorder-kind], [id], [data-swipe-fallback]')).toBeNull();
 act(()=>vi.advanceTimersByTime(200));expect(row.isConnected).toBe(false);expect(source).toEqual(persisted);
 click(button('Undo'));expect(draft.current.read().program).toEqual(before);
});
it.each(['resize','visibilitychange','disabled','unmount'])('a release commits once; %s never retries or reverses the committed mutation',reason=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));const remove=vi.fn();
 function Harness({enabled=true}){const ref=useRef(null);useSwipeActionList(ref);return <section ref={ref}><SwipeActionRow enabled={enabled} onRemove={remove}>Exercise</SwipeActionRow></section>;}
 render(<Harness/>);const row=host.querySelector('[data-swipe-row]');row.getBoundingClientRect=()=>({width:320,height:48});
 touch('touchstart',row,290);touch('touchmove',row,100);touch('touchend',row,100);
 if(reason==='disabled')render(<Harness enabled={false}/>);else if(reason==='unmount')render(<div/>);else act(()=>(reason==='resize'?window:document).dispatchEvent(new Event(reason)));
 act(()=>vi.advanceTimersByTime(250));expect(remove).toHaveBeenCalledOnce();expect(host.querySelector('[data-removing]')).toBeNull();
});
it.each([false,true])('direct handle release preserves the active session and plan, including persistence failure (%s)',fail=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 const initial=createReturningUserFixture(0);initial.activeWorkout=startWorkout(initial,initial.program.days[0]);
 const before=structuredClone(initial);
 function Harness(){const [state,setState]=useState(initial);current=state;return <ActiveWorkout state={state} update={fn=>setState(s=>fn(structuredClone(s)))} setPage={()=>{}} setDetail={()=>{}}/>;}
 render(<Harness/>);
 const input=host.querySelector('[aria-label="Weight in kg for set 1"]');
 act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'142.5');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const write=fail?vi.spyOn(domain,'saveState').mockReturnValue(false):null;
 const row=host.querySelector('.up-next [data-swipe-enabled="true"]');row.getBoundingClientRect=()=>({width:320,height:48});
 const handle=row.querySelector('[data-reorder-kind]');touch('touchstart',handle,290);touch('touchmove',handle,90);expect(current.activeWorkout.exercises).toHaveLength(before.activeWorkout.exercises.length);touch('touchend',handle,90);
 expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(current.program).toEqual(before.program);
 expect(current.activeWorkout.exercises[0].sets[0].weight).toBe(142.5);expect(host.querySelector('[aria-label="Weight in kg for set 1"]')).toBe(input);
 expect(current.activeWorkout.exercises).toHaveLength(before.activeWorkout.exercises.length-(fail?0:1));
 if(fail){expect(host.querySelector('[data-row-exit]')).toBeNull();expect(host.textContent).toContain('Could not save');expect(button('Undo')).toBeUndefined();expect(row.querySelector('[data-swipe-content]').style.transform).toBe('');write.mockRestore();}
 else {
   const reloaded=domain.deserializeState(domain.serializeState(current),{strict:true});expect(reloaded.activeWorkout.exercises.map(e=>e.id)).toEqual(current.activeWorkout.exercises.map(e=>e.id));
   click(button('Undo'));expect(current.activeWorkout.exercises.slice(1)).toEqual(before.activeWorkout.exercises.slice(1));
 }
});
