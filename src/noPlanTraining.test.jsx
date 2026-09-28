import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as domain from './domain.js';
import {NoPlanToday,PlanEditor,SheetHeader,ModalLayer} from './App.jsx';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft,useSavedWorkout} from './savedWorkouts.js';
import {stopFollowingPlan} from './stopFollowingPlan.js';
import {persistProgramReplacement} from './planReplacement.js';
import {trainingStyleFor} from './trainingStyle.js';
import {calendarDayPresentation} from './workoutCalendar.js';

let host,root;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo',()=>{});
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const click=element=>act(()=>element.click());
const button=label=>[...host.querySelectorAll('button')].find(item=>item.textContent.trim()===label);
function noPlan(style='freestyle') {
  const state=domain.blankState();
  state.profile.onboardingComplete=true;state.profile.preferredTrainingStyle=style;state.profile.noPlanReceipt={kind:'first-run'};
  state.profile.equipment=['full gym'];state.profile.environment='Commercial gym';
  state.selectedDate=domain.isoDay();
  return state;
}
function withTemplate(style='own-workouts') {
  let state=addFreestyleExercise(startFreestyleWorkout(noPlan(style)),'plank');
  state=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'Full Body'},{id:'template-full-body'});
  state.activeWorkout=null;
  return state;
}
function show(state,detail=vi.fn(),page=vi.fn()) {
  act(()=>root.render(<NoPlanToday state={state} update={()=>{}} setDetail={detail} setPage={page}/>));
  return {detail,page};
}

it('accepts an explicit no-plan profile through strict reload while rejecting a missing plan without intent',()=>{
  const state=noPlan();
  expect(domain.deserializeState(domain.serializeState(state),{strict:true}).profile.onboardingComplete).toBe(true);
  const damaged=createReturningUserFixture(0);damaged.program=null;
  expect(()=>domain.deserializeState(domain.serializeState(damaged),{strict:true})).toThrow();
  const preferredButPlanned=createReturningUserFixture(0);
  preferredButPlanned.profile.preferredTrainingStyle='freestyle';
  preferredButPlanned.planVersions=[{id:'planned-version',program:structuredClone(preferredButPlanned.program)}];
  preferredButPlanned.program=null;
  expect(()=>domain.deserializeState(domain.serializeState(preferredButPlanned),{strict:true})).toThrow();
  const missingPlanWithFreestyleHistory=withTemplate();
  delete missingPlanWithFreestyleHistory.profile.noPlanReceipt;
  expect(()=>domain.deserializeState(domain.serializeState(missingPlanWithFreestyleHistory),{strict:true})).toThrow();
});
it('migrates older saved-only data without onboarding and infers an own-workout presentation',()=>{
  const state=withTemplate();delete state.profile.preferredTrainingStyle;delete state.profile.noPlanReceipt;state.profile.onboardingComplete=false;
  const loaded=domain.deserializeState(domain.serializeState(state),{strict:true});
  expect(loaded.profile.onboardingComplete).toBe(true);
  expect(trainingStyleFor(loaded)).toBe('own-workouts');
  expect(loaded.savedWorkoutTemplates[0].id).toBe('template-full-body');
});
it('presents saved workouts first without a schedule shell and opens the existing template preview',()=>{
  const detail=vi.fn();show(withTemplate(),detail);
  expect(host.textContent).toContain('MY WORKOUTS');
  expect(host.textContent).toContain('Full Body');
  expect(host.textContent).toContain('Start freestyle workout');
  expect(host.textContent).not.toMatch(/Adjust week|missed workouts|UP NEXT/);
  click(host.querySelector('.no-plan-workout-list .list-row'));
  expect(detail).toHaveBeenCalledWith({savedWorkout:'template-full-body'});
});
it('shows Freestyle as the primary action and Create Workout with no saved templates',()=>{
  show(noPlan());
  expect(button('Start freestyle workout').classList.contains('primary')).toBe(true);
  expect(button('+ CREATE WORKOUT')).toBeDefined();
  expect(host.querySelector('.week-strip')).toBeNull();
});
it('keeps Resume ahead of other actions for active freestyle and saved workouts',()=>{
  for(const kind of ['freestyle','saved']){
    let state=kind==='saved'?withTemplate():noPlan();
    state=kind==='saved'?useSavedWorkout(state,{templateId:'template-full-body',revision:1,requestId:'use-once'}):startFreestyleWorkout(state);
    const page=vi.fn();show(state,vi.fn(),page);
    expect(host.querySelector('.active-workout-notice')).not.toBeNull();
    expect(host.textContent).not.toContain('+ CREATE WORKOUT');
    click(button('RESUME'));expect(page).toHaveBeenCalledWith('workout');
  }
});
it('uses the same saved-workout session flow without scheduling a workout',()=>{
  const state=withTemplate(),started=useSavedWorkout(state,{templateId:'template-full-body',revision:1,requestId:'once'});
  expect(started.activeWorkout.savedWorkoutTemplateId).toBe('template-full-body');
  expect(started.activeWorkout.exercises).toHaveLength(1);
  expect(started.program).toBeNull();
  expect(started.workoutOccurrenceOverrides).toEqual({});
});
it('creates a reusable workout through the existing Saved Workouts editor and never creates a plan',()=>{
  const definition=templateDraft(addFreestyleExercise(startFreestyleWorkout(noPlan()),'plank').activeWorkout,noPlan()).exercises;
  const persist=vi.spyOn(domain,'saveState').mockReturnValue(true);
  let current;
  function Editor({source,onSave}) {return <button onClick={()=>onSave({...source,days:[{...source.days[0],exercises:definition}]})}>Add exercise and review</button>;}
  function Harness(){const[state,setState]=useState(noPlan('own-workouts'));current=state;return <SavedWorkouts state={state} update={fn=>setState(previous=>fn(structuredClone(previous)))} close={()=>{}} Header={SheetHeader} Editor={Editor} Modal={ModalLayer} createNew/>;}
  act(()=>root.render(<Harness/>));
  expect(host.textContent).toContain('Create workout');
  click(button('Add exercise and review'));
  click(button('Save template'));
  expect(current.savedWorkoutTemplates).toHaveLength(1);
  expect(current.savedWorkoutTemplates[0].name).toBe('New workout');
  expect(current.program).toBeNull();
  expect(persist).toHaveBeenCalled();
});
it('stops a plan after a durable write and retains history, templates, and the archived plan',()=>{
  const state=createReturningUserFixture(0);
  const before=structuredClone(state),persist=vi.fn(()=>true);
  const next=stopFollowingPlan(state,persist);
  expect(next.program).toBeNull();
  expect(next.profile.onboardingComplete).toBe(true);
  expect(next.profile.noPlanReceipt).toEqual({kind:'stopped-plan',planVersionId:next.planVersions.at(-1).id});
  expect(next.workouts).toEqual(before.workouts);
  expect(next.savedWorkoutTemplates).toEqual(before.savedWorkoutTemplates);
  expect(next.planVersions.at(-1).program.id).toBe(before.program.id);
  expect(domain.deserializeState(domain.serializeState(next),{strict:true}).program).toBeNull();
  expect(persist).toHaveBeenCalledOnce();
  expect(state).toEqual(before);
  expect(()=>stopFollowingPlan(state,()=>false)).toThrow(/could not save/);
});
it('adopts a plan later without losing saved workouts or performed history',()=>{
  const state=withTemplate();
  state.workouts=[{id:'history-one',source:'freestyle',name:'Full Body',completedAt:new Date().toISOString(),workoutDateKey:domain.isoDay(),exercises:[]}];
  const program=createReturningUserFixture(0).program;
  const next=persistProgramReplacement(state,program,{source:'manual'},()=>true);
  expect(next.program?.id).toBe(program.id);
  expect(trainingStyleFor(next)).toBe('plan');
  expect(next.savedWorkoutTemplates).toEqual(state.savedWorkoutTemplates);
  expect(next.workouts).toEqual(state.workouts);
  expect(next.profile.onboardingComplete).toBe(true);
  expect(next.profile.noPlanReceipt).toBeNull();
  expect(domain.deserializeState(domain.serializeState(next),{strict:true}).program?.id).toBe(program.id);
  const damaged={...next,program:null};
  expect(()=>domain.deserializeState(domain.serializeState(damaged),{strict:true})).toThrow();
});
it('shows factual completed dates without inventing planned or missed markers',()=>{
  const state=noPlan();
  state.workouts=[{id:'done',source:'freestyle',name:'Freestyle',completedAt:new Date().toISOString(),workoutDateKey:domain.isoDay(),exercises:[{id:'exercise',sets:[{id:'set',completed:true,reps:8}]}]}];
  const day=calendarDayPresentation(state,[domain.isoDay()])[domain.isoDay()];
  expect(day.counts).toMatchObject({completed:1,planned:0,missed:0});
  expect(day.markers).toContain('completed');
  show(state);expect(host.querySelector('.today-completed-workouts .list-row').textContent).toContain('Freestyle');
});
it('gives Coach no scheduled workout and offers saved-workout names as optional context',()=>{
  const state=withTemplate();
  const context=domain.coachContext(state);
  expect(context.program).toBeNull();
  expect(context.todayStatus.type).toBe('open-training-day');
  expect(context.missedWorkouts).toEqual([]);
  expect(context.savedWorkouts).toEqual([{id:'template-full-body',name:'Full Body',exerciseCount:1}]);
});
