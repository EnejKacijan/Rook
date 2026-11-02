import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {WeekendStreakReminder} from './TrainingStreak.jsx';
import {ModalLayer,Today,NoPlanToday} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState,startWorkout} from './domain.js';
import {STREAK_PRESENTATION_KEY,claimStreakPresentation} from './trainingStreak.js';

vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,profileSeq=0;
const log=(date,id=date)=>({id,name:'Sample workout',startedAt:Date.parse(`${date}T09:00:00`),completedAt:new Date(`${date}T10:00:00`).toISOString(),status:'completed',exercises:[{sets:[{completed:true,reps:8,weight:30}]}]});
function fixture(days=['2026-10-12','2026-10-19']) {
  const s=createReturningUserFixture(0);s.profile.id=`weekend-${++profileSeq}`;s.workouts=days.map(date=>log(date));
  s.program.days.forEach((day,i)=>day.weekday=['Mon','Tue','Thu','Fri'][i]);s.selectedDate='2026-10-31';s.activeWorkout=null;s.activeOptionalSession=null;return s;
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T12:00:00'));localStorage.clear();saveState.mockReset().mockReturnValue(true);
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}]);HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const draw=ui=>act(async()=>root.render(ui));
const remount=async ui=>{await act(async()=>root.unmount());root=createRoot(host);await draw(ui);};
const moment=()=>document.querySelector('.streak-moment-sheet.is-at-risk');
const closeMoment=async(label='GOT IT')=>{await act(async()=>[...moment().querySelectorAll('button')].find(button=>button.textContent===label).click());await act(async()=>vi.advanceTimersByTimeAsync(350));};
const today=(s,props={})=><Today state={s} update={()=>{}} setPage={props.setPage||(()=>{})} setDetail={props.setDetail||(()=>{})} {...props}/>;
const expectNoInline=()=>{expect(host.textContent).not.toMatch(/One workout (?:today|by Sunday) keeps/);expect(host.querySelector('.today-streak-row,.today-missed-streak,.streak-reminder-hide')).toBeNull();};

it('opens the weekend sheet once and leaves no persistent streak text or extra Hide after GOT IT',async()=>{
  const s=fixture(),setPage=vi.fn(),setDetail=vi.fn();await draw(today(s,{setPage,setDetail}));
  expect(moment().textContent).toContain('Keep your 2-week streak alive');expect(moment().textContent).toContain('This week stays open until Sunday');
  expectNoInline();await closeMoment();expect(moment()).toBeNull();expectNoInline();
  await remount(today(s,{setPage,setDetail}));expect(moment()).toBeNull();expectNoInline();
  expect(setPage).not.toHaveBeenCalled();expect(setDetail).not.toHaveBeenCalled();expect(s.activeWorkout).toBeNull();
});
it('Sunday uses last-day copy and the open sheet disappears at Monday foreground rollover',async()=>{
  vi.setSystemTime(new Date('2026-11-01T23:59:00'));const s=fixture();
  await draw(<WeekendStreakReminder state={s} date="2026-11-01" Modal={ModalLayer}/>);
  expect(moment().textContent).toContain('Today is the last day of this week');
  vi.setSystemTime(new Date('2026-11-02T00:00:00'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(moment()).toBeNull();expect(host.textContent).toBe('');
});
it.each(['2026-10-30','2026-10-24','2026-11-01'])('stays quiet for weekday or browsed date %s',async date=>{
  const s=fixture();await draw(<WeekendStreakReminder state={s} date={date} Modal={ModalLayer}/>);
  expect(moment()).toBeNull();expectNoInline();
});
it('sheet mute persists for the week, while another profile and the next eligible week get their own moment',async()=>{
  const s=fixture();await draw(today(s));await closeMoment('Don’t remind me this week');
  expect(moment()).toBeNull();expectNoInline();await remount(today(s));expect(moment()).toBeNull();
  expect(JSON.parse(localStorage.getItem(STREAK_PRESENTATION_KEY)).records.find(row=>row.profileId===s.profile.id).reminderHidden).toBe('2026-10-26');
  await remount(today(fixture()));expect(moment()).not.toBeNull();await closeMoment();
  vi.setSystemTime(new Date('2026-11-07T12:00:00'));const later={...s,selectedDate:'2026-11-07',workouts:[...s.workouts,log('2026-10-27')]};
  await remount(today(later));expect(moment().textContent).toContain('3-week');expectNoInline();
});
it('missed workouts keep only their count and independent Hide/Undo, without changing streak preferences',async()=>{
  const s=fixture(['2026-10-12','2026-10-19','2026-10-27']);vi.setSystemTime(new Date('2026-11-07T12:00:00'));s.selectedDate='2026-11-07';
  function Owner(){const[state,setState]=useState(s);return today(state,{update:fn=>setState(previous=>fn(structuredClone(previous)))});}
  await draw(<Owner/>);await closeMoment();const missed=host.querySelector('.today-missed-row');
  expect(missed.textContent).toMatch(/^\d+ missed workoutsHide$/);expect(missed.querySelector('.today-missed-open').getAttribute('aria-label')).not.toContain('streak');expectNoInline();
  await act(async()=>host.querySelector('.missed-reminder-hide').click());
  expect(host.querySelector('.today-missed-disclosure.is-open')).toBeNull();expect(document.querySelector('.rook-snackbar').textContent).toContain('Missed workouts hidden');
  expect(JSON.parse(localStorage.getItem(STREAK_PRESENTATION_KEY)).records.find(row=>row.profileId===s.profile.id).reminderHidden).toBeUndefined();
  await act(async()=>[...document.querySelectorAll('.rook-snackbar button')].find(button=>button.textContent==='Undo').click());
  expect(host.querySelector('.today-missed-disclosure.is-open .today-missed-row')).not.toBeNull();expectNoInline();expect(moment()).toBeNull();
});
it('a blocked store opens no automatic sheet and adds no fallback row',async()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
  await draw(today(fixture()));expect(moment()).toBeNull();expectNoInline();
});
it('eligibility changes dismiss an open sheet without replaying it when the same week becomes eligible again',async()=>{
  const s=fixture();await draw(today(s));expect(moment()).not.toBeNull();
  await draw(today({...s,workouts:[...s.workouts,log('2026-10-31')]}));expect(moment()).toBeNull();
  await draw(today(s));expect(moment()).toBeNull();expectNoInline();
});
it('stays out of a current workout while a stale workout can still receive the one-time sheet',async()=>{
  const busy=fixture();busy.activeWorkout=startWorkout(busy,busy.program.days[0]);await draw(today(busy));expect(moment()).toBeNull();
  const stale=fixture();stale.activeWorkout={...startWorkout(stale,stale.program.days[0]),startedAt:Date.parse('2026-10-23T09:00:00'),utcOffsetMinutesAtStart:undefined};
  await remount(today(stale));expect(moment()).not.toBeNull();expect(host.querySelector('.active-workout-notice')).not.toBeNull();expectNoInline();
});
it('no-plan Today uses the sheet without leaving a standalone reminder behind',async()=>{
  const s=fixture();s.program=null;await draw(<NoPlanToday state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
  expect(moment()).not.toBeNull();await closeMoment();expect(moment()).toBeNull();expectNoInline();
  const fresh=fixture([]);fresh.program=null;await remount(<NoPlanToday state={fresh} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);expect(moment()).toBeNull();expectNoInline();
});
it('never covers another sheet or plan-ready notice, and an open moment cannot leak into an already-notified profile',async()=>{
  const ready=fixture();await draw(today(ready,{planReady:true,dismissPlanReady:()=>{}}));expect(moment()).toBeNull();expectNoInline();
  const other=document.createElement('div');other.className='modal-layer';document.body.append(other);await remount(today(fixture()));expect(moment()).toBeNull();other.remove();
  const a=fixture();await remount(today(a));expect(moment()).not.toBeNull();
  const b=fixture();claimStreakPresentation(b.profile.id,'riskMoment','2026-10-26');await draw(today(b));expect(moment()).toBeNull();expectNoInline();
  await draw(today(a));expect(moment()).toBeNull();
});
