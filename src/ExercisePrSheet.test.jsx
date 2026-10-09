import React,{act,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActiveWorkout,Detail,ModalLayer} from './App.jsx';
import {ExercisePrSheet} from './ExercisePrSheet.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let host,root,current,updates;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  useAnimationClock();vi.setSystemTime(new Date('2026-10-05T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollTo=function({top=0}={}){this.scrollTop=top;};
  HTMLElement.prototype.scrollIntoView=()=>{};
  localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);updates=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(){
  const state=createReturningUserFixture(0);state.profile.showExerciseImages=false;state.profile.rirEnabled=true;
  const day=state.program.days[0];day.exercises[0].exerciseId='incline-dumbbell-press';
  state.workouts=[{id:'prior',workoutDateKey:'2026-10-04',completedAt:'2026-10-04T18:00:00Z',exercises:[{...structuredClone(day.exercises[0]),sets:[{id:'prior-set',weight:30,reps:7,completed:true}]}]}];
  state.activeWorkout=startWorkout(state,day);
  state.activeWorkout.exercises[0].sets.forEach((set,index)=>Object.assign(set,{weight:30,reps:8,completed:index===0}));
  state.activeWorkout.rest={startedAt:Date.now(),endsAt:Date.now()+120000,duration:120};
  return state;
}
function mount(initial=fixture()){
  function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null),background=useRef(null);current=state;
    return <><div ref={background}><ActiveWorkout state={state} update={fn=>{updates();setState(before=>fn(structuredClone(before)));}} setDetail={setDetail} setPage={()=>{}}/></div>
      {detail&&<ModalLayer close={()=>setDetail(null)} backgroundRef={background}>{close=><Detail detail={detail} state={state} update={()=>{throw Error('Read-only record');}} close={close} setDetail={setDetail}/>}</ModalLayer>}</>;
  }act(()=>root.render(<Harness/>));
}
const click=node=>{act(()=>node.click());act(()=>vi.advanceTimersByTime(400));};
const button=name=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===name);

it('the live badge opens truthful PR evidence and returns to the same mounted logger without a mutation',()=>{
  mount();const before=structuredClone(current),logger=document.querySelector('.workout-screen'),input=logger.querySelector('input');
  const badge=document.querySelector('.active-performance-pr-trigger');
  expect(badge.tagName).toBe('BUTTON');expect(badge.getAttribute('aria-haspopup')).toBe('dialog');
  expect(badge.getAttribute('aria-label')).toBe('View estimated 1RM personal record');
  click(badge);
  const sheet=document.querySelector('.exercise-pr-sheet');
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Personal record');
  expect(sheet.querySelector('.exercise-pr-value').textContent).toBe('38 kg');
  expect(sheet.querySelector('.exercise-pr-evidence').textContent).toContain('30 kg × 8 reps');
  expect(sheet.querySelector('.exercise-pr-evidence').textContent).toContain('37 kg');
  expect(sheet.textContent).toContain('not a tested maximum');expect(sheet.textContent).toContain('does not change today’s targets');
  click(button('CONTINUE TRAINING'));
  expect(document.querySelector('.exercise-pr-sheet')).toBeNull();
  expect(document.querySelector('.workout-screen')).toBe(logger);expect(logger.querySelector('input')).toBe(input);
  expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();
});

it('recorded history and Back preserve the active session and return to its current PR details',()=>{
  mount();const before=structuredClone(current);click(document.querySelector('.active-performance-pr-trigger'));
  click(button('View recorded history'));
  expect(document.querySelector('.exercise-performance-insights')).not.toBeNull();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Incline Dumbbell Press');
  click(document.querySelector('button[aria-label="Back to personal record"]'));
  expect(document.querySelector('.exercise-pr-value').textContent).toBe('38 kg');
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Personal record');
  expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();
});

it.each(['baseline','unchecked'])('%s never exposes a fake record action',kind=>{
  const state=fixture();
  if(kind==='baseline')state.workouts=[];
  else state.activeWorkout.exercises[0].sets.forEach(set=>set.completed=false);
  mount(state);expect(document.querySelector('.active-performance-pr-trigger')).toBeNull();
});

it('a stale request cannot show evidence from another active session or exercise',()=>{
  const state=fixture();
  act(()=>root.render(<Detail detail={{exercisePr:{sessionId:'old-session',exerciseInstanceId:state.activeWorkout.exercises[0].id}}} state={state} close={()=>{}}/>));
  expect(host.querySelector('.exercise-pr-value')).toBeNull();
  expect(host.textContent).toContain('no longer present');
  expect(host.querySelector('.exercise-pr-history')).toBeNull();
});

it('small estimate gains survive whole-unit display rounding and lb conversion',()=>{
  const history=[{id:'prior',completedAt:'2026-10-04',exercises:[{exerciseId:'bench',sets:[{completed:true,weight:40,reps:8}]}]}];
  const exercise={exerciseId:'bench',name:'Bench',sets:[{completed:true,weight:40.25,reps:8}]};
  act(()=>root.render(<ExercisePrSheet exercise={exercise} workouts={history} units="lb" e1rmEligible Header={()=>null} close={()=>{}}/>));
  expect(host.querySelector('.exercise-pr-change').textContent).toBe('Increase <1 lb');
  expect(host.querySelector('.exercise-pr-value').textContent).toContain('lb');
});

it('rep-only records do not promise an estimated maximum',()=>{
  const history=[{id:'prior',completedAt:'2026-10-04',exercises:[{exerciseId:'bench',sets:[{completed:true,weight:30,reps:14}]}]}];
  const exercise={exerciseId:'bench',name:'Bench',sets:[{completed:true,weight:30,reps:15}]};
  act(()=>root.render(<ExercisePrSheet exercise={exercise} workouts={history} units="kg" e1rmEligible={false} Header={()=>null} close={()=>{}}/>));
  expect(host.querySelector('.exercise-pr-value').textContent).toBe('15 reps');
  expect(host.textContent).not.toMatch(/Epley|tested maximum|ESTIMATED 1RM/);
  expect(host.textContent).toContain('14 reps');
});
