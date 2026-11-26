import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as domain from './domain.js';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {applyFlexibleWeek,flexibleSessions,proposeFlexibleWeek} from './flexibleWeek.js';
import {MissedWorkoutFeedbackProvider} from './MissedWorkoutFeedback.jsx';
import {createManualTodayPreparation,applyTodayAdjustment} from './adjustToday.js';

let root,host,current,external,persist,closed;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);closed=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const Header=({onBack,onClose})=><header>{onBack&&<button className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text);
const click=text=>act(()=>button(text).click());
const row=id=>host.querySelector(`[data-session-id="${id}"]`);
const revert=id=>act(()=>row(id).querySelector('.schedule-revert-action').click());
function fixture(){
  const state=domain.blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=domain.buildProgram(state.profile);state.program.rotationStartDate='2026-11-16';state.program.trainingBlock.startDate='2026-11-16';return domain.deserializeState(state);
}
const byDate=(state,date)=>flexibleSessions(state).find(item=>item.originalDate===date);
const shifted=()=>{const state=fixture();return applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'recover-week',sessionId:byDate(state,'2026-11-16').logicalSessionId})).state;};
function mount(state){
  function Harness(){
    const[value,setValue]=useState(state);current=value;external=operation=>setValue(old=>operation(structuredClone(old)));
    const update=operation=>setValue(old=>operation(old));
    return <MissedWorkoutFeedbackProvider state={value} update={update}><FlexibleWeekSheet state={value} update={update} close={closed} Header={Header} request={{reviewExisting:true}}/></MissedWorkoutFeedbackProvider>;
  }
  act(()=>root.render(<Harness/>));
}

it('keeps the overview open while reverting independent choices one by one, each saved once',()=>{
  const state=shifted(),list=['2026-11-16','2026-11-18','2026-11-20'].map(date=>byDate(state,date).logicalSessionId);mount(state);
  for(let index=0;index<list.length;index++){
    revert(list[index]);expect(host.querySelector('h1').textContent).toBe('Revert this change?');expect(host.querySelectorAll('.flexible-schedule-changes article')).toHaveLength(1);
    if(index===0)expect(host.textContent).toContain('Returns as a missed workout.');
    const confirm=button('REVERT CHANGE');act(()=>{confirm.click();confirm.click();});
    expect(persist).toHaveBeenCalledTimes(index+1);expect(row(list[index])).toBeNull();expect(closed).not.toHaveBeenCalled();expect(host.textContent).toContain('Change reverted.');
  }
  expect(current.flexibleWeek.sessions).toEqual({});expect(host.querySelector('h1').textContent).toBe('No current changes');
});

it('shows every required linked move before confirmation and Cancel changes nothing',()=>{
  const state=shifted(),id=byDate(state,'2026-11-20').logicalSessionId;mount(state);revert(id);
  expect(host.querySelector('h1').textContent).toBe('Revert linked changes?');expect(host.querySelectorAll('.flexible-schedule-changes article')).toHaveLength(3);
  expect(host.textContent).toContain('To free the original date');click('KEEP CURRENT SCHEDULE');expect(current).toEqual(state);expect(persist).not.toHaveBeenCalled();
  revert(id);click('REVERT 3 CHANGES');expect(current.flexibleWeek.sessions).toEqual({});expect(persist).toHaveBeenCalledOnce();expect(closed).not.toHaveBeenCalled();
});

it('keeps the confirmation and previous schedule on save failure, then supports retry',()=>{
  const state=shifted();mount(state);revert(byDate(state,'2026-11-16').logicalSessionId);persist.mockReturnValue(false);click('REVERT CHANGE');
  expect(current).toEqual(state);expect(host.querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');expect(closed).not.toHaveBeenCalled();
  persist.mockReturnValue(true);click('TRY AGAIN');expect(Object.keys(current.flexibleWeek.sessions)).toHaveLength(2);expect(host.querySelector('h1').textContent).toBe('Current changes');
});

it('offers a working free-date picker when a linked original date belongs to a completed workout',()=>{
  let state=shifted();const a=byDate(state,'2026-11-16'),b=byDate(state,'2026-11-18');state.selectedDate='2026-11-18';state.activeWorkout=domain.startWorkout(state,a.workout);
  for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:40});
  state=domain.completeWorkout(state);const history=structuredClone(state.workouts);mount(state);expect(row(a.logicalSessionId)).toBeNull();
  revert(b.logicalSessionId);expect(host.querySelector('h1').textContent).toBe('Original date unavailable');expect(host.textContent).toContain('started, finished');
  click('MOVE TO ANOTHER DAY');act(()=>host.querySelector('[data-move-date="2026-11-19"]').click());click('MOVE WORKOUT');
  expect(current.flexibleWeek.sessions[b.logicalSessionId].scheduledDate).toBe('2026-11-19');expect(current.workouts).toEqual(history);expect(closed).toHaveBeenCalledOnce();
});

it('can change just one day after shifting the week and return to the updated changes',()=>{
  const state=shifted(),id=byDate(state,'2026-11-20').logicalSessionId;
  const others=Object.entries(state.flexibleWeek.sessions).filter(([sessionId])=>sessionId!==id);
  mount(state);
  const changeDay=()=>act(()=>row(id).querySelector('.schedule-change-day-action').click());
  const date=value=>host.querySelector(`[data-move-date="${value}"]`);
  expect(row(id).textContent).toContain('Revert move');
  changeDay();
  expect(date('2026-11-20').disabled).toBe(true);
  expect(date('2026-11-22').disabled).toBe(true);
  act(()=>date('2026-11-21').click());
  click('CANCEL');
  expect(row(id).textContent).toContain('Now Sun, Nov 22');
  expect(persist).not.toHaveBeenCalled();

  changeDay();
  expect(button('MOVE WORKOUT').disabled).toBe(true);
  act(()=>date('2026-11-21').click());
  click('MOVE WORKOUT');
  expect(row(id).textContent).toContain('Now Sat, Nov 21');
  expect(current.flexibleWeek.sessions[id]).toMatchObject({originalDate:'2026-11-20',scheduledDate:'2026-11-21'});
  expect(Object.entries(current.flexibleWeek.sessions).filter(([sessionId])=>sessionId!==id)).toEqual(others);
  expect(persist).toHaveBeenCalledOnce();
  expect(closed).not.toHaveBeenCalled();
});

it('rejects a confirmation after an external change and returns to the updated overview',()=>{
  const state=shifted(),id=byDate(state,'2026-11-16').logicalSessionId;mount(state);revert(id);
  act(()=>external(value=>applyFlexibleWeek(value,proposeFlexibleWeek(value,{mode:'move',sessionId:id,toDate:'2026-11-19'})).state));
  const before=structuredClone(current);click('REVERT CHANGE');expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]').textContent).toContain('changed');
  click('KEEP CURRENT SCHEDULE');expect(row(id).textContent).toContain('Thu, Nov 19');revert(id);click('REVERT CHANGE');expect(current.flexibleWeek.sessions[id]).toBeUndefined();
});

it('shows reset of a past-date adjustment before confirmation and lets the user cancel it',()=>{
  let state=shifted();const id=byDate(state,'2026-11-16').logicalSessionId,draft=createManualTodayPreparation(state);draft.workout.exercises[0].sets[0].weight=43;
  state=applyTodayAdjustment(state,draft).state;expect(state.todayAdaptation).toBeTruthy();mount(state);revert(id);
  expect(host.textContent).toContain('The affected today-only adjustment will be cleared.');click('KEEP CURRENT SCHEDULE');expect(current.todayAdaptation).toEqual(state.todayAdaptation);
  revert(id);click('REVERT CHANGE');expect(current.todayAdaptation).toBeNull();expect(byDate(current,'2026-11-16').status).toBe('missed');
});

it('allows a simple skip to be reverted from the same overview',()=>{
  let state=fixture();const item=byDate(state,'2026-11-20');state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId})).state;mount(state);
  expect(row(item.logicalSessionId).querySelector('.schedule-change-day-action')).toBeNull();
  expect(row(item.logicalSessionId).textContent).toContain('Revert skip');revert(item.logicalSessionId);click('REVERT CHANGE');expect(byDate(current,'2026-11-20').status).toBe('planned');expect(current.program).toEqual(state.program);
});

it('can undo a skipped date earlier this week from the overview history',()=>{
  let state=fixture();const item=byDate(state,'2026-11-16');state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId})).state;mount(state);
  expect(host.querySelector('.flexible-schedule-history').textContent).toContain('Revert skip');click('Revert skip');click('REVERT CHANGE');
  expect(byDate(current,'2026-11-16').status).toBe('missed');expect(current.workouts).toEqual(state.workouts);
});

it('explains an archived skip without advertising an unavailable Revert',()=>{
  let state=fixture();const item=byDate(state,'2026-11-20');state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:item.logicalSessionId})).state;
  state.program.trainingBlock.resolvedSkips=[{logicalSessionId:item.logicalSessionId,blockWorkoutId:'resolved',blockWeekNumber:1,date:item.originalDate}];mount(state);
  expect(row(item.logicalSessionId).textContent).toContain('Already counted in plan progress.');expect(button('Revert skip')).toBeUndefined();
});
