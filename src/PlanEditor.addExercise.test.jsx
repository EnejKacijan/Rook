import React,{act,useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PlanEditor,SheetHeader,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let root,host,state,source,saved,current,renderEditor;
const originalScroll=HTMLElement.prototype.scrollIntoView,originalDecode=HTMLImageElement.prototype.decode;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 useAnimationClock();
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});
 HTMLElement.prototype.scrollIntoView=vi.fn();
 vi.stubGlobal('PointerEvent',MouseEvent);
 // A transition whose snapshot never finishes must not hold a local addition.
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:vi.fn(()=>({ready:new Promise(()=>{}),finished:new Promise(()=>{})}))});
 state=createReturningUserFixture(2);state.savedWorkoutTemplates=[];state.activeWorkout=null;
 source={id:'draft',name:'New workout',source:'manual',days:[{id:'day',weekday:'Mon',name:'New workout',workoutName:'New workout',exercises:[]}]};
 saved=vi.fn();host=document.createElement('main');host.className='screen detail-screen edit-plan-screen';document.body.append(host);root=createRoot(host);
 renderEditor=(props={})=>act(()=>root.render(<StrictMode><PlanEditor source={source} profile={state.profile} exerciseState={state} mode="edit" workoutOnly onSave={saved} onCancel={()=>{}} {...props}/></StrictMode>));
});
afterEach(()=>{act(()=>root?.unmount());host?.remove();HTMLElement.prototype.scrollIntoView=originalScroll;HTMLImageElement.prototype.decode=originalDecode;delete document.startViewTransition;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=e=>act(()=>e.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const option=name=>[...host.querySelectorAll('.scratch-exercise-results [role=option]')].find(b=>b.querySelector('.exercise-picker-label')?.textContent.trim()===name);
const rows=()=>[...host.querySelectorAll('.plan-editor-heading > strong')].map(e=>e.textContent);
const open=()=>click(host.querySelector('.plan-workout-add'));
const add=name=>{open();click(option(name));};
const type=value=>act(()=>{const input=host.querySelector('input[type=search]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});

it.each(['edit','scratch','review'])('%s selection inserts before any transition, animation timer or cloud completion',mode=>{
 renderEditor({mode});open();click(option('Plank'));
 expect(rows()).toEqual(['Plank']);expect(host.querySelector('.scratch-exercise-results')).toBeNull();
 expect(document.startViewTransition).not.toHaveBeenCalled();expect(source.days[0].exercises).toEqual([]);expect(saved).not.toHaveBeenCalled();
});
it('offline addition does not invoke network or durable state persistence',()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const fetch=vi.fn(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetch);
 const write=vi.spyOn(domain,'saveState').mockReturnValue(false);
 renderEditor();add('Plank');expect(rows()).toEqual(['Plank']);expect(fetch).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
it('repeated click, pointerup and two queued result selections consume one picker opening',()=>{
 renderEditor();open();const first=option('Plank'),second=option('Push-up');
 act(()=>{first.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));first.click();first.click();second.click();first.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
 expect(rows()).toEqual(['Plank']);
 add('Push-up');expect(rows()).toEqual(['Plank','Push-up']);
});
it('duplicate exclusion and append order survive reopening and review',()=>{
 renderEditor();add('Push-up');open();expect(option('Push-up')).toBeUndefined();click(option('Plank'));add('Ab Wheel Rollout');
 expect(rows()).toEqual(['Push-up','Plank','Ab Wheel Rollout']);click(button('SAVE CHANGES'));
 expect(saved).toHaveBeenCalledOnce();expect(saved.mock.calls[0][0].days[0].exercises.map(e=>e.exerciseId)).toEqual(['push-up','plank','ab-wheel-rollout']);
});
it('search clears and closes without waiting for keyboard blur or stealing edit focus',()=>{
 renderEditor();open();type('plank');const input=host.querySelector('input[type=search]');
 const blur=vi.spyOn(input,'blur').mockImplementation(()=>new Promise(()=>{}));
 click(option('Plank'));expect(rows()).toEqual(['Plank']);expect(host.querySelector('input[type=search]')).toBeNull();expect(blur).not.toHaveBeenCalled();
 expect(document.activeElement.matches('input,textarea,select')).toBe(false);
 open();expect(host.querySelector('input[type=search]').value).toBe('');expect(option('Push-up')).toBeDefined();
});
it('a still-reduced visual viewport does not hold insertion for keyboard settling',()=>{
 const viewport=new EventTarget();Object.assign(viewport,{height:468,width:390,scale:1,offsetTop:0});vi.stubGlobal('visualViewport',viewport);
 renderEditor();open();type('plank');expect(host.getAttribute('data-sheet-keyboard-open')).not.toBeNull();expect(host.querySelector('footer').hidden).toBe(true);
 click(option('Plank'));expect(rows()).toEqual(['Plank']);expect(viewport.height).toBe(468);expect(host.getAttribute('data-sheet-keyboard-open')).not.toBeNull();expect(host.querySelector('footer').hidden).toBe(false);
});
it('pending or failed artwork never blocks the canonical row',()=>{
 const decode=vi.fn(()=>new Promise(()=>{}));HTMLImageElement.prototype.decode=decode;
 renderEditor();open();expect(option('Plank').querySelector('img')).not.toBeNull();
 act(()=>option('Plank').querySelector('img').dispatchEvent(new Event('error')));
 click(option('Plank'));expect(rows()).toEqual(['Plank']);expect(decode).not.toHaveBeenCalled();
});
it('current restriction policy removes disallowed results before insertion',()=>{
 renderEditor({profile:{...state.profile,avoid:'Avoid leg press'}});open();expect(option('Leg Press')).toBeUndefined();click(option('Plank'));expect(rows()).toEqual(['Plank']);
});
it('query edits keep canonical equipment restrictions and do not mutate or persist the draft',()=>{
 const restricted={...state.profile,equipment:['bodyweight'],avoid:'Avoid squats'};
 renderEditor({profile:restricted});open();const input=host.querySelector('input[type=search]');
 for(const query of ['squ','squat','press','plank']){type(query);expect(host.querySelector('input[type=search]')).toBe(input);expect(document.activeElement).toBe(input);}
 expect(option('Plank')).toBeDefined();type('squat');expect(option('Back Squat')).toBeUndefined();
 type('bench press');expect(option('Barbell Bench Press')).toBeUndefined();expect(source.days[0].exercises).toEqual([]);expect(saved).not.toHaveBeenCalled();
});
it('picker Cancel preserves previously added local rows and Review returns them in order without storage work',()=>{
 renderEditor();add('Plank');add('Push-up');open();type('squat');click(button('CANCEL'));
 expect(rows()).toEqual(['Plank','Push-up']);expect(source.days[0].exercises).toEqual([]);expect(saved).not.toHaveBeenCalled();
 click(button('SAVE CHANGES'));expect(saved.mock.calls[0][0].days[0].exercises.map(e=>e.exerciseId)).toEqual(['plank','push-up']);
});
it('an inactive editor rejects a result without closing or changing the draft',()=>{
 renderEditor({active:false});open();click(option('Plank'));expect(rows()).toEqual([]);expect(host.querySelector('.scratch-exercise-results')).not.toBeNull();expect(saved).not.toHaveBeenCalled();
});
it('plan limits remain enforced while Saved Workout keeps its existing unlimited editor policy',()=>{
 source.days[0].exercises=structuredClone(state.program.days[0].exercises);
 while(source.days[0].exercises.length<8)source.days[0].exercises.push({...structuredClone(source.days[0].exercises[0]),id:'existing-'+source.days[0].exercises.length});
 renderEditor({workoutOnly:false});expect(host.querySelector('.plan-workout-add').disabled).toBe(true);
 renderEditor();expect(host.querySelector('.plan-workout-add').disabled).toBe(false);add('Plank');expect(rows()).toHaveLength(9);
});
it('old detached results cannot insert after cancel or editor remount',()=>{
 renderEditor();open();const stale=option('Plank');click(button('CANCEL'));act(()=>stale.click());expect(rows()).toEqual([]);
 renderEditor({key:'fresh'});act(()=>stale.click());expect(rows()).toEqual([]);add('Plank');expect(rows()).toEqual(['Plank']);
});
it('Saved Workout durable failure preserves the unsaved addition for a single successful retry',()=>{
 const before=structuredClone(state);
 function Harness(){const[value,setValue]=useState(state);current=value;return <SavedWorkouts createNew state={value} update={fn=>setValue(previous=>fn(previous))} close={()=>{}} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>;}
 act(()=>root.render(<Harness/>));add('Plank');expect(current).toEqual(before);click(button('REVIEW WORKOUT'));
 const write=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('SAVE WORKOUT'));
 expect(current).toEqual(before);expect(host.textContent).toContain('Could not save');expect(host.querySelectorAll('.saved-template-exercises li')).toHaveLength(1);
 write.mockRestore();click(button('SAVE WORKOUT'));expect(current.savedWorkoutTemplates).toHaveLength(1);expect(current.savedWorkoutTemplates[0].exercises.map(e=>e.exerciseId)).toEqual(['plank']);
 expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);expect(current.activeWorkout).toEqual(before.activeWorkout);
});
