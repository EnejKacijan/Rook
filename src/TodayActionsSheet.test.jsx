import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today,TodayActionsSheet} from './App.jsx';
import {dayOverflowFixture} from './dayOverflow.fixture.js';
import {canUseWorkoutToday,proposeWorkoutToday,applyWorkoutToday} from './useWorkoutToday.js';
import {serializeState,deserializeState,adaptedTemplateForToday,startWorkout,isoDay} from './domain.js';

let root,state,setDetail,close;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T18:00:00'));
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  state=dayOverflowFixture();setDetail=vi.fn();close=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=element=>act(()=>element.click());
const rows=()=>[...document.querySelectorAll('.today-actions-sheet > .list-row')];
const draw=()=>act(()=>root.render(<TodayActionsSheet state={state} date={state.selectedDate} hasWorkout={false} update={()=>{}} setDetail={setDetail} close={close}/>));

it.each([0,1,2,3,4])('keeps %i completed workouts at zero or one Repeat/Delete actions, with no history index',count=>{
  state=dayOverflowFixture({count});draw();
  expect(rows().map(row=>row.textContent)).toEqual(count?['Repeat a workout','Adjust week','Rest-day activities','Start freestyle workout',count===1?'Delete workout':'Delete a workout']:['Adjust week','Rest-day activities']);
  expect(document.querySelector('.today-workout-chooser')).toBeNull();
  expect(document.body.textContent).not.toContain('View history');expect(document.body.textContent).not.toContain('UPPER B');
});
it('one eligible repeat bypasses selection using the exact record ID',()=>{
  state=dayOverflowFixture({count:2});state.workouts[1].exercises=[];draw();click(button('Repeat a workout'));
  expect(setDetail).toHaveBeenCalledWith({useWorkoutToday:{workoutId:state.workouts[0].id}});
  expect(document.querySelector('.today-workout-chooser')).toBeNull();
});
it.each(['repeat','delete'])('%s shares the compact ID chooser and preserves row identity on reorder',action=>{
  state=dayOverflowFixture({count:3,sameName:true});draw();click(button(action==='repeat'?'Repeat a workout':'Delete a workout'));
  expect(rows()).toHaveLength(0);
  const target=state.workouts[0],element=document.querySelector(`[data-workout-id="${target.id}"]`);
  expect(element.textContent).toContain('Completed');expect(element.textContent).not.toContain(target.id);
  expect(element.textContent).not.toContain('Record 1');expect(document.querySelectorAll('.today-workout-chooser button')).toHaveLength(3);
  state={...state,workouts:[...state.workouts].reverse()};draw();
  expect(document.querySelector(`[data-workout-id="${target.id}"]`)).toBe(element);click(element);
  if(action==='repeat')expect(setDetail).toHaveBeenCalledWith({useWorkoutToday:{workoutId:target.id}});
  else expect(document.querySelector('.completed-workout-delete-confirm').textContent).toContain('UPPER A');
});
it('chooser back restores the concise actions and their keyboard focus',async()=>{
  draw();click(button('Repeat a workout'));click(document.querySelector('[aria-label="Back"]'));
  await act(async()=>vi.advanceTimersToNextFrame());
  expect(rows()).toHaveLength(5);expect(document.activeElement).toBe(button('Repeat a workout'));
  click(button('Delete a workout'));click(document.querySelector('[aria-label="Close Delete a workout"]'));expect(close).toHaveBeenCalledOnce();
});
it.each(['activeWorkout','activeOptionalSession'])('hides conflicting actions with %s and keeps scheduling available',key=>{
  state[key]={id:'active'};draw();expect(rows().map(row=>row.textContent)).toEqual(['Adjust week']);
});
it('uses canonical eligibility for pending repeat and offers only deletable records',()=>{
  state.todayAdaptation={mode:'repeat',sourceWorkoutId:state.workouts[0].id};draw();
  expect(button('Repeat a workout')).toBeUndefined();click(button('Delete workout'));
  expect(document.querySelector('.completed-workout-delete-confirm').textContent).toContain(state.workouts[1].name);
});
it('live eligibility changes remove chooser targets without firing a stale action',()=>{
  draw();click(button('Repeat a workout'));state={...state,activeOptionalSession:{id:'active'}};draw();
  expect(document.querySelectorAll('.today-workout-chooser button')).toHaveLength(0);
  expect(document.body.textContent).toContain('No workouts are available');expect(setDetail).not.toHaveBeenCalled();
});
it('date-only imports do not fabricate a completion time',()=>{
  state.workouts[0].historicalImport={version:2};state.workouts[0].sourceDate={precision:'date',value:isoDay()};draw();click(button('Repeat a workout'));
  const row=document.querySelector(`[data-workout-id="${state.workouts[0].id}"]`);expect(row.textContent).toContain('Time not recorded');expect(row.textContent).not.toContain('10:42');
});
it.each(['mixed','planned','freestyle'])('%s completed records retain detail access on Today itself',kind=>{
  state=dayOverflowFixture({count:3,kind});act(()=>root.render(<Today state={state} update={()=>{}} setPage={()=>{}} setDetail={setDetail}/>));
  for(const record of state.workouts){const row=document.querySelector(`.today-completed-workouts [data-workout-id="${record.id}"]`) || button('WORKOUT COMPLETE · VIEW HISTORY');expect(row).toBeTruthy();click(row);expect(setDetail).toHaveBeenLastCalledWith({completedWorkout:record.id});}
});
it('historical repeat routes to today and canonical apply/start preserve old facts through reload',()=>{
  state=dayOverflowFixture({count:2,date:'2026-09-18',sameName:true});draw();expect(button('Start freestyle workout')).toBeUndefined();click(button('Repeat today'));
  const source=state.workouts[0],before=serializeState(state);click(document.querySelector(`[data-workout-id="${source.id}"]`));
  const request=setDetail.mock.calls[0][0].useWorkoutToday;expect(request).toEqual({workoutId:source.id});expect(canUseWorkoutToday(state,request)).toBe(true);
  const proposal=proposeWorkoutToday(state,request);
  expect(()=>applyWorkoutToday(state,proposal,{persist:()=>false})).toThrow(/unchanged/);expect(serializeState(state)).toBe(before);
  let next=applyWorkoutToday(state,proposal,{persist:()=>true});expect(next.selectedDate).toBe(isoDay());expect(next.todayAdaptation.sourceWorkoutId).toBe(source.id);
  next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));next=deserializeState(serializeState(next),{strict:true});
  expect(next.activeWorkout.id).not.toBe(source.id);expect(next.activeWorkout.exercises.flatMap(e=>e.sets).every(s=>!s.completed)).toBe(true);
  expect(next.workouts).toEqual(state.workouts);expect(next.program).toEqual(state.program);
});
