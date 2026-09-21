import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Detail,SheetHeader,PlanEditor,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {exerciseName} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft,useSavedWorkout} from './savedWorkouts.js';

let host,root,current,change;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=node=>act(()=>node.click());
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const warning=()=>host.querySelector('.saved-template-overlaps');
const checkbox=()=>warning()?.querySelector('input');
const add=()=>host.querySelector('.saved-workout-preview>.button.primary');
const open=()=>click(host.querySelector('.saved-workout-list .list-row'));
function fixture(overlaps=0,count=2){
  let state=['plank','barbell-bench-press','push-up','leg-press'].slice(0,count).reduce((s,id)=>addFreestyleExercise(s,id),startFreestyleWorkout(createReturningUserFixture(0)));
  const draft=templateDraft(state.activeWorkout,state);draft.name='Saved routine';
  draft.exercises.forEach(e=>{e.repMin=8;e.repMax=10;e.sets[0].reps=8;});
  state=saveWorkoutTemplate(state,draft,{id:'saved'});
  state.activeWorkout.exercises=state.activeWorkout.exercises.slice(0,overlaps);
  state.activeWorkout.exercises.forEach(e=>Object.assign(e.sets[0],{completed:true,reps:12,rir:2}));
  return state;
}
function mount(initial,embedded=false){
  function Harness(){
    const[state,setState]=useState(initial),[visible,setVisible]=useState(true);current=state;
    change=fn=>setState(previous=>fn(structuredClone(previous)));
    return <>{visible?(embedded?<Detail detail={{freestylePicker:true}} state={state} update={change} close={()=>setVisible(false)} setDetail={()=>{}}/>:<SavedWorkouts state={state} update={change} close={()=>setVisible(false)} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer}/>):<button onClick={()=>setVisible(true)}>Reopen saved workouts</button>}</>;
  }
  act(()=>root.render(<Harness/>));if(embedded)click(button('Saved workouts'));open();
}
it('no overlaps needs no warning or checkbox and keeps Add available',()=>{
  mount(fixture());expect(warning()).toBeNull();expect(host.querySelector('input[type=checkbox]')).toBeNull();expect(add().disabled).toBe(false);
});
it('one overlap has singular context, an associated action label, and explicit confirmation',()=>{
  mount(fixture(1));expect(warning().textContent).toContain('Plank is already in this workout');
  expect(warning().textContent).toContain('It will be added again as a separate exercise.');
  expect(checkbox().labels[0].textContent).toBe('Add it again');
  expect(document.getElementById(checkbox().getAttribute('aria-describedby')).textContent).toContain('Plank is already in this workout');
  expect(checkbox().checked).toBe(false);expect(add().disabled).toBe(true);
  click(checkbox().labels[0]);expect(checkbox().checked).toBe(true);expect(add().disabled).toBe(false);
  click(checkbox());expect(add().disabled).toBe(true);
});
it('two overlaps name both exercises and require the plural confirmation',()=>{
  const initial=fixture(2),names=initial.savedWorkoutTemplates[0].exercises.map(exerciseName);mount(initial);
  expect(warning().textContent).toContain('2 exercises are already in this workout');
  expect(warning().textContent).toContain(`${names.join(' and ')} will be added again as separate exercises.`);
  expect(checkbox().labels[0].textContent).toBe('Add them again');expect(add().disabled).toBe(true);
  click(checkbox());expect(add().disabled).toBe(false);
});
it('many overlaps retain full long names in a compact list and accessible description',()=>{
  const initial=fixture(4,4);initial.savedWorkoutTemplates[0].exercises[1].importedName='Single Arm Dumbbell Tricep Extension with a deliberate pause and controlled eccentric';
  const names=initial.savedWorkoutTemplates[0].exercises.map(exerciseName);mount(initial);
  expect(warning().textContent).toContain('4 exercises are already in this workout');
  expect([...warning().querySelectorAll('li')].map(node=>node.textContent)).toEqual(names);
  const description=document.getElementById(checkbox().getAttribute('aria-describedby')).textContent;
  for(const name of names)expect(description).toContain(name);
  expect(description).toContain('They will be added again as separate exercises.');expect(add().disabled).toBe(true);
});
it('repeated template entries remain separately counted rather than silently deduplicated',()=>{
  const initial=fixture(1,1),template=initial.savedWorkoutTemplates[0];template.exercises.push({...structuredClone(template.exercises[0]),id:'another-definition'});mount(initial);
  expect(warning().textContent).toContain('2 exercises are already in this workout');
  click(checkbox());click(add());expect(current.activeWorkout.exercises).toHaveLength(3);
  expect(new Set(current.activeWorkout.exercises.map(e=>e.id)).size).toBe(3);
});
it('successful add hides the entire confirmation, appends independent prescriptions and consumes the request once',()=>{
  const initial=fixture(2),original=structuredClone(initial.activeWorkout),template=structuredClone(initial.savedWorkoutTemplates[0]);mount(initial);
  click(checkbox());const primary=add();act(()=>{primary.click();primary.click();});
  expect(warning()).toBeNull();expect(host.querySelector('input[type=checkbox]')).toBeNull();expect(add().textContent).toBe('Added to Up Next');expect(add().disabled).toBe(true);
  const active=current.activeWorkout,entries=active.exercises.slice(2),requestId=active.queueCommandIds.at(-1);
  expect(active.id).toBe(original.id);expect(active.exerciseIndex).toBe(original.exerciseIndex);expect(active.exercises.slice(0,2)).toEqual(original.exercises);expect(active.exercises).toHaveLength(4);
  expect(new Set(active.exercises.map(e=>e.id)).size).toBe(4);expect(new Set(active.exercises.flatMap(e=>e.sets.map(s=>s.id))).size).toBe(4);
  entries.forEach((e,index)=>{expect(e.exerciseId).toBe(template.exercises[index].exerciseId);expect(e.queueAdditionId).toBe(requestId);expect(e.templatePrescription).toEqual(template.exercises[index]);expect(e.id).not.toBe(template.exercises[index].id);expect(e.sets[0]).toMatchObject({reps:8,completed:false});expect(e.sets[0].id).not.toBe(template.exercises[index].sets[0].id);});
  expect(current.savedWorkoutTemplates).toEqual(initial.savedWorkoutTemplates);expect(current.program).toEqual(initial.program);expect(current.workouts).toEqual(initial.workouts);
  expect(useSavedWorkout(current,{templateId:'saved',revision:1,sessionId:active.id,requestId,confirmDuplicates:true})).toBe(current);
});
it.each([false,true])('back/reopen recomputes overlaps and requires a fresh request and unchecked confirmation (embedded=%s)',embedded=>{
  mount(fixture(1),embedded);expect(warning().textContent).toContain('Plank is already in this workout');click(checkbox());click(add());
  const first=current.activeWorkout.queueCommandIds.at(-1),firstEntries=structuredClone(current.activeWorkout.exercises);
  click(host.querySelector('.detail-header-back'));open();
  expect(warning().textContent).toContain('2 exercises are already in this workout');expect(checkbox().checked).toBe(false);expect(add().disabled).toBe(true);
  click(checkbox());click(add());const second=current.activeWorkout.queueCommandIds.at(-1);
  expect(second).not.toBe(first);expect(current.activeWorkout.exercises.slice(0,3)).toEqual(firstEntries);expect(current.activeWorkout.exercises).toHaveLength(5);expect(warning()).toBeNull();
});
it('closing the preview and remounting starts a new unconfirmed add action',()=>{
  mount(fixture(1));click(checkbox());click(add());const first=current.activeWorkout.queueCommandIds.at(-1);
  click(host.querySelector('.detail-header-close'));click(button('Reopen saved workouts'));open();
  expect(checkbox().checked).toBe(false);expect(add().disabled).toBe(true);expect(warning().textContent).toContain('2 exercises are already in this workout');
  click(checkbox());click(add());expect(current.activeWorkout.queueCommandIds.at(-1)).not.toBe(first);
});
it('Undo removes only the added instances, preserves later work, and never reopens the consumed request',()=>{
  const initial=fixture(1);mount(initial);click(checkbox());click(add());const requestId=current.activeWorkout.queueCommandIds.at(-1);
  act(()=>change(state=>{state=addFreestyleExercise(state,'push-up');Object.assign(state.activeWorkout.exercises.at(-1).sets[0],{reps:17,completed:true});return state;}));
  const later=structuredClone(current.activeWorkout.exercises.at(-1));click(button('Undo'));
  expect(current.activeWorkout.id).toBe(initial.activeWorkout.id);expect(current.activeWorkout.exercises).toEqual([...initial.activeWorkout.exercises,later]);expect(warning()).toBeNull();expect(add().disabled).toBe(true);expect(host.textContent).toContain('Addition undone');
  expect(useSavedWorkout(current,{templateId:'saved',revision:1,sessionId:current.activeWorkout.id,requestId,confirmDuplicates:true})).toBe(current);
});
