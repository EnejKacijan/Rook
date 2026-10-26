import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {TodayActionsSheet} from './App.jsx';
import {blankState,buildProgram,firstScheduledDate,deserializeState,plannedWorkoutForDate} from './domain.js';
import {firstPlanWeekWorkouts,missedFlexibleSessions} from './flexibleWeek.js';

let root,state;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});localStorage.clear();sessionStorage.clear();
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.rotationStartDate=firstScheduledDate(state.program);state.selectedDate='2026-10-25';state=deserializeState(state);localStorage.setItem('lift-v2-state',JSON.stringify(state));
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const Header=({onBack,onClose})=><header>{onBack&&<button aria-label="Back" onClick={onBack}>Back</button>}<button aria-label="Close" onClick={onClose}>Close</button></header>;
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
const click=node=>act(()=>node.click());
const draw=(request={move:true},update=()=>{},close=()=>{})=>act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} update={update} close={close} request={request}/>));

it('groups unscheduled first-week choices separately and saves only after confirmation',()=>{
  const before=localStorage.getItem('lift-v2-state'),update=vi.fn(),close=vi.fn(),source=firstPlanWeekWorkouts(state).at(-1);draw({move:true},update,close);
  expect(document.body.textContent).toContain("THIS WEEK'S PLAN");expect(document.body.textContent).toContain('UPCOMING');expect(document.body.textContent).not.toContain('MISSED');
  const choice=document.querySelector(`[data-session-id="${source.logicalSessionId}"]`);expect(choice.textContent).toContain('Not scheduled yet');click(choice);
  expect(document.querySelector('h1').textContent).toBe(`Schedule ${source.workout.name}`);expect(button('Skip this session')).toBeUndefined();
  const destination=document.querySelector('[data-move-date="2026-10-25"]');expect(destination).toBeTruthy();click(destination);
  expect(document.querySelector('h1').textContent).toBe(`Schedule ${source.workout.name}?`);expect(document.body.textContent).toContain('From weekly plan');expect(document.body.textContent).toContain('Sun, Oct 25');
  expect(update).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBe(before);click(button('SCHEDULE WORKOUT'));
  expect(update).toHaveBeenCalledOnce();expect(plannedWorkoutForDate(update.mock.calls[0][1].persistedState,'2026-10-25').logicalSessionId).toBe(source.logicalSessionId);
  expect(update.mock.calls[0][1].persistedState.program).toEqual(state.program);expect(missedFlexibleSessions(update.mock.calls[0][1].persistedState)).toHaveLength(0);
});
it('does not commit a first-week choice when storage fails and allows retry',()=>{
  const source=firstPlanWeekWorkouts(state).at(-1),update=vi.fn(),close=vi.fn();draw({sessionId:source.logicalSessionId,destination:true},update,close);
  click(document.querySelector('[data-move-date="2026-10-25"]'));
  const original=Storage.prototype.setItem;const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key==='lift-v2-state')throw Error('storage unavailable');return original.call(this,key,value);});
  click(button('SCHEDULE WORKOUT'));expect(update).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('previous schedule is unchanged');
  write.mockRestore();click(button('TRY AGAIN'));expect(update).toHaveBeenCalledOnce();
});
it('offers an exact first-week source through the calendar actions without treating it as missed',()=>{
  const source=firstPlanWeekWorkouts(state).at(-1),setDetail=vi.fn();
  act(()=>root.render(<TodayActionsSheet state={state} date={source.originalDate} hasWorkout={false} update={()=>{}} setDetail={setDetail} close={()=>{}}/>));
  expect(button('Missed workouts')).toBeUndefined();click(button('Use this workout today'));expect(setDetail).toHaveBeenLastCalledWith({useWorkoutToday:{sessionId:source.logicalSessionId}});
  click(button('Move to another day'));expect(setDetail).toHaveBeenLastCalledWith({flexibleWeek:{sessionId:source.logicalSessionId,destination:true}});
});
