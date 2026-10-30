import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useLiftState} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {forgetStorageSession,PRIMARY_KEY} from './localStateStorage.js';
import {calendarTodaySelection,selectCalendarToday,selectCalendarDate} from './calendarNavigation.js';
import {useFollowTodayCalendar} from './useFollowTodayCalendar.js';
import {continueIdleWorkout,reviewWorkoutTiming} from './workoutTiming.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current,change,intent,route,edit,enter;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00'));
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
  localStorage.clear();forgetStorageSession(localStorage);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{
  act(()=>root.unmount());host.remove();localStorage.clear();forgetStorageSession(localStorage);
  vi.restoreAllMocks();vi.useRealTimers();
});
function fixture(kind='none') {
  let state=createReturningUserFixture(0);
  const start=new Date('2026-10-27T18:00:00').getTime();
  if(kind==='planned'||kind==='freestyle'){
    const date=domain.isoDay(start);
    state.selectedDate=date;state.selectedDay=domain.weekday(new Date(start));
    if(kind==='freestyle')state=addFreestyleExercise(startFreestyleWorkout(state,{date,now:start}),'plank');
    else state.activeWorkout=domain.startWorkout(state,domain.plannedWorkoutForDate(state,date)||state.program.days[0]);
    Object.assign(state.activeWorkout,{workoutDateKey:date,canonicalPlanDate:date,startedAt:start,lastMeaningfulWorkoutActivityAt:start+1800000});
    Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,completedAt:start+1800000,weight:30,reps:8});
  }
  if(kind.startsWith('optional')){
    state=domain.startOptionalSession(state,{date:domain.isoDay(start),kind:'Cardio',activity:'Walking',duration:20,intensity:'Easy'},start);
    if(kind==='optional-paused')state=domain.pauseOptionalSession(state,start+300000);
    expect(state.activeOptionalSession?.status).toBe(kind==='optional-paused'?'paused':'active');
  }
  return state;
}
function mount(initial,initialRoute='today') {
  localStorage.setItem(PRIMARY_KEY,domain.serializeState(initial));
  const startup=domain.readStartupState();expect(startup.status).toBe('ready');
  function Owner(){
    const [state,update,,calendarIntent]=useLiftState(startup);
    const [page,setPage]=useState(initialRoute),[editing,setEditing]=useState(false);
    current=state;change=update;intent=calendarIntent;route=setPage;edit=setEditing;
    enter=(next,{preserveDate=false}={})=>{if(next==='today'&&!preserveDate)selectCalendarToday(update);setPage(next);};
    useFollowTodayCalendar({enabled:page==='today'&&!editing,intent:calendarIntent,update});
    return <section data-page={page}><output>{state.selectedDate}</output><input aria-label="Draft" defaultValue="53,"/></section>;
  }
  act(()=>root.render(<Owner/>));return startup;
}
const data=state=>{const {selectedDate,selectedDay,...rest}=state;return rest;};
const focus=()=>act(()=>window.dispatchEvent(new Event('focus')));
const moveClock=value=>{vi.setSystemTime(new Date(value));focus();};

it.each(['none','planned','freestyle','optional-running','optional-paused'].flatMap(kind=>['2026-10-26','2026-11-02'].map(date=>[kind,date])))('cold launch selects today instead of saved %s browsing date %s without changing training', (kind,date)=>{
  const initial=fixture(kind);initial.selectedDate=date;initial.selectedDay=domain.weekday(`${date}T12:00:00`);
  const startup=mount(initial);
  expect(current.selectedDate).toBe('2026-10-28');expect(current.selectedDay).toBe('Wed');
  expect(data(current)).toEqual(data(startup.state));expect(startup.state.selectedDate).toBe(date);
  expect(intent.current.followToday).toBe(true);
});

it.each([
  ['2026-10-27T23:59:00','2026-10-28T00:01:00','2026-10-28'],
  ['2026-12-31T23:59:00','2027-01-01T00:01:00','2027-01-01'],
  ['2027-03-28T00:30:00','2027-03-29T00:30:00','2027-03-29'],
  ['2026-10-25T00:30:00','2026-10-25T03:30:00','2026-10-25'],
])('following today reconciles local calendar changes %s → %s', (before,after,expected)=>{
  vi.setSystemTime(new Date(before));mount(fixture());const training=data(current);
  moveClock(after);expect(current.selectedDate).toBe(expected);expect(data(current)).toEqual(training);
});

it.each(['focus','pageshow','visibilitychange','timer'])('reconciles a suspended Today via %s',event=>{
  mount(fixture());const before=data(current);vi.setSystemTime(new Date('2026-10-29T12:00:00'));
  act(()=>{if(event==='timer')vi.advanceTimersByTime(30000);else (event==='visibilitychange'?document:window).dispatchEvent(new Event(event));});
  expect(current.selectedDate).toBe('2026-10-29');expect(data(current)).toEqual(before);
});

it.each(['2026-10-27','2026-10-28','2026-10-29'])('manual date %s stays pinned even if it equals today or later becomes today',date=>{
  mount(fixture());act(()=>selectCalendarDate(change,date));const before=data(current);
  moveClock('2026-10-29T12:00:00');moveClock('2026-10-30T12:00:00');
  expect(current.selectedDate).toBe(date);expect(intent.current.followToday).toBe(false);expect(data(current)).toEqual(before);
  act(()=>selectCalendarToday(change));expect(current.selectedDate).toBe('2026-10-30');
  moveClock('2026-10-31T12:00:00');expect(current.selectedDate).toBe('2026-10-31');
});

it.each(['profile','coach','workout','editor'])('overnight foreground preserves %s and its raw draft until returning to Today',page=>{
  mount(fixture('planned'));if(page==='editor')act(()=>edit(true));else act(()=>route(page));
  const draft=host.querySelector('input');draft.value='60,';const active=structuredClone(current.activeWorkout);
  moveClock('2026-10-29T12:00:00');
  expect(current.selectedDate).toBe('2026-10-28');expect(host.querySelector('input')).toBe(draft);expect(draft.value).toBe('60,');
  expect(current.activeWorkout).toEqual(active);expect(host.querySelector('section').dataset.page).toBe(page==='editor'?'today':page);
  act(()=>{edit(false);route('today');});expect(current.selectedDate).toBe('2026-10-29');expect(current.activeWorkout).toEqual(active);
});

it('same-day foreground does not change a manually browsed date or raw input',()=>{
  mount(fixture());act(()=>selectCalendarDate(change,'2026-11-02'));
  const before=current,input=host.querySelector('input');input.value='70,';focus();
  expect(current).toBe(before);expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('70,');
});

it('explicit dated entry stays pinned, while Back to Today clears that intent',()=>{
  mount(fixture('planned'),'coach');const active=structuredClone(current.activeWorkout);
  act(()=>{selectCalendarDate(change,'2026-10-30');enter('today',{preserveDate:true});});
  moveClock('2026-10-31T12:00:00');expect(current.selectedDate).toBe('2026-10-30');
  act(()=>enter('today'));expect(current.selectedDate).toBe('2026-10-31');expect(intent.current.followToday).toBe(true);
  expect(current.activeWorkout).toEqual(active);
});

it('a queued clock reconciliation cannot overwrite a newer explicit date selection',()=>{
  mount(fixture());act(()=>{
    selectCalendarDate(change,'2026-11-02');
    const selection=calendarTodaySelection();
    change(state=>({...state,selectedDate:selection.date,selectedDay:selection.day}),{navigationDate:{...selection,followToday:true,onlyIfFollowingToday:true}});
  });
  expect(current.selectedDate).toBe('2026-11-02');expect(intent.current.followToday).toBe(false);
});

it('normal date-changing transactions are pinned without dropping the rest of the transaction',()=>{
  mount(fixture());act(()=>change(state=>({...state,selectedDate:'2026-11-02',selectedDay:'Mon',coachDraft:'Keep this draft'})));
  moveClock('2026-10-29T12:00:00');expect(current.selectedDate).toBe('2026-11-02');expect(current.coachDraft).toBe('Keep this draft');
});

it.each(['optional-running','optional-paused'])('%s survives midnight, date navigation and a persisted reload unchanged',async kind=>{
  mount(fixture(kind));const original=structuredClone(current.activeOptionalSession);
  moveClock('2026-10-29T12:00:00');act(()=>selectCalendarDate(change,'2026-11-02'));
  await act(async()=>vi.advanceTimersByTimeAsync(50));
  const saved=domain.readStartupState();expect(saved.state.activeOptionalSession).toEqual(original);
  act(()=>root.unmount());root=createRoot(host);mount(saved.state);
  expect(current.selectedDate).toBe('2026-10-29');expect(current.activeOptionalSession).toEqual(original);
});

it('continuing and finishing yesterday’s workout keeps its performed date and logged sets',()=>{
  mount(fixture('planned'));const original=structuredClone(current.activeWorkout),date=domain.workoutPerformedDate(original);
  const review=reviewWorkoutTiming(current);expect(review).not.toBeNull();
  act(()=>change(state=>continueIdleWorkout(state,review,{requestId:'calendar-test-resume'})));
  act(()=>change(state=>{Object.assign(state.activeWorkout.exercises[0].sets[1],{completed:true,completedAt:Date.now(),weight:32.5,reps:9});return state;}));
  expect(domain.workoutPerformedDate(current.activeWorkout)).toBe(date);
  act(()=>enter('today'));expect(current.selectedDate).toBe('2026-10-28');
  act(()=>change(state=>domain.completeWorkout(state)));
  act(()=>enter('today'));
  const completed=current.workouts.at(-1);expect(domain.workoutPerformedDate(completed)).toBe(date);
  expect(completed.exercises[0].sets.slice(0,2).map(set=>[set.weight,set.reps,set.completed])).toEqual([[30,8,true],[32.5,9,true]]);
  expect(current.selectedDate).toBe('2026-10-28');expect(current.activeWorkout).toBeNull();
});

it('no-plan profiles also follow the new local day',()=>{
  const state=domain.blankState();Object.assign(state.profile,{onboardingComplete:true,preferredTrainingStyle:'freestyle',noPlanReceipt:{kind:'first-run'}});
  mount(state);moveClock('2026-10-29T12:00:00');expect(current.selectedDate).toBe('2026-10-29');expect(current.program).toBeNull();
});
