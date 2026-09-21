import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Today,Detail,ModalLayer} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {createCustomExercise} from './customExercises.js';
import {saveWorkoutTemplate,templateDraft} from './savedWorkouts.js';

let root,host,current,change;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:00'));
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete HTMLElement.prototype.getAnimations;});
const click=node=>{expect(node).toBeTruthy();act(()=>node.click());};
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const picker=()=>document.querySelector('.freestyle-queue-picker');
const type=(input,value)=>act(()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
function mount(index=0){
 let initial=createReturningUserFixture(0);Object.assign(initial.profile,{showExerciseImages:false,restTimerEnabled:false});
 initial.program.days[0].exercises=initial.program.days[0].exercises.slice(0,3);initial.selectedDate=domain.isoDay();initial.selectedDay='Mon';
 initial.activeWorkout=domain.startWorkout(initial,initial.program.days[0]);initial.activeWorkout.exerciseIndex=index;
 Object.assign(initial.activeWorkout.exercises[0].sets[0],{completed:true,weight:45,reps:8,rir:2});
 createCustomExercise(initial,{name:'Owner one-arm exercise with a very long name',equipment:['dumbbells'],primaryMuscle:'chest',pattern:'horizontal-push',loggingType:'weight_reps',loggingMode:'per_side'});
 const draft=templateDraft(initial.activeWorkout,initial);draft.name='Saved extras';draft.exercises=draft.exercises.slice(0,2);initial=saveWorkoutTemplate(initial,draft,{id:'saved-extras'});
 function Harness(){
  const [state,setState]=useState(initial),[detail,setDetail]=useState(null),[page,setPage]=useState('workout'),background=useRef(null);current=state;
  const update=fn=>setState(previous=>fn(structuredClone(previous)));change=update;
  return <><div className="app-shell" ref={background}>{page==='today'?<Today state={state} update={update} setPage={setPage} setDetail={setDetail}/>:page==='workout'?<ActiveWorkout state={state} update={update} setPage={setPage} setDetail={setDetail}/>:<div>Completion</div>}</div>{detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{close=><Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail}/>}</ModalLayer>}</>;
 }
 act(()=>root.render(<Harness/>));return structuredClone(initial);
}
function open(){click(button('+ ADD EXERCISE'));advance(100);expect(picker()).not.toBeNull();}
function search(query){type(picker().querySelector('input[type=search]'),query);advance(100);}
const close=()=>{click(picker().querySelector('[aria-label="Back to workout"]'));advance(220);advance(20);expect(picker()).toBeNull();};
const addLateral=()=>{search('Lateral Raise');click(picker().querySelector('[data-catalog-id="lateral-raise"] .queue-add-button'));};

it('places the shared 48px-style Add action after Up Next and never exposes Freestyle cancellation for a plan',()=>{
 mount();const action=button('+ ADD EXERCISE'),queue=host.querySelector('.up-next');expect(action.closest('.freestyle-actions')).not.toBeNull();
 expect(queue.compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(host.querySelector('[data-freestyle-cancel]')).toBeNull();
 open();expect(button('Exercises',picker())).toBeTruthy();expect(button('Saved workouts',picker())).toBeTruthy();expect(picker().querySelectorAll('input[type=search]')).toHaveLength(1);
});
it('commits a raw logger draft before opening and appends without remounting search or changing current work',()=>{
 const initial=mount(1),input=host.querySelector('[aria-label="Weight in kg for set 1"]');type(input,'42.5');open();
 expect(current.activeWorkout.exercises[1].sets[0].weight).toBe(42.5);const searchField=picker().querySelector('input'),scroll=picker().querySelector('[data-exercise-search-scroll]');scroll.scrollTop=90;addLateral();
 expect(picker().querySelector('input')).toBe(searchField);expect(document.activeElement).toBe(searchField);expect(searchField.value).toBe('Lateral Raise');
 expect(current.activeWorkout.exercises).toHaveLength(4);expect(current.activeWorkout.exerciseIndex).toBe(1);expect(current.activeWorkout.id).toBe(initial.activeWorkout.id);expect(current.program).toEqual(initial.program);
 close();expect(host.querySelector('.up-next-queue').lastElementChild.textContent).toContain('Lateral Raise');expect(host.querySelector('[aria-label="Weight in kg for set 1"]')).toBe(input);
 expect(host.querySelector('.workout-header-center small').textContent).toContain(`1 / ${domain.workoutSetSummary(current.activeWorkout).total} sets`);
});
it('the final prescribed exercise can still open Add and gain a normal next exercise',()=>{
 mount(2);expect(host.querySelector('.up-next')).toBeNull();expect(button('+ ADD EXERCISE')).toBeTruthy();open();addLateral();close();
 expect(current.activeWorkout.exerciseIndex).toBe(2);expect(button('NEXT EXERCISE →')).toBeTruthy();expect(host.querySelector('.up-next').textContent).toContain('Lateral Raise');
});
it('preview Add and deliberate Add again create exact separate instances with the existing five-second Undo',()=>{
 const initial=mount();open();search('Lateral Raise');click(picker().querySelector('[data-catalog-id="lateral-raise"] .queue-search-body'));
 click(button('Add to Up Next',picker()));const first=current.activeWorkout.exercises.at(-1);expect(button('In Up Next',picker())||picker().querySelector('.queue-preview-added')).toBeTruthy();
 click(button('Add again',picker()));expect(current.activeWorkout.exercises).toHaveLength(4);click(button('Add another instance',picker()));const second=current.activeWorkout.exercises.at(-1);expect(second.id).not.toBe(first.id);expect(second.exerciseId).toBe(first.exerciseId);
 advance(4999);expect(button('Undo',picker())).toBeTruthy();click(button('Undo',picker()));expect(current.activeWorkout.exercises.at(-1).id).toBe(first.id);expect(current.program).toEqual(initial.program);
 const loaded=domain.loadState();expect(loaded.activeWorkout.exercises.map(e=>e.id)).toEqual(current.activeWorkout.exercises.map(e=>e.id));
});
it('Do now from preview preserves and parks the previous exercise in the same planned session',()=>{
 const initial=mount(1);open();search('Lateral Raise');click(picker().querySelector('[data-catalog-id="lateral-raise"] .queue-search-body'));click(button('Do now',picker()));advance(250);
 expect(picker()).toBeNull();const active=current.activeWorkout;expect(active.id).toBe(initial.activeWorkout.id);expect(active.exercises[active.exerciseIndex].exerciseId).toBe('lateral-raise');expect(active.exercises[2].id).toBe(initial.activeWorkout.exercises[1].id);expect(active.exercises[2].sets).toEqual(initial.activeWorkout.exercises[1].sets);
 expect(host.querySelector('.exercise-meta').textContent).toBe('Choose your sets and reps');expect(host.querySelector('.recommendation')).toBeNull();expect(current.program).toEqual(initial.program);
});
it('Saved scope preserves search/header, requires duplicate confirmation and uses atomic batch Undo',()=>{
 const initial=mount();open();const input=picker().querySelector('input'),header=picker().querySelector('.detail-header');click(button('Saved workouts',picker()));click(button('Saved extras2 exercises›',picker()));
 const add=button('Add 2 exercises to Up Next',picker());expect(add.disabled).toBe(true);const checkbox=picker().querySelector('input[type=checkbox]');click(checkbox);click(add);
 expect(current.activeWorkout.exercises).toHaveLength(5);expect(current.program).toEqual(initial.program);expect(current.activeWorkout.id).toBe(initial.activeWorkout.id);expect(picker().querySelector('.detail-header')).toBe(header);expect(picker().querySelector('input[type=search]')).toBe(input);
 click(button('Undo',picker()));expect(current.activeWorkout.exercises).toEqual(initial.activeWorkout.exercises);
});
it('existing custom exercises use the same picker and independent per-side blank logger',()=>{
 const initial=mount();open();search('Owner one-arm');const row=picker().querySelector('.queue-search-row');expect(row.textContent).toContain('Custom');click(row.querySelector('.queue-search-body'));click(button('Do now',picker()));advance(250);
 const entry=current.activeWorkout.exercises[current.activeWorkout.exerciseIndex];expect(entry.exerciseSource).toBe('custom');expect(entry.loggingMode).toBe('per_side');expect(entry.sets[0].sides).toEqual({left:{reps:null},right:{reps:null}});expect(host.querySelector('[aria-label="left reps for set 1"]')).not.toBeNull();expect(host.querySelector('[aria-label="right reps for set 1"]')).not.toBeNull();expect(current.program).toEqual(initial.program);
});
it('Back/Resume and durable recovery retain the exact new instance, values and session',()=>{
 const initial=mount();open();addLateral();const id=current.activeWorkout.exercises.at(-1).id;close();const added=current.activeWorkout.exercises.at(-1);
 click(host.querySelector('[aria-label="Back to Today"]'));expect(host.querySelector('.today-screen')).not.toBeNull();click(button('RESUME WORKOUT'));advance(50);
 expect(host.querySelector('[data-active-workout]')).not.toBeNull();expect(current.activeWorkout.id).toBe(initial.activeWorkout.id);expect(current.activeWorkout.exercises.at(-1)).toEqual(added);
 expect(domain.loadState().activeWorkout.exercises.some(e=>e.id===id)).toBe(true);expect(current.program).toEqual(initial.program);
});
it('an unsuccessful durable save leaves the plan/session and search intact without successful feedback',()=>{
 const initial=mount();open();vi.spyOn(domain,'saveState').mockReturnValue(false);addLateral();expect(current.activeWorkout).toEqual(initial.activeWorkout);expect(current.program).toEqual(initial.program);expect(button('Undo',picker())).toBeUndefined();expect(picker().querySelector('[role=alert]').textContent).toContain('Could not save');
});
