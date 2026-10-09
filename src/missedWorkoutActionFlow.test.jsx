import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TodayActionsSheet,RestTrainingSheet} from './App.jsx';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {UseWorkoutTodaySheet} from './UseWorkoutTodaySheet.jsx';
import {missedWorkoutActionFixture} from './missedWorkoutAction.fixture.js';
import {flexibleOccurrenceForDate,flexibleSessionById,flexibleSessions,hasMoveWorkoutDestination,moveWorkoutCandidates,moveWorkoutDestinations,proposeFlexibleWeek,applyFlexibleWeek,flexiblePlanFingerprint} from './flexibleWeek.js';
import {proposeWorkoutToday,applyWorkoutToday,canUseWorkoutToday} from './useWorkoutToday.js';
import {startWorkout,completeWorkout,adaptedTemplateForToday,serializeState,deserializeState,workoutPerformedDate} from './domain.js';

let root,route,update,close;
const id='noge-b:2026-10-02';
const Header=({title,onBack,onClose})=><header>{title}{onBack&&<button onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
const render=node=>act(()=>root.render(node));
const menu=state=>render(<TodayActionsSheet state={state} date="2026-10-02" hasWorkout update={update} close={close} setDetail={route}/>);
const moveSheet=(state,request={sessionId:id})=>render(<FlexibleWeekSheet state={state} request={request} Header={Header} update={update} close={close} setDetail={route}/>);
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T18:25:00'));localStorage.clear();globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);route=vi.fn();update=vi.fn();close=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();});

it('reproduces the visible Missed / canonical null mismatch at the current plan start boundary',()=>{
  const state=missedWorkoutActionFixture({outsidePlan:true}),before=serializeState(state);
  expect(flexibleOccurrenceForDate(state,'2026-10-02')).toMatchObject({status:'missed',logicalSessionId:id,originalDate:'2026-10-02'});
  expect(flexibleSessionById(state,id)).toBeNull();expect(proposeWorkoutToday(state,{sessionId:id}).error).toBe('The schedule changed. Choose another workout.');
  expect(moveWorkoutDestinations(state,id).every(d=>!d.available)).toBe(true);
  menu(state);expect(button('Move to another day')).toBeUndefined();expect(button('Train this workout today')).toBeUndefined();
  expect(serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();
});
it('Move opens the canonical destination picker directly, including next week, after a completed Sunday',()=>{
  const state=missedWorkoutActionFixture();menu(state);act(()=>button('Move to another day').click());
  expect(route).toHaveBeenCalledWith({flexibleWeek:{sessionId:id,destination:true}});
  moveSheet(state,route.mock.calls[0][0].flexibleWeek);
  const dates=[...document.querySelectorAll('[data-move-date]')].map(node=>node.dataset.moveDate);
  expect(dates).not.toContain('2026-10-04');expect(dates).toContain('2026-10-05');expect(dates).toContain('2026-10-17');
  expect(document.body.textContent).not.toContain('Use this workout today');
  expect(dates.every(date=>proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:date}).status==='ready')).toBe(true);
});
it('no valid destinations hides Move in both overflow and missed recovery',()=>{
  const state=missedWorkoutActionFixture();const base=state.program.days[1];
  state.program.days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((weekday,index)=>weekday==='Fri'?state.program.days[0]:({...structuredClone(base),id:`full-${index}`,weekday}));
  expect(hasMoveWorkoutDestination(state,id)).toBe(false);menu(state);expect(button('Move to another day')).toBeUndefined();
  moveSheet(state);expect(button('MOVE TO ANOTHER DAY')).toBeUndefined();expect(button('More options')).toBeDefined();
  expect(moveWorkoutCandidates(state)).toEqual([]);
});
it.each(['activeWorkout','activeOptionalSession','todayAdaptation'])('Train today is hidden in overflow and recovery with %s',key=>{
  const state=missedWorkoutActionFixture();state[key]={id:'busy',date:'2026-10-04'};
  menu(state);expect(button('Train this workout today')).toBeUndefined();moveSheet(state);expect(button('TRAIN TODAY')).toBeUndefined();
  expect(update).not.toHaveBeenCalled();
});
it('Train today keeps the existing extra-session contract, actual dates, original provenance and unique IDs',()=>{
  let state=missedWorkoutActionFixture();const history=structuredClone(state.workouts),program=structuredClone(state.program);
  menu(state);act(()=>button('Train this workout today').click());expect(route).toHaveBeenCalledWith({useWorkoutToday:{sessionId:id}});
  const request=route.mock.calls[0][0].useWorkoutToday,proposal=proposeWorkoutToday(state,request);expect(proposal.status).toBe('ready');
  state=applyWorkoutToday(state,proposal,{persist:()=>true});expect(state.workouts).toEqual(history);expect(state.program).toEqual(program);
  state.activeWorkout=startWorkout(state,adaptedTemplateForToday(state));expect(state.activeWorkout.logicalSessionId).toBe(id);
  expect(workoutPerformedDate(state.activeWorkout)).toBe('2026-10-04');expect(state.activeWorkout.originalScheduledDate).toBe('2026-10-02');
  state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{completed:true,weight:20,reps:8})));
  state=deserializeState(serializeState(completeWorkout(state)));
  expect(state.workouts.slice(0,history.length)).toEqual(history);expect(state.workouts).toHaveLength(history.length+1);
  expect(new Set(state.workouts.map(w=>w.id)).size).toBe(state.workouts.length);
  expect(state.workouts.filter(w=>w.logicalSessionId===id)).toHaveLength(1);expect(flexibleSessions(state).filter(s=>s.logicalSessionId===id)).toHaveLength(1);
  expect(flexibleOccurrenceForDate(state,'2026-10-02')).toMatchObject({status:'completed',actualPerformedDate:'2026-10-04',originalScheduledDate:'2026-10-02'});
  expect(()=>applyWorkoutToday(state,proposal,{persist:()=>true})).toThrow(/changed/);
});
it('changing the plan start invalidates menu eligibility immediately without changing factual status',()=>{
  const state=missedWorkoutActionFixture();menu(state);expect(button('Move to another day')).toBeDefined();
  menu({...state,program:{...state.program,trainingBlock:{...state.program.trainingBlock,startDate:'2026-10-04'}}});
  expect(button('Move to another day')).toBeUndefined();expect(button('Train this workout today')).toBeUndefined();
});
it('a changed plan revision quarantines old schedule links before advertising Move',()=>{
  let state=missedWorkoutActionFixture();state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-10-05'})).state;
  const storedFingerprint=state.flexibleWeek.sessions[id].planFingerprint;
  state={...state,program:{...state.program,version:(state.program.version||0)+1}};
  expect(flexiblePlanFingerprint(state)).not.toBe(storedFingerprint);menu(state);
  expect(button('Move to another day')).toBeUndefined();expect(button('Train this workout today')).toBeUndefined();expect(update).not.toHaveBeenCalled();
});
it('a stale direct Move request recovers to current scheduling actions instead of a Train Today dead end',()=>{
  moveSheet(missedWorkoutActionFixture({outsidePlan:true}),{sessionId:id,destination:true});
  expect(document.body.textContent).not.toContain('Use this workout today');expect(button('Review current schedule')).toBeDefined();
  act(()=>button('Review current schedule').click());expect(document.body.textContent).toContain('What changed?');expect(button('Review current schedule')).toBeUndefined();
  expect(update).not.toHaveBeenCalled();
});
it('live source completion removes actions and recovers an already open picker',()=>{
  const state=missedWorkoutActionFixture();menu(state);expect(button('Move to another day')).toBeDefined();
  const next={...state,workouts:[...state.workouts,{id:'linked-done',logicalSessionId:id,completedAt:'2026-10-04T17:00:00',exercises:[]}]};
  menu(next);expect(button('Move to another day')).toBeUndefined();expect(button('Train this workout today')).toBeUndefined();
  moveSheet(state,{sessionId:id,destination:true});moveSheet(next,{sessionId:id,destination:true});expect(button('Review current schedule')).toBeDefined();
});
it('date rollover recomputes open overflow eligibility even when historical selection and domain references stay unchanged',()=>{
  const state=missedWorkoutActionFixture();menu(state);expect(button('Train this workout today')).toBeDefined();
  vi.setSystemTime(new Date('2026-10-05T00:01:00'));act(()=>window.dispatchEvent(new Event('focus')));
  // Monday now has no performed session, and canonical destination validity uses Monday.
  act(()=>button('Move to another day').click());moveSheet(state,route.mock.calls[0][0].flexibleWeek);
  expect(document.querySelector('[data-move-date="2026-10-04"]')).toBeNull();expect(document.querySelector('[data-move-date="2026-10-05"]')).not.toBeNull();
  expect(state.selectedDate).toBe('2026-10-02');expect(update).not.toHaveBeenCalled();
});
it('stale Train Today offers current schedule recovery and never unlocks/applies an invalid source',()=>{
  render(<UseWorkoutTodaySheet state={missedWorkoutActionFixture({outsidePlan:true})} request={{sessionId:id}} Header={Header} update={update} close={close} setDetail={route}/>);
  expect(button('APPLY')).toBeUndefined();act(()=>button('Review current schedule').click());expect(route).toHaveBeenCalledWith({flexibleWeek:{}});expect(update).not.toHaveBeenCalled();
});
it('swap-only Train Today does not offer an empty displaced-date sheet',()=>{
  const state=missedWorkoutActionFixture({loggedToday:false}),base=state.program.days[0];
  state.program.days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((weekday,index)=>({...structuredClone(base),id:`daily-${index}`,weekday}));
  const source=flexibleSessions(state).find(s=>s.scheduledDate==='2026-10-05');
  expect(canUseWorkoutToday(state,{sessionId:source.logicalSessionId})).toBe(true);
  render(<UseWorkoutTodaySheet state={state} request={{sessionId:source.logicalSessionId}} Header={Header} update={update} close={close} setDetail={route}/>);
  expect(button('SWAP WORKOUTS')).toBeDefined();expect([...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('Choose another date'))).toBe(false);
});
it('rest-day and Adjust week entry points do not advertise an empty Move chooser',()=>{
  const state=missedWorkoutActionFixture();state.program.trainingBlock.completed=true;
  moveSheet(state,{});expect([...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('Move a workout'))).toBe(false);
  render(<RestTrainingSheet state={state} date="2026-10-04" update={update} close={close} setPage={()=>{}} setDetail={route}/>);expect(document.body.textContent).not.toContain('MOVE A WORKOUT');
});
it('overflow hides Adjust week when the canonical schedule surface has no operation',()=>{
  const state=missedWorkoutActionFixture();state.program.trainingBlock.completed=true;
  menu(state);expect(button('Move to another day')).toBeUndefined();expect(button('Train this workout today')).toBeUndefined();expect(button('Adjust week')).toBeUndefined();
  expect(route).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
});
it('overflow refreshes Adjust week eligibility while retaining access to existing changes',()=>{
  let state=missedWorkoutActionFixture();menu(state);expect(button('Adjust week')).toBeDefined();
  const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-10-05'})).state;
  state={...state,program:{...state.program,trainingBlock:{...state.program.trainingBlock,completed:true}}};
  menu(state);expect(button('Adjust week')).toBeUndefined();
  menu({...moved,program:state.program});expect(button('Adjust week')).toBeDefined();
  act(()=>button('Adjust week').click());expect(route).toHaveBeenCalledWith({flexibleWeek:{}});expect(update).not.toHaveBeenCalled();
});
it.each(['planned','moved','completed','skipped'])('%s overflow offers Move exactly when canonical destinations exist',kind=>{
  let state=missedWorkoutActionFixture({loggedToday:false});
  if(kind==='planned')vi.setSystemTime(new Date('2026-10-02T12:00:00'));
  if(kind==='moved')state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-10-05'})).state;
  if(kind==='completed')state.workouts.push({id:'completed',logicalSessionId:id,completedAt:'2026-10-04T12:00:00',exercises:[]});
  if(kind==='skipped')state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:id})).state;
  const occurrence=flexibleOccurrenceForDate(state,'2026-10-02');menu(state);
  expect(Boolean(button('Move to another day'))).toBe(occurrence.scheduledDate==='2026-10-02' && hasMoveWorkoutDestination(state,id));
  expect(update).not.toHaveBeenCalled();
});
