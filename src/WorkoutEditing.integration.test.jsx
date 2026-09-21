import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ActiveWorkout,Detail,AdjustTodaySheet,PlanEditor,SheetHeader,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft} from './savedWorkouts.js';
let host,root,current,closed;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:00'));vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];host=document.createElement('div');document.body.append(host);root=createRoot(host);closed=vi.fn();});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=e=>act(()=>e.click()),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const templateOption=text=>{click(host.querySelector('[aria-label="Saved workout options"]'));click(button(text));act(()=>vi.advanceTimersByTime(250));};
const type=(input,value)=>act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
function mount(initial,render){function Harness(){const[state,setState]=useState(initial);current=state;return render(state,fn=>setState(prev=>fn(structuredClone(prev))));}act(()=>root.render(<Harness/>));}
it('actual Adjust Today editor keeps Remove/Undo in the draft, Cancel preserves prior state, and Apply persists only preparation',()=>{
 const initial=createReturningUserFixture(0),plan=structuredClone(initial.program);mount(initial,(state,update)=><AdjustTodaySheet state={state} update={update} close={closed}/>);
 click([...host.querySelectorAll('.choice-row')].find(b=>b.textContent.includes("Edit today's exercises")));
 const count=host.querySelectorAll('.plan-editor-exercise').length;expect(count).toBeGreaterThan(1);click(host.querySelector('[data-swipe-fallback]'));
 expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(count-1);expect(current.todayAdaptation).toBeNull();expect(current.program).toEqual(plan);expect(current.activeWorkout).toBeNull();
 click(button('Cancel'));expect(current.todayAdaptation).toBeNull();click([...host.querySelectorAll('.choice-row')].find(b=>b.textContent.includes("Edit today's exercises")));expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(count);
 click(host.querySelector('[data-swipe-fallback]'));click(button('APPLY'));expect(closed).toHaveBeenCalledOnce();expect(current.todayAdaptation.mode).toBe('manual');expect(current.todayAdaptation.workout.exercises).toHaveLength(count-1);expect(current.program).toEqual(plan);expect(current.activeWorkout).toBeNull();
});
it('raw logger input commits through real Add opening then Do now; previous unfinished work is parked intact',()=>{
 let initial=startFreestyleWorkout(createReturningUserFixture(0));initial=addFreestyleExercise(initial,'barbell-bench-press');initial=addFreestyleExercise(initial,'plank');
 function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null);current=state;const update=fn=>setState(s=>fn(structuredClone(s)));return <><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={()=>{}}/>{detail&&<Detail detail={detail} state={state} update={update} setDetail={setDetail} close={()=>setDetail(null)}/>}</>;}
 act(()=>root.render(<Harness/>));type(host.querySelector('[aria-label="Weight in kg for set 1"]'),'82,5');click(button('+ ADD EXERCISE'));
 act(()=>vi.advanceTimersByTime(80));type(host.querySelector('input[type="search"]'),'plank');
 click(host.querySelector('[data-catalog-id="plank"] .queue-search-body'));click(button('Do now'));
 expect(current.activeWorkout.exercises[0].exerciseId).toBe('plank');expect(current.activeWorkout.exercises[1].sets[0].weight).toBe(82.5);expect(current.activeWorkout.exercises[1].sets[0].completed).toBe(false);expect(host.textContent).toContain('Started · saved progress');
});
it('template save failure keeps review open, then successful retry saves once without changing the source',()=>{
 let initial=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank'),source=structuredClone(initial.activeWorkout);
 mount(initial,(state,update)=><SavedWorkouts source={source} state={state} update={update} close={closed} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>);
 type(host.querySelector('.saved-template-name input'),'Owner routine');const write=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Save template'));
 expect(current.savedWorkoutTemplates).toEqual([]);expect(closed).not.toHaveBeenCalled();expect(host.textContent).toContain('Could not save');write.mockRestore();click(button('Save template'));
 expect(current.savedWorkoutTemplates).toHaveLength(1);expect(current.savedWorkoutTemplates[0].name).toBe('Owner routine');expect(current.activeWorkout).toEqual(source);expect(closed).toHaveBeenCalledOnce();
});
it('saved workout preview requires explicit overlap confirmation, appends once, and safe batch Undo preserves prior work',()=>{
 let initial=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank');initial=saveWorkoutTemplate(initial,{...templateDraft(initial.activeWorkout,initial),name:'My saved workout'},{id:'saved'});
 mount(initial,(state,update)=><SavedWorkouts state={state} update={update} close={closed} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>);
 click(host.querySelector('.saved-workout-list .list-row'));expect(current.activeWorkout.exercises).toHaveLength(1);expect(button('Add 1 exercises to Up Next').disabled).toBe(true);
 click(host.querySelector('.saved-template-overlaps input'));
 const write=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Add 1 exercises to Up Next'));expect(current.activeWorkout).toEqual(initial.activeWorkout);expect(host.textContent).toContain('Could not save');write.mockRestore();
 click(button('Add 1 exercises to Up Next'));expect(current.activeWorkout.exercises).toHaveLength(2);expect(button('Added to Up Next').disabled).toBe(true);
 click(button('Undo'));expect(current.activeWorkout.exercises).toHaveLength(1);expect(current.activeWorkout.exercises[0].id).toBe(initial.activeWorkout.exercises[0].id);
});
it('template editor preserves unset timed/per-set targets on no-op review, and Cancel never changes the saved definition',()=>{
 let initial=addFreestyleExercise(addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank'),'push-up');initial=saveWorkoutTemplate(initial,{...templateDraft(initial.activeWorkout,initial),name:'Untimed hold'},{id:'saved'});
 const original=structuredClone(initial.savedWorkoutTemplates[0]);
 mount(initial,(state,update)=><SavedWorkouts state={state} update={update} close={closed} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>);
 click(host.querySelector('.saved-workout-list .list-row'));templateOption('Edit exercises');
 expect(host.querySelector('.plan-warmup-preference')).toBeNull();expect(host.querySelector('.plan-workout-overflow')).toBeNull();expect(host.querySelector('.workout-name-field')).toBeNull();
 click(host.querySelector('[data-swipe-fallback]'));expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(1);
 click(button('Cancel'));expect(current.savedWorkoutTemplates[0]).toEqual(original);
 templateOption('Edit exercises');click(button('REVIEW TEMPLATE'));click(button('Save template'));
 expect(current.savedWorkoutTemplates[0].revision).toBe(2);expect(current.savedWorkoutTemplates[0].exercises).toEqual(original.exercises);expect(current.activeWorkout).toEqual(initial.activeWorkout);
});
it('embedded saved browse, preview and editor keep the shared picker identity and draft boundaries',()=>{
 let initial=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank');initial=saveWorkoutTemplate(initial,{...templateDraft(initial.activeWorkout,initial),name:'My saved workout'},{id:'saved'});
 mount(initial,(state,update)=><Detail detail={{freestylePicker:true}} state={state} update={update} setDetail={()=>{}} close={closed}/>);
 const header=host.querySelector('.detail-header'),search=host.querySelector('input[type=search]');
 click(button('Saved workouts'));expect(host.querySelectorAll('.detail-header')).toHaveLength(1);expect(header.querySelector('strong').textContent).toBe('Add exercise');
 click(host.querySelector('.saved-workout-list .list-row'));templateOption('Edit exercises');
 expect(host.querySelector('.detail-header')).toBe(header);expect(host.querySelector('.plan-editor')).not.toBeNull();
 click(button('Cancel'));expect(current.savedWorkoutTemplates).toEqual(initial.savedWorkoutTemplates);expect(current.activeWorkout).toEqual(initial.activeWorkout);
 click(host.querySelector('.detail-header-back'));expect(host.querySelector('input[type=search]')).toBe(search);expect(button('Saved workouts')).toBeDefined();
 click(button('Exercises'));act(()=>vi.advanceTimersByTime(80));expect(host.querySelector('.detail-header')).toBe(header);expect(host.querySelectorAll('.queue-search-row')).toHaveLength(24);
});

function savedFixture(active=true){let s=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'plank');s=saveWorkoutTemplate(s,{...templateDraft(s.activeWorkout,s),name:'Saved routine'},{id:'saved'});if(!active)s.activeWorkout=null;return s;}
function mountSaved(initial){mount(initial,(state,update)=><SavedWorkouts state={state} update={update} close={closed} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>);click(host.querySelector('.saved-workout-list .list-row'));}
it.each(['close','back','backdrop','escape'])('saved options %s dismissal preserves data and returns focus to the trigger',method=>{
 const initial=savedFixture();mountSaved(initial);expect(button('Rename')).toBeUndefined();expect(button('Edit exercises')).toBeUndefined();expect(button('Delete template')).toBeUndefined();
 const trigger=host.querySelector('[aria-label="Saved workout options"]');trigger.focus();click(trigger);act(()=>vi.advanceTimersByTime(20));
 const panel=document.querySelector('.saved-template-options');expect(panel).not.toBeNull();expect(host.querySelector('.saved-workouts').inert).toBe(true);expect(panel.querySelector('.danger-text').textContent).toBe('Delete template');
 if(method==='close')click(panel.querySelector('.detail-header-close'));if(method==='back')click(panel.querySelector('.detail-header-back'));if(method==='backdrop')click(panel.parentElement);if(method==='escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
 act(()=>vi.advanceTimersByTime(250));act(()=>vi.advanceTimersByTime(40));
 expect(document.querySelector('.saved-template-options')).toBeNull();expect(document.activeElement).toBe(trigger);expect(current).toEqual(initial);expect(host.querySelector('.saved-workouts').inert).toBe(false);expect(closed).not.toHaveBeenCalled();
});
it.each([true,false])('rename cancel/save preserves identity, increments revision once, and leaves active=%s untouched',active=>{
 const initial=savedFixture(active);mountSaved(initial);templateOption('Rename');expect(host.querySelector('[aria-label="Saved workout options"]')).toBeNull();type(host.querySelector('.saved-template-name input'),'Cancelled rename');click(host.querySelector('.detail-header-back'));expect(current).toEqual(initial);
 templateOption('Rename');type(host.querySelector('.saved-template-name input'),'Renamed routine');click(button('Save template'));
 expect(current.savedWorkoutTemplates[0]).toMatchObject({id:'saved',revision:2,name:'Renamed routine',createdAt:initial.savedWorkoutTemplates[0].createdAt});expect(current.savedWorkoutTemplates[0].exercises).toEqual(initial.savedWorkoutTemplates[0].exercises);expect(current.activeWorkout).toEqual(initial.activeWorkout);expect(current.workouts).toEqual(initial.workouts);
});
it('delete cancel/failure/retry requires confirmation, deletes once and preserves history/session/plan',()=>{
 const initial=savedFixture();mountSaved(initial);templateOption('Delete template');expect(current).toEqual(initial);expect(host.textContent).toContain('Your workout history and active session remain saved.');click(button('Cancel'));expect(current).toEqual(initial);
 templateOption('Delete template');const write=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Delete template only'));expect(current).toEqual(initial);expect(host.querySelector('[role=alert]').textContent).toContain('Could not save');write.mockRestore();
 const save=vi.spyOn(domain,'saveState'),confirm=button('Delete template only');act(()=>{confirm.click();confirm.click();});
 expect(save).toHaveBeenCalledOnce();expect(current.savedWorkoutTemplates).toEqual([]);expect(current.activeWorkout).toEqual(initial.activeWorkout);expect(current.workouts).toEqual(initial.workouts);expect(current.program).toEqual(initial.program);expect(host.textContent).toContain('Template deleted');expect(host.querySelector('.saved-workout-preview')).toBeNull();
});
it('new-template visible Edit cancels draft edits and Review saves only the intended reusable definition',()=>{
 const initial=addFreestyleExercise(savedFixture(),'push-up'),source=initial.activeWorkout;
 mount(initial,(state,update)=><SavedWorkouts source={source} state={state} update={update} close={closed} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>);
 expect(host.querySelector('[aria-label="Saved workout options"]')).toBeNull();expect(host.querySelector('.saved-template-save-actions .text-button').textContent).toBe('Edit exercises');
 type(host.querySelector('.saved-template-name input'),'New routine');click(button('Edit exercises'));click(host.querySelector('[data-swipe-fallback]'));click(button('Cancel'));expect(host.querySelector('.saved-template-name input').value).toBe('New routine');expect(host.querySelectorAll('.saved-template-exercises li')).toHaveLength(2);expect(current).toEqual(initial);
 click(button('Edit exercises'));click(button('REVIEW TEMPLATE'));click(button('Save template'));expect(current.savedWorkoutTemplates).toHaveLength(2);expect(current.savedWorkoutTemplates[1]).toMatchObject({name:'New routine',revision:1});expect(current.activeWorkout).toEqual(source);expect(closed).toHaveBeenCalledOnce();
});
