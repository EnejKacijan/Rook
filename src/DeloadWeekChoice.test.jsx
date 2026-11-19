import React,{act,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today,Detail,ModalLayer,ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {createTrainingBlock} from './trainingBlocks.js';
import {isDeloadWorkout} from './progressionHistory.js';
import {useAnimationClock} from './testAnimationClock.js';
import {saveState} from './domain.js';
import {forgetStorageSession} from './localStateStorage.js';

let root,host,current,navigate;
const advance=()=>act(()=>vi.advanceTimersByTime(400));
const click=element=>{expect(element).toBeTruthy();act(()=>element.click());advance();};
const button=text=>[...host.querySelectorAll('button')].find(element=>element.textContent.trim()===text);
const radio=index=>host.querySelectorAll('[role="radio"]')[index];
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;useAnimationClock();vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  localStorage.clear();sessionStorage.clear();forgetStorageSession();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);navigate=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();forgetStorageSession();});
function fixture(){
  const state=createReturningUserFixture(0);Object.assign(state.profile,{showExerciseImages:false,showProgressionTips:true,rirEnabled:true,recommendedWarmupsEnabled:false,rampUpSetsEnabled:false,restTimerEnabled:false});
  state.profile.availableDays=['Mon','Wed','Fri','Sun'];state.program.days.forEach((day,index)=>{day.weekday=state.profile.availableDays[index];});
  Object.assign(state.program,{source:'manual',userEdited:true,rotationStartDate:'2026-10-26'});
  state.program.trainingBlock=createTrainingBlock(state.program,{totalWeeks:4,currentWeek:4,startDate:'2026-10-26'});
  state.selectedDate='2026-11-18';state.selectedDay='Wed';return state;
}
function mount(initial=fixture()){
  function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null),[page,setPage]=useState('today'),background=useRef(null);current=state;
    const update=operation=>setState(previous=>operation(structuredClone(previous)));
    const selectPage=value=>{navigate(value);setPage(value);};
    return <><div ref={background}>{page==='workout'?<ActiveWorkout state={state} update={update} setPage={selectPage} setDetail={setDetail}/>:<Today state={state} update={update} setPage={selectPage} setDetail={setDetail}/>}</div>
      {detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{close=><Detail detail={detail} state={state} update={update} setPage={selectPage} setDetail={setDetail} close={close}/>}</ModalLayer>}</>;
  }
  act(()=>root.render(<Harness/>));advance();
}
it('offers all three options before starting, with deload recommended and no silent selection',()=>{
  mount();expect(host.querySelector('.deload-week-notice').textContent).toContain('Deload week');click(button('CHOOSE THIS WEEK'));
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(3);expect(radio(0).getAttribute('aria-checked')).toBe('true');
  expect(radio(0).textContent).toContain('Recommended');expect(current.program.trainingBlock.deloadChoices).toBeUndefined();expect(current.activeWorkout).toBeNull();
});
it('uses the selected normal targets in the real Today and workout screens',()=>{
  mount();click(button('Choose'));click(radio(1));click(button('USE NORMAL TRAINING'));
  expect(host.querySelector('.deload-week-notice').textContent).toContain('Normal training');expect(current.program.trainingBlock.deloadChoices[4].mode).toBe('normal');
  click(button('START WORKOUT'));expect(navigate).toHaveBeenCalledWith('workout');expect(isDeloadWorkout(current.activeWorkout)).toBe(false);
  expect(current.activeWorkout.exercises[0].repMin).toBe(current.program.days.find(day=>day.weekday==='Wed').exercises[0].repMin+1);
  expect(host.textContent).not.toContain('Deload · recovery session');
});
it('keeps the recommended deload targets when chosen',()=>{
  mount();click(button('Choose'));click(button('USE DELOAD TRAINING'));click(button('START WORKOUT'));
  expect(isDeloadWorkout(current.activeWorkout)).toBe(true);expect(host.textContent).toContain('Deload · recovery session');expect(host.textContent).toContain('Planned deload');
});
it('takes a whole rest week with one apply and can undo the choice from Today',()=>{
  mount();click(button('Choose'));click(radio(2));click(button('REST FOR 7 DAYS'));
  expect(current.workouts).toHaveLength(0);expect(current.program.trainingBlock.completed).toBe(true);
  expect(host.querySelector('.deload-week-notice').textContent).toContain('Rest week');expect(button('START WORKOUT')).toBeUndefined();expect(button('REVIEW BLOCK')).toBeTruthy();
  click(button('Change'));click(button('UNDO CHOICE'));
  expect(current.program.trainingBlock.completed).toBe(false);expect(current.program.trainingBlock.deloadChoices).toBeUndefined();expect(button('CHOOSE THIS WEEK')).toBeTruthy();
});
it('preserves the old schedule and keeps the choice open when saving fails',()=>{
  const initial=fixture();expect(saveState(initial)).toBe(true);mount(initial);click(button('Choose'));click(radio(2));
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Full storage');});
  click(button('REST FOR 7 DAYS'));expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
  expect(current.program.trainingBlock.completed).toBe(false);expect(current.program.trainingBlock.deloadChoices).toBeUndefined();expect(current.workouts).toHaveLength(0);
});
it('supports arrow-key selection without writing the choice until Apply',()=>{
  mount();click(button('Choose'));act(()=>radio(0).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  expect(radio(1).getAttribute('aria-checked')).toBe('true');expect(document.activeElement).toBe(radio(1));expect(current.program.trainingBlock.deloadChoices).toBeUndefined();
});
