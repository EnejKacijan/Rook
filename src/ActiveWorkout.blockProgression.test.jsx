import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import {createTrainingBlock,prescribeTrainingBlockWorkout} from './trainingBlocks.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {prepareProgressionApply} from './progressionApply.js';

let root,host,current;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T12:00:00'));sessionStorage.clear();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(week,{legacy=false,afterDeload=false}={}){
  const state=createReturningUserFixture(0);Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false,recommendedWarmupsEnabled:false,rampUpSetsEnabled:false,rirEnabled:true,showProgressionTips:true});
  state.profile.increments=Object.fromEntries(Object.keys(state.profile.increments).map(key=>[key,2.5]));
  const day=state.program.days[0],entry=day.exercises[0],first=entry.sets[0];
  Object.assign(entry,{repMin:6,repMax:10,targetRir:2,defaultIncrement:2.5,programmingRole:'main'});entry.sets=[1,2,3].map(i=>({...first,id:'target-'+i,reps:6,weight:null,completed:false,rir:null}));
  state.program.trainingBlock=createTrainingBlock(state.program,{totalWeeks:4,startDate:'2026-11-02'});
  for(const prior of afterDeload?[1,4]:Array.from({length:week-1},(_,i)=>i+1)){
    state.program.trainingBlock.currentWeek=prior;const workout=prescribeTrainingBlockWorkout(state,day);
    workout.id='history-'+prior;workout.programDayId=day.id;workout.completedAt=new Date(Date.UTC(2026,10,2+7*(prior-1),12)).toISOString();
    for(const exercise of workout.exercises){if(legacy)delete exercise.blockPrescription;for(const set of exercise.sets)Object.assign(set,{completed:true,weight:prior===4?20:50,reps:exercise.repMax,rir:exercise.targetRir});}
    state.workouts.push(workout);
  }
  state.program.trainingBlock.currentWeek=week;state.activeWorkout=startWorkout(state,prescribeTrainingBlockWorkout(state,day));return state;
}
function mount(state){function Harness(){const[value,setValue]=useState(state);current=value;return <ActiveWorkout state={value} update={operation=>setValue(old=>operation(old))} setPage={()=>{}} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));}

it('shows a usable next step across legacy weekly target changes in the real logger',()=>{
  const state=fixture(2,{legacy:true}),history=structuredClone(state.workouts);mount(state);
  expect(host.querySelector('.exercise-meta').textContent).toContain('7–11');expect(host.querySelector('.recommendation').textContent).toContain('Build reps first');
  expect(current.workouts).toEqual(history);
});
it('shows confirmation guidance instead of hiding advice after a planned RIR transition',()=>{
  mount(fixture(3,{legacy:true}));expect(host.querySelector('.recommendation').textContent).toContain('Repeat to confirm');
  expect(host.querySelector('.progression-apply-action')).toBeNull();
});
it('labels deload, displays its reduced targets, and has no increase action or normal PR badge',()=>{
  mount(fixture(4));expect(host.textContent).toContain('Deload · recovery session');
  expect(host.querySelector('.exercise-meta').textContent).toContain('2 × 6–10');expect(host.querySelector('.recommendation').textContent).toContain('Planned deload');
  expect(host.querySelector('.progression-apply-action')).toBeNull();expect(current.activeWorkout.exercises[0].targetRir).toBe(4);
  expect(current.activeWorkout.exercises[0].sets.every(set=>set.reps===6&&!set.completed)).toBe(true);
});
it('makes the normal source clear after deload and keeps the normal working load',()=>{
  mount(fixture(1,{afterDeload:true}));expect(host.textContent).toContain('Last normal');
  expect(current.activeWorkout.exercises[0].sets[0].weight).toBe(50);expect(host.textContent).not.toContain('Review the load');
});
it('keeps deload in exercise history while the normal strength trend skips it',()=>{
  const state=fixture(1,{afterDeload:true}),exercise=state.activeWorkout.exercises[0];
  act(()=>root.render(<Detail detail={{exercise}} state={state} update={()=>{}} close={()=>{}} setDetail={()=>{}}/>));
  expect(host.querySelector('.exercise-performance-history').textContent).toContain('Deload');
  expect(host.querySelectorAll('.exercise-performance-history .list-row')).toHaveLength(2);
  expect(host.querySelector('.exercise-e1rm-trend svg[aria-label]').getAttribute('aria-label')).toContain('Baseline · One session recorded');
});
it('revalidates a formerly valid increase if the active workout switches to deload',()=>{
  const state=fixture(3),exercise=state.activeWorkout.exercises[0];
  const last=structuredClone(state.workouts.at(-1));last.id='same-target-again';last.completedAt='2026-11-18T12:00:00';state.workouts.push(last);
  const advice=nextWorkoutAdvice(exercise,state.workouts,state.profile,state);expect(advice.weight).toBe(52.5);
  state.activeWorkout.trainingBlock.plannedDeload=true;const before=structuredClone(state);
  expect(()=>prepareProgressionApply(state,{sessionId:state.activeWorkout.id,exerciseId:exercise.id,advice,units:state.profile.units})).toThrow('suggestion changed');
  expect(state).toEqual(before);
});
