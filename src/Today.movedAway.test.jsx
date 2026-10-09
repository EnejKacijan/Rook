// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today} from './App.jsx';
import {blankState,buildProgram,startWorkout,completeWorkout,serializeState,deserializeState} from './domain.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,flexiblePlanFingerprint} from './flexibleWeek.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';

let host,root,current,change,detail;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);detail=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
function initial(){const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,showExerciseImages:false});s.program=buildProgram(s.profile);s.program.createdAt='2026-09-21T12:00:00';s.program.trainingBlock.startDate='2026-09-21';s.selectedDate='2026-10-01';s.selectedDay='Thu';return deserializeState(s);}
function move(s,from='2026-10-01',to='2026-10-03'){const source=flexibleSessions(s).find(item=>item.originalDate===from);const proposal=proposeFlexibleWeek(s,{mode:'move',sessionId:source.logicalSessionId,toDate:to});expect(proposal.status).toBe('ready');return applyFlexibleWeek(s,proposal).state;}
function mount(s){function Harness(){const[value,setValue]=useState(s);current=value;change=fn=>setValue(old=>fn(structuredClone(old)));return <Today state={value} update={change} setPage={()=>{}} setDetail={detail}/>;}act(()=>root.render(<Harness/>));}
const title=()=>host.querySelector('h1')?.textContent;
const textButton=text=>[...host.querySelectorAll('button')].find(button=>button.textContent===text);
it('sole valid move makes the selected date rest, with secondary provenance and destination navigation only',()=>{
  const s=move(initial()),before=structuredClone(s),record=Object.values(s.flexibleWeek.sessions)[0];mount(s);
  expect(title()).toBe('Rest day');expect(host.querySelector('.rest-day-state').textContent).toContain('No workout scheduled for this day.');
  expect(host.querySelector('.today-day-header').textContent).toContain('Thursday, Oct 1');
  expect(host.querySelector('.today-moved-provenance').textContent).toContain('Moved to Saturday, Oct 3');
  expect(current).toEqual(before);act(()=>host.querySelector('.today-moved-provenance button').click());
  expect(current).toEqual({...before,selectedDate:record.scheduledDate,selectedDay:'Sat'});expect(title()).not.toBe('Rest day');
  expect(current.flexibleWeek).toEqual(before.flexibleWeek);expect(current.workouts).toEqual(before.workouts);
});
it('a moved-in workout wins over the moved-away provenance',()=>{mount(move(move(initial()),'2026-10-02','2026-10-01'));expect(title()).not.toBe('Rest day');expect(host.querySelector('.today-moved-provenance')).toBeNull();expect(host.textContent).toContain('Moved from Friday, Oct 2');});
it.each(['active','completed','ended'])('%s on the selected date retains its canonical session presentation',kind=>{
  let s=move(initial());const source=flexibleSessions(s).find(item=>item.originalDate==='2026-10-01');s.activeWorkout=startWorkout(s,source.workout);
  if(kind!=='active'){if(kind==='completed')s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:10})));s=completeWorkout(s);}
  mount(s);expect(title()).not.toBe('Rest day');expect(host.querySelector('.today-moved-provenance')).toBeNull();
  expect(host.textContent).toContain(kind==='active'?'RESUME WORKOUT':kind==='completed'?'WORKOUT COMPLETE':'VIEW WORKOUT');
});
it('freestyle history is not swallowed by the moved-source branch',()=>{
  let s=move(initial());s=addFreestyleExercise(startFreestyleWorkout(s),'plank');Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,reps:40});s=completeWorkout(s);mount(s);
  expect(host.querySelector('.today-completed-workouts').textContent).toContain('Freestyle workout');expect(host.querySelector('.today-moved-provenance')).toBeNull();
});
it('unresolved saved move remains actionable, not successful rest',()=>{const s=move(initial());s.program.version=(s.program.version||0)+1;mount(s);expect(title()).not.toBe('Rest day');expect(host.textContent).toContain('Needs a destination');act(()=>host.querySelector('.today-hero .button').click());expect(detail).toHaveBeenCalledWith({flexibleWeek:{reviewExisting:true,focusSessionId:Object.keys(s.flexibleWeek.sessions)[0]}});});
it('multiple moved sources are listed once by occurrence identity',()=>{
  const s=move(initial()),friday=s.program.days.find(day=>day.weekday==='Fri'),id=`${friday.id}:2026-10-01`;
  s.flexibleWeek.sessions[id]={...Object.values(s.flexibleWeek.sessions)[0],id,workoutId:friday.id,name:friday.name,scheduledDate:'2026-10-04',planFingerprint:flexiblePlanFingerprint(s)};
  mount(s);expect(title()).toBe('Rest day');expect(host.querySelectorAll('.today-moved-provenance button')).toHaveLength(2);expect(new Set([...host.querySelectorAll('.today-moved-provenance p')].map(p=>p.textContent)).size).toBe(2);
});
it('undo, another move and reload recompute without changing IDs/history',()=>{
  const s=move(initial()),id=Object.keys(s.flexibleWeek.sessions)[0];mount(s);
  act(()=>change(next=>{delete next.flexibleWeek.sessions[id];return next;}));expect(title()).not.toBe('Rest day');
  act(()=>change(next=>move(next)));expect(title()).toBe('Rest day');expect(Object.keys(current.flexibleWeek.sessions)).toEqual([id]);
  act(()=>change(next=>{next.flexibleWeek.sessions[id].scheduledDate='2026-10-04';return deserializeState(serializeState(next));}));
  expect(host.querySelector('.today-moved-provenance').textContent).toContain('Sunday, Oct 4');expect(current.workouts).toEqual(s.workouts);expect(Object.keys(current.flexibleWeek.sessions)).toEqual([id]);
});
