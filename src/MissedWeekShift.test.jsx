import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as domain from './domain.js';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {UseWorkoutTodaySheet} from './UseWorkoutTodaySheet.jsx';
import {TodayActionsSheet} from './App.jsx';
import {MissedWorkoutFeedbackProvider} from './MissedWorkoutFeedback.jsx';
import {flexibleSessions} from './flexibleWeek.js';
import {applyWorkoutToday,proposeWorkoutToday} from './useWorkoutToday.js';

let root,host,current,external,persist,closed;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  window.scrollTo=()=>{};HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);closed=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const Header=({title,onBack,onClose})=><header>{title}{onBack&&<button className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text);
const click=text=>act(()=>button(text).click());
function fixture(days=['Mon','Wed','Fri']){
  let state=domain.blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:days.length,availableDays:days,sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=domain.buildProgram(state.profile);state.program.rotationStartDate='2026-11-16';state.program.trainingBlock.startDate='2026-11-16';return domain.deserializeState(state);
}
const source=state=>flexibleSessions(state).find(item=>item.originalDate==='2026-11-16');
function mount(state,request={sessionId:source(state).logicalSessionId}){
  function Harness(){
    const[value,setValue]=useState(state),[open,setOpen]=useState(true);current=value;
    external=operation=>setValue(old=>operation(structuredClone(old)));
    const update=operation=>setValue(old=>operation(old));
    return <MissedWorkoutFeedbackProvider state={value} update={update}>{open&&<FlexibleWeekSheet state={value} update={update} close={()=>{closed();setOpen(false);}} Header={Header} request={request}/>}</MissedWorkoutFeedbackProvider>;
  }
  act(()=>root.render(<Harness/>));
}
it('previews all dates, saves once, and Undo restores the entire original week',()=>{
  const state=fixture(),id=source(state).logicalSessionId;mount(state);click('SHIFT THE REST OF THIS WEEK');
  expect(host.querySelectorAll('[data-shift-session]')).toHaveLength(3);expect(host.textContent).toContain('Next week keeps its existing dates.');expect(host.textContent).toContain('Sun, Nov 22');
  expect(persist).not.toHaveBeenCalled();expect(current).toEqual(state);
  const apply=button('SHIFT THIS WEEK');act(()=>{apply.click();apply.click();});
  expect(persist).toHaveBeenCalledOnce();expect(closed).toHaveBeenCalledOnce();expect(domain.plannedWorkoutForDate(current,'2026-11-18').logicalSessionId).toBe(id);
  click('Undo');expect(current.flexibleWeek.sessions).toEqual({});expect(domain.plannedWorkoutForDate(current,'2026-11-18').id).toBe(state.program.days[1].id);
  expect(current.workouts).toEqual(state.workouts);expect(current.program).toEqual(state.program);
});
it('keeps a chosen extra day through persistence failure and supports retry',()=>{
  const state=fixture();mount(state);click('SHIFT THE REST OF THIS WEEK');click('Change extra day');
  act(()=>host.querySelector('[data-shift-extra="2026-11-22"]').click());
  act(()=>host.querySelector('[data-shift-extra="2026-11-21"]').click());click('USE THESE DAYS');
  expect(host.textContent).toContain('Extra training day this week: Sat, Nov 21.');persist.mockReturnValue(false);click('SHIFT THIS WEEK');
  expect(current).toEqual(state);expect(closed).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');
  persist.mockReturnValue(true);click('TRY AGAIN');expect(closed).toHaveBeenCalledOnce();expect(Object.values(current.flexibleWeek.sessions).at(-1).scheduledDate).toBe('2026-11-21');
});
it('Back and Cancel do not change dates or discard any workout',()=>{
  const state=fixture();mount(state);click('SHIFT THE REST OF THIS WEEK');click('Back');
  expect(button('SHIFT THE REST OF THIS WEEK')).toBeDefined();expect(current).toEqual(state);expect(persist).not.toHaveBeenCalled();
  click('SHIFT THE REST OF THIS WEEK');click('CANCEL');expect(current).toEqual(state);expect(persist).not.toHaveBeenCalled();
});
it('provides a working updated preview after relevant availability changes',()=>{
  mount(fixture());click('SHIFT THE REST OF THIS WEEK');
  act(()=>external(state=>{state.profile.availableDays.push('Sat');return state;}));
  expect(button('SHIFT THIS WEEK').disabled).toBe(true);click('UPDATE PREVIEW');expect(button('SHIFT THIS WEEK').disabled).toBe(false);
  expect(host.textContent).toContain('Extra training day this week: Sat, Nov 21.');click('SHIFT THIS WEEK');expect(closed).toHaveBeenCalledOnce();
});
it('offers the same shift from Train Today instead of forcing individual displacement dates',()=>{
  const state=fixture(),route=vi.fn(),id=source(state).logicalSessionId;
  act(()=>root.render(<UseWorkoutTodaySheet state={state} update={()=>{}} close={closed} Header={Header} setDetail={route} request={{sessionId:id}}/>));
  click('SHIFT THE REST OF THIS WEEK');expect(route).toHaveBeenCalledWith({flexibleWeek:{sessionId:id,shift:true}});expect(persist).not.toHaveBeenCalled();
});
it('keeps Train Today on an empty rest day as the direct existing action',()=>{
  vi.setSystemTime(new Date('2026-11-19T12:00:00'));const state=fixture(),route=vi.fn();
  act(()=>root.render(<UseWorkoutTodaySheet state={state} update={()=>{}} close={closed} Header={Header} setDetail={route} request={{sessionId:source(state).logicalSessionId}}/>));
  expect(button('SHIFT THE REST OF THIS WEEK')).toBeUndefined();expect(button('USE TODAY')).toBeDefined();
});
it('offers the correction after a completed recovery and preserves the completed record on Apply',()=>{
  let state=fixture();const id=source(state).logicalSessionId;
  state=applyWorkoutToday(state,proposeWorkoutToday(state,{sessionId:id,displacedToDate:'2026-11-19'}),{persist:()=>true});
  state.activeWorkout=domain.startWorkout(state,domain.adaptedTemplateForToday(state));
  for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:40});
  state=domain.completeWorkout(state);const route=vi.fn(),history=structuredClone(state.workouts);
  act(()=>root.render(<TodayActionsSheet state={state} update={()=>{}} close={closed} setDetail={route} date="2026-11-18" hasWorkout/>));
  click('Shift remaining workouts this week');expect(route).toHaveBeenCalledWith({flexibleWeek:{sessionId:id,shift:true}});
  mount(state,{sessionId:id,shift:true});expect(host.querySelectorAll('[data-shift-session]')).toHaveLength(2);click('SHIFT THIS WEEK');expect(current.workouts).toEqual(history);
});
it('hides a shift that has no room before Sunday while keeping ordinary recovery available',()=>{
  vi.setSystemTime(new Date('2026-11-22T12:00:00'));
  mount(fixture(['Mon','Wed','Sun']));expect(button('SHIFT THE REST OF THIS WEEK')).toBeUndefined();expect(button('MOVE TO ANOTHER DAY')).toBeDefined();
});
