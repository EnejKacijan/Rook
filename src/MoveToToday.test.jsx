import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {Today, ActiveWorkout, SheetHeader} from './App.jsx';
import {moveToTodayFixture, moveToTodaySource} from './moveToToday.fixture.js';
import {moveWorkoutDestinations, proposeFlexibleWeek, applyFlexibleWeek, flexibleSessions, flexibleSessionById} from './flexibleWeek.js';
import {isoDay, startWorkout, serializeState, deserializeState, STORAGE_KEY} from './domain.js';

let root, host, current, change, close, navigate, publish;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T23:20:00'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({matches:true, addEventListener(){}, removeEventListener(){}}));
  localStorage.clear(); host=document.createElement('div');document.body.append(host);root=createRoot(host);
  close=vi.fn(); navigate=vi.fn(); publish=vi.fn();
});
afterEach(() => {act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const button = text => [...host.querySelectorAll('button')].find(node=>node.textContent === text);
const tap = text => act(()=>button(text).click());
function mount(state, initial = 'sheet') {
  function Harness() {
    const [value,setValue]=useState(state), [page,setPage]=useState(initial);
    current=value; change=fn=>setValue(old=>fn(structuredClone(old)));
    const update=(fn,options)=>{publish(options);change(fn);};
    const nav=next=>{navigate(next);setPage(next);};
    return page==='sheet' ? <FlexibleWeekSheet state={value} update={update} close={()=>{close();setPage('today');}} Header={SheetHeader} request={{move:true}}/>
      : page==='today' ? <Today state={value} update={update} setPage={nav} setDetail={()=>{}}/>
      : <ActiveWorkout state={value} update={update} setPage={nav} setDetail={()=>{}}/>;
  }
  act(()=>root.render(<Harness/>));
}
function destination(state) {
  const id=moveToTodaySource(state).logicalSessionId;
  act(()=>host.querySelector(`[data-session-id="${id}"]`).click());
  return id;
}
it.each(['freestyle','none','completed-freestyle'])('reviews then durably applies Move to today with %s, without mutating the active session or plan', kind => {
  const state=moveToTodayFixture(kind), before=structuredClone(state);mount(state);
  const id=destination(state);expect(button('Move to today').disabled).toBe(false);
  tap('Move to today');expect(host.querySelector('h1').textContent).toBe('Move FUNKCIONALNI DAN?');
  expect(host.textContent).toContain('Wed, Sep 23 → Sun, Sep 20');
  expect(current).toEqual(before);expect(publish).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  tap('APPLY MOVE');expect(host.querySelector('h1').textContent).toBe('Workout moved');expect(close).not.toHaveBeenCalled();
  expect(current.activeWorkout).toEqual(before.activeWorkout);expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  expect(flexibleSessionById(current,id)).toMatchObject({scheduledDate:isoDay(),originalDate:'2026-09-23',status:'planned'});
  expect(flexibleSessions(current).filter(item=>item.logicalSessionId===id)).toHaveLength(1);
  expect(publish).toHaveBeenCalledOnce();expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).flexibleWeek).toEqual(current.flexibleWeek);
  tap('DONE');expect(close).toHaveBeenCalledOnce();
  if(before.activeWorkout){
    expect(host.querySelector('.active-workout-hero').textContent).toContain('Freestyle workout');
    const planned=host.querySelector('[aria-label="Planned workout"]');expect(planned.textContent).toContain('FUNKCIONALNI DAN');expect(planned.textContent).toContain('Not started');
    expect(host.querySelectorAll('[aria-label="Planned workout"]')).toHaveLength(1);
    tap('RESUME WORKOUT');expect(navigate).toHaveBeenCalledWith('workout');expect(current.activeWorkout).toEqual(before.activeWorkout);
  }else expect(host.querySelector('.today-hero').textContent).toContain('FUNKCIONALNI DAN');
  const reloaded=deserializeState(serializeState(current));expect(reloaded.activeWorkout).toEqual(before.activeWorkout);
  expect(flexibleSessionById(reloaded,id).scheduledDate).toBe(isoDay());
});
it.each(['active-planned','planned','completed-planned'])('disables the shortcut and same date cell for an occupied %s destination, with an adjacent accessible reason', kind => {
  const state=moveToTodayFixture(kind), before=serializeState(state);mount(state);const id=destination(state),shortcut=button('Move to today');
  expect(proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:isoDay()}).status).toBe('conflict');
  expect(shortcut.disabled).toBe(true);const reason=document.getElementById(shortcut.getAttribute('aria-describedby'));
  expect(reason.textContent).toMatch(/another workout|active planned workout|completed planned workout/i);
  expect(shortcut.nextElementSibling).toBe(reason);
  expect([...host.querySelectorAll(`[data-move-date="${isoDay()}"]`)].every(node=>node.disabled)).toBe(true);
  act(()=>shortcut.click());expect(publish).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(serializeState(current)).toBe(before);
});
it.each(['freestyle','none','completed-freestyle','active-planned','completed-planned'])('every displayed destination agrees with proposal validation and apply for %s', kind => {
  const state=moveToTodayFixture(kind);mount(state);const sessionId=destination(state);
  for(const destination of moveWorkoutDestinations(state,sessionId)){
    const p=proposeFlexibleWeek(state,{mode:'move',sessionId,toDate:destination.date});
    expect(destination.available).toBe(p.status==='ready');
    for(const node of host.querySelectorAll(`[data-move-date="${destination.date}"]`))expect(node.disabled).toBe(!destination.available);
    if(destination.available){const result=applyFlexibleWeek(state,p);expect(result.status).toBe('applied');expect(result.state.activeWorkout).toEqual(state.activeWorkout);}
  }
});
it('does not treat an unrelated completed planned record performed today as an occupied Today slot', () => {
  const state=moveToTodayFixture(), source=flexibleSessions(state).find(item=>item.originalDate==='2026-09-18');
  state.workouts.push({id:'prior-plan-work',logicalSessionId:source.logicalSessionId,programDayId:source.workoutId,canonicalPlanDate:source.originalDate,workoutDateKey:isoDay(),completedAt:'2026-09-20T01:37:00',name:source.workout.name,exercises:[]});
  expect(proposeFlexibleWeek(state,{mode:'move',sessionId:moveToTodaySource(state).logicalSessionId,toDate:isoDay()}).status).toBe('ready');
  mount(state);destination(state);expect(button('Move to today').disabled).toBe(false);
});
it('keeps review, selected destination, saved schedule and active workout on persistence failure, then retries', () => {
  const state=moveToTodayFixture();localStorage.setItem(STORAGE_KEY,serializeState(state));const saved=localStorage.getItem(STORAGE_KEY);mount(state);destination(state);tap('Move to today');
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});tap('APPLY MOVE');
  expect(current).toEqual(state);expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);expect(close).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();
  expect(host.querySelector('h1').textContent).toBe('Move FUNKCIONALNI DAN?');expect(host.querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');
  write.mockRestore();tap('TRY AGAIN');expect(host.querySelector('h1').textContent).toBe('Workout moved');expect(current.activeWorkout).toEqual(state.activeWorkout);
});
it.each(['schedule','source-started'])('keeps the review and rejects Apply when %s changes', kind => {
  const state=moveToTodayFixture();mount(state);destination(state);tap('Move to today');
  act(()=>change(next=>{if(kind==='schedule')next.weekScheduleOverrides={'2026-09-21':{}};else next.activeWorkout=startWorkout({...next,activeWorkout:null},moveToTodaySource(next).workout);return next;}));
  const before=structuredClone(current);expect(host.querySelector('h1').textContent).toBe('Move FUNKCIONALNI DAN?');tap('APPLY MOVE');
  expect(current).toEqual(before);expect(publish).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]').textContent).toContain('Review the schedule again');
});
it('never presents a move to the same date as an actionable no-op', () => {
  const state=moveToTodayFixture(), source=moveToTodaySource(state);
  expect(proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:source.scheduledDate})).toMatchObject({status:'conflict',error:expect.stringContaining('already scheduled')});
});
