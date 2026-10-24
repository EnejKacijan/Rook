import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SheetHeader,PlanEditor,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {saveWorkoutTemplate} from './savedWorkouts.js';
import {planWorkoutChoices,resolvePlanWorkout} from './planWorkoutTemplates.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,mutate,persist,started;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);started=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=node=>act(()=>node.click());
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
function mount(initial=createReturningUserFixture(0),props={}){
  function Harness(){
    const [state,setState]=useState(initial);current=state;
    mutate=fn=>act(()=>setState(previous=>fn(structuredClone(previous))));
    return <SavedWorkouts state={state} update={fn=>setState(previous=>fn(previous))} close={()=>{}} Header={SheetHeader} Editor={PlanEditor} Modal={ModalLayer} onStarted={started} {...props}/>;
  }
  act(()=>root.render(<Harness/>));
}
const openPlan=(index=0)=>click(host.querySelectorAll('.plan-template-list .list-row')[index]);
const type=(node,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
const dialog=()=>document.querySelector('[aria-label="Start from your plan"]');
const dialogButton=text=>[...dialog().querySelectorAll('button')].find(node=>node.textContent.trim()===text);
function chooseScheduledDate(){
  const select=dialog().querySelector('select');
  act(()=>{select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));});
}
function scheduledFixture(){const state=createReturningUserFixture(0);state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';return state;}
it('reviews explicit occurrence dates without writes and saves moves plus start together only after confirmation',()=>{
  const initial=scheduledFixture();mount(initial);openPlan();click(button('Start workout'));
  expect(dialog()).toBeTruthy();expect(persist).not.toHaveBeenCalled();
  expect(dialogButton('Confirm changes & start').disabled).toBe(true);
  chooseScheduledDate();expect(dialog().textContent).toContain('Schedule changes');
  const start=dialogButton('Confirm changes & start');expect(start.disabled).toBe(false);
  click(start);click(start);expect(persist).toHaveBeenCalledOnce();expect(started).toHaveBeenCalledOnce();
  expect(current.activeWorkout.originalScheduledDate).toBe('2026-10-19');expect(current.activeWorkout.source).not.toBe('freestyle');
  expect(current.flexibleWeek.sessions[current.activeWorkout.logicalSessionId].scheduledDate).toBe('2026-10-23');
});
it('dismisses a scheduled review without changing state and rejects storage failure atomically before a successful retry',()=>{
  const initial=scheduledFixture();mount(initial);openPlan();click(button('Start workout'));chooseScheduledDate();
  click(dialog().querySelector('.detail-header-back'));act(()=>vi.runAllTimers());
  expect(dialog()).toBeNull();expect(persist).not.toHaveBeenCalled();expect(current).toEqual(initial);
  click(button('Start workout'));chooseScheduledDate();persist.mockReturnValue(false);click(dialogButton('Confirm changes & start'));
  expect(current).toEqual(initial);expect(started).not.toHaveBeenCalled();expect(dialog().textContent).toContain('Could not save');
  persist.mockReturnValue(true);click(dialogButton('Confirm changes & start'));expect(started).toHaveBeenCalledOnce();expect(current.activeWorkout).toBeTruthy();
});
it('blocks a stale schedule review and keeps Start as extra explicit and detached',()=>{
  mount();openPlan();click(button('Start workout'));chooseScheduledDate();mutate(s=>{s.profile.units='lb';return s;});
  expect(dialogButton('Confirm changes & start').disabled).toBe(true);expect(dialog().textContent).toContain('changed');expect(persist).not.toHaveBeenCalled();
  click(dialogButton('Start as extra'));expect(current.activeWorkout.source).toBe('freestyle');expect(current.flexibleWeek).toBeNull();
});
it('starts today’s matching occurrence directly without a schedule-change prompt',()=>{
  vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  const state=scheduledFixture();mount(state);openPlan(3);click(button('Start planned workout'));
  expect(dialog()).toBeNull();expect(started).toHaveBeenCalledOnce();expect(persist).toHaveBeenCalledOnce();
  expect(current.activeWorkout.originalScheduledDate).toBe('2026-10-24');expect(current.flexibleWeek).toEqual(state.flexibleWeek);
});
it('previews the effective same-day exercise edits, and requires a separate preview before starting an adjusted workout as extra',()=>{
  vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  const state=scheduledFixture(),day=state.program.days[3],excluded=day.exercises[0];
  state.workoutOccurrenceOverrides={'2026-10-24':{[day.id]:{excludedEntryIds:[excluded.id]}}};
  mount(state);openPlan(3);
  expect(host.textContent).toContain('Adjusted for today');
  expect([...host.querySelectorAll('.saved-template-exercises strong')].map(n=>n.textContent)).not.toContain(domain.exerciseName(excluded));
  expect(host.querySelectorAll('.saved-template-exercises li')).toHaveLength(day.exercises.length-1);
  click(button('Preview extra workout'));expect(persist).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.saved-template-exercises li')).toHaveLength(day.exercises.length);
  click(button('Start extra workout'));expect(current.activeWorkout.source).toBe('freestyle');
});
it('does not silently start a different same-day prescription if the dated edits change after preview',()=>{
  vi.setSystemTime(new Date('2026-10-24T12:00:00'));const state=scheduledFixture();mount(state);openPlan(3);
  mutate(s=>{const day=s.program.days[3];s.workoutOccurrenceOverrides={'2026-10-24':{[day.id]:{excludedEntryIds:[day.exercises[0].id]}}};return s;});
  click(button('Start planned workout'));expect(current.activeWorkout).toBeNull();expect(persist).not.toHaveBeenCalled();expect(host.textContent).toContain('changed');
});
it('searches plan and saved workout titles with spelling tolerance and clears back to the full library',()=>{
  let state=createReturningUserFixture(0);state.program.days[0].workoutName='Quick upper body';
  const {draft}=resolvePlanWorkout(state,planWorkoutChoices(state)[0].reference);
  state=saveWorkoutTemplate(state,{...draft,name:'Quick upper body'},{id:'saved'});mount(state);
  type(host.querySelector('[aria-label="Search workouts"]'),'quik upper');
  expect(host.querySelectorAll('.plan-template-list .list-row')).toHaveLength(1);
  expect(host.querySelectorAll('.saved-workout-list > .list-row')).toHaveLength(1);
  expect(host.querySelector('.plan-template-list strong').textContent).toBe('Quick upper body');
  click(host.querySelector('[aria-label="Clear search"]'));
  expect(host.querySelectorAll('.plan-template-list .list-row')).toHaveLength(state.program.days.length);
  expect(persist).not.toHaveBeenCalled();expect(current).toEqual(state);
});
it('uses the same typo search in the active workout saved-workout scope',()=>{
  let state=createReturningUserFixture(0);
  const {draft}=resolvePlanWorkout(state,planWorkoutChoices(state)[0].reference);
  state=saveWorkoutTemplate(state,{...draft,name:'Quick upper body'},{id:'saved'});
  mount(startFreestyleWorkout(state),{embedded:true,browseQuery:'quik upper'});
  expect(host.querySelector('.plan-template-list')).toBeNull();
  const matches=host.querySelectorAll('.saved-workout-list > .list-row');
  expect(matches).toHaveLength(1);click(matches[0]);
  expect(host.querySelector('.saved-workout-preview').textContent).toContain('Quick upper body');
  expect(persist).not.toHaveBeenCalled();
});
it('shows the current plan immediately without creating saved copies, and separates saved workouts',()=>{
  let state=createReturningUserFixture(0);state.program.days[1].name=state.program.days[0].name;
  const {draft}=resolvePlanWorkout(state,planWorkoutChoices(state)[0].reference);
  state=saveWorkoutTemplate(state,draft,{id:'saved'});mount(state);
  expect(host.querySelectorAll('.plan-template-list .list-row')).toHaveLength(state.program.days.length);
  expect(host.querySelector('.saved-template-section-title').textContent).toBe('Saved workouts');
  expect(host.querySelectorAll('.saved-workout-list > .list-row')).toHaveLength(1);
  openPlan(1);expect(host.querySelector('.saved-workout-preview').textContent).toContain('Tue');
  expect(host.querySelector('[aria-label="Saved workout options"]')).toBeNull();
  expect(persist).not.toHaveBeenCalled();expect(current).toEqual(state);
});
it('requires the explicit extra action, starts the reviewed prescription once and leaves the plan unchanged',()=>{
  const initial=createReturningUserFixture(0),before=structuredClone(initial);mount(initial);openPlan();
  expect(host.textContent).toContain('start an extra without changing your plan.');
  expect(persist).not.toHaveBeenCalled();const start=button('Start extra workout');click(start);click(start);
  expect(persist).toHaveBeenCalledOnce();expect(started).toHaveBeenCalledOnce();
  expect(current.activeWorkout).toMatchObject({source:'freestyle',programDayId:null});
  expect(current.activeWorkout.exercises).toHaveLength(before.program.days[0].exercises.length);
  expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  expect(current.savedWorkoutTemplates).toEqual(before.savedWorkoutTemplates);
});
it('Save a copy reviews a separate named draft and saves through the usual template writer',()=>{
  const initial=createReturningUserFixture(0),before=structuredClone(initial);mount(initial);openPlan();click(button('Save a copy'));
  expect(persist).not.toHaveBeenCalled();expect(host.querySelector('.saved-template-name input')).toBeTruthy();
  const save=button('SAVE WORKOUT');click(save);click(save);
  expect(persist).toHaveBeenCalledOnce();expect(current.savedWorkoutTemplates).toHaveLength(1);
  expect(current.program).toEqual(before.program);expect(current.activeWorkout).toBeNull();
  const copy=structuredClone(current.savedWorkoutTemplates[0]);
  mutate(s=>{s.program.days[0].exercises[0].sets.pop();return s;});
  expect(current.savedWorkoutTemplates[0]).toEqual(copy);
});
it('a changed plan blocks an old preview and a pending copy until reopened',()=>{
  mount();openPlan();mutate(s=>{s.program.version++;return s;});
  expect(button('Start extra workout').disabled).toBe(true);expect(button('Save a copy').disabled).toBe(true);
  expect(host.textContent).toContain('Your plan changed.');expect(persist).not.toHaveBeenCalled();
  click(host.querySelector('.detail-header-back'));openPlan();click(button('Save a copy'));
  mutate(s=>{s.program.id='replacement';return s;});click(button('SAVE WORKOUT'));
  expect(host.querySelector('[role="alert"]').textContent).toContain('Your plan changed.');
  expect(persist).not.toHaveBeenCalled();expect(current.savedWorkoutTemplates||[]).toHaveLength(0);
});
it('does not publish a session when durable storage fails',()=>{
  const initial=createReturningUserFixture(0);mount(initial);openPlan();persist.mockReturnValue(false);click(button('Start extra workout'));
  expect(current).toEqual(initial);expect(started).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
});
it('keeps plan workouts out of Add to Up Next and offers freestyle when the library is empty',()=>{
  mount(startFreestyleWorkout(createReturningUserFixture(0)),{embedded:true});
  expect(host.querySelector('.plan-template-list')).toBeNull();
  expect(button('Start extra workout')).toBeUndefined();
  act(()=>root.unmount());root=createRoot(host);
  const state=createReturningUserFixture(0);state.program=null;mount(state);
  expect(host.textContent).toContain('No workouts yet');expect(button('Create workout')).toBeTruthy();
  click(button('Start freestyle workout'));expect(current.activeWorkout.source).toBe('freestyle');expect(started).toHaveBeenCalledOnce();
});
