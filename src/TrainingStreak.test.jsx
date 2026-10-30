import React,{act,StrictMode,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ProfileTrainingStreak,CompletedWorkoutStreak,RestDayStreak} from './TrainingStreak.jsx';
import {Profile,ModalLayer,Today,ActiveOptionalSession} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startOptionalSession,saveState} from './domain.js';
import {STREAK_PRESENTATION_KEY,weeklyTrainingStreak} from './trainingStreak.js';

vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current;
const log=(date,id=date)=>({id,name:'Sample workout',startedAt:Date.parse(`${date}T09:00:00`),completedAt:new Date(`${date}T10:00:00`).toISOString(),status:'completed',exercises:[{sets:[{completed:true,reps:8,weight:30}]}]});
function fixture(days=['2026-10-12','2026-10-19','2026-10-27']) {
  const s=createReturningUserFixture(0);s.workouts=days.map(date=>log(date));return s;
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T12:00:00'));localStorage.clear();saveState.mockReset().mockReturnValue(true);
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}]);HTMLElement.prototype.getAnimations=()=>[];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const draw=ui=>act(()=>root.render(ui));
const click=name=>act(()=>[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')===name||button.textContent.trim()===name).click());
const remount=ui=>{act(()=>root.unmount());root=createRoot(host);draw(ui);};

it('adds a compact streak to the actual Profile hub, with its explanation behind the existing information sheet',()=>{
  const s=fixture();draw(<Profile state={s} update={()=>{}} setDetail={()=>{}} setPage={()=>{}}/>);
  const card=host.querySelector('.training-streak-card');expect(card.querySelector('h2').textContent).toBe('Weekly streak');
  expect(card.querySelector('.streak-number-current').textContent).toBe('3');expect(card.querySelector('.training-streak-best').textContent).toBe('Best 3');
  expect(card.textContent).not.toContain('Monday');expect(card.compareDocumentPosition(host.querySelector('.profile-manage'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  click('About your weekly streak');expect(document.querySelector('[role="dialog"][data-sheet-motion="information"]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"]').textContent).toContain('You don’t need to train or open ROOK every day');
  click('Close Your weekly streak');act(()=>vi.advanceTimersByTime(350));expect(document.querySelector('[role="dialog"]')).toBeNull();
  click('Workout preferencesTraining style, logging and increments');expect(host.querySelector('.training-streak-card')).toBeNull();
  expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();
});
it('a new user sees a zero state, and showing Profile never awards or changes a workout',()=>{
  const s=fixture([]),before=structuredClone(s);function Page(){const ref=useRef(null);return <ProfileTrainingStreak state={s} Modal={ModalLayer} backgroundRef={ref}/>;}
  draw(<Page/>);expect(host.textContent).not.toContain('Your first workout starts your streak.');expect(host.querySelector('.streak-number-current').textContent).toBe('0');
  click('About your weekly streak');expect(document.querySelector('[role="dialog"]').textContent).toContain('Your first workout starts your streak.');expect(s).toEqual(before);
});
it('a successful first completion rolls the actual counter once, including StrictMode and subsequent remount',()=>{
  const s=fixture(),session=s.workouts.at(-1),props={state:s,session,priorWorkouts:s.workouts.slice(0,-1),live:true};
  draw(<StrictMode><CompletedWorkoutStreak {...props}/></StrictMode>);
  expect(host.querySelector('.completion-streak').getAttribute('aria-label')).toBe('3-week streak');expect(host.querySelector('.streak-number-old').textContent).toBe('2');expect(host.textContent).toContain('+1 week');
  remount(<CompletedWorkoutStreak {...props}/>);expect(host.textContent).not.toContain('+1 week');expect(host.querySelector('.streak-number-current').textContent).toBe('3');
  expect(weeklyTrainingStreak(s).current).toBe(3);
});
it('a first streak celebrates its start instead of implying a previous week',()=>{
  const s=fixture(['2026-10-27']);draw(<CompletedWorkoutStreak state={s} session={s.workouts[0]} priorWorkouts={[]} live/>);
  expect(host.textContent).toContain('Streak started');expect(host.textContent).not.toContain('+1 week');expect(host.querySelector('.streak-number-old').textContent).toBe('0');
});
it('a failed save cannot show or consume a streak celebration',()=>{
  const s=fixture(),props={state:s,session:s.workouts.at(-1),priorWorkouts:s.workouts.slice(0,-1),live:true};
  draw(<CompletedWorkoutStreak {...props} persistenceFailed/>);expect(host.querySelector('.completion-streak')).toBeNull();expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();
  draw(<CompletedWorkoutStreak {...props}/>);expect(host.textContent).toContain('+1 week');
});
it('a static/history entry and additional workouts never replay +1 week',()=>{
  const s=fixture(),session=s.workouts.at(-1);draw(<CompletedWorkoutStreak state={s} session={session} priorWorkouts={s.workouts.slice(0,-1)}/>);
  expect(host.textContent).not.toContain('+1 week');expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();
  s.workouts.push(log('2026-10-27','second'));draw(<CompletedWorkoutStreak state={s} session={s.workouts.at(-1)} priorWorkouts={s.workouts.slice(0,-1)} live/>);
  expect(host.querySelector('.completion-streak')).toBeNull();
});
it('a missed week rolls over on foreground without changing workout data',()=>{
  vi.setSystemTime(new Date('2026-11-01T23:59:00'));const s=fixture(['2026-10-12','2026-10-19']);
  draw(<ProfileTrainingStreak state={s} Modal={ModalLayer}/>);expect(host.querySelector('.streak-number-current').textContent).toBe('2');
  vi.setSystemTime(new Date('2026-11-02T00:00:00'));act(()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('.streak-number-current').textContent).toBe('0');expect(host.querySelector('.training-streak-best').textContent).toBe('Best 2');expect(s.workouts).toHaveLength(2);
});
it('rest acknowledgement stays static on the real current day, without awarding or rewarding an app visit',()=>{
  const s=fixture();draw(<RestDayStreak state={s} date="2026-10-27"/>);
  expect(host.querySelector('.is-resting')).toBeNull();expect(host.textContent).toContain('Rest day · 3-week streak secured');expect(host.textContent).not.toContain('+1');
  remount(<RestDayStreak state={s} date="2026-10-27"/>);expect(host.querySelector('.is-resting')).toBeNull();expect(weeklyTrainingStreak(s).current).toBe(3);expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();
  draw(<RestDayStreak state={s} date="2026-10-28"/>);expect(host.textContent).toBe('');
});
it('rest never promises coverage for an unearned week, active workout or hidden/blocked surface',()=>{
  const s=fixture(['2026-10-12','2026-10-19']);draw(<RestDayStreak state={s} date="2026-10-27" enabled/>);expect(host.textContent).toBe('');
  const earned=fixture();earned.activeWorkout={id:'live'};draw(<RestDayStreak state={earned} date="2026-10-27" enabled/>);expect(host.textContent).toBe('');
  draw(<RestDayStreak state={fixture()} date="2026-10-27"/>);expect(host.querySelector('.is-resting')).toBeNull();expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();
});
it('the actual Today rest screen shows a quiet acknowledgement without a new modal or stacking an Undo notice',()=>{
  vi.setSystemTime(new Date('2026-10-28T12:00:00'));const s=fixture();s.program.days.forEach((day,i)=>day.weekday=['Mon','Tue','Thu','Sat'][i]);s.selectedDate='2026-10-28';
  draw(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
  expect(host.querySelector('.rest-day-state .rest-streak-note').textContent).toContain('3-week streak');expect(document.querySelector('[role="dialog"]')).toBeNull();expect(host.querySelector('.rook-snackbar')).toBeNull();
});
it.each([true,false])('optional-session completion celebrates only after successful persistence (%s)',saved=>{
  let initial=fixture(['2026-10-19']);initial=startOptionalSession(initial,{kind:'Cardio',activity:'Walking',duration:20,intensity:'Easy'},Date.now()-120000);
  function Owner(){const[state,setState]=useState(initial);current=state;return <ActiveOptionalSession state={state} update={fn=>setState(previous=>fn(structuredClone(previous)))} setPage={()=>{}}/>;}
  draw(<Owner/>);saveState.mockReturnValue(saved);click('FINISH SESSION');
  expect(Boolean(host.querySelector('.completion-streak'))).toBe(saved);expect(weeklyTrainingStreak(current).current).toBe(saved?2:1);
  if(!saved){expect(current.activeOptionalSession).not.toBeNull();expect(localStorage.getItem(STREAK_PRESENTATION_KEY)).toBeNull();}
});
