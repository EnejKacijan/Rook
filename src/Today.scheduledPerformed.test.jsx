import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {Today,TodayActionsSheet,exerciseHistoryPerformanceLabel} from './App.jsx';
import {MonthCalendar} from './MonthCalendar.jsx';
import {blankState,buildProgram,startWorkout,completeWorkout,serializeState,deserializeState} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {calendarDayStates} from './workoutCalendar.js';
import {flexibleSessions} from './flexibleWeek.js';
let root;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-17T18:10:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{act(()=>root?.unmount());document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(logged=true){let s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-09-14';s.program.createdAt='2026-09-14T12:00:00';s.selectedDate='2026-09-14';s.selectedDay='Mon';s.ai.planUpgradeDismissed=true;s.activeWorkout=startWorkout(s,flexibleSessions(s)[0].workout);if(logged)s.activeWorkout.exercises.forEach(e=>e.sets.forEach(x=>Object.assign(x,{completed:true,reps:8,weight:20})));s=completeWorkout(s);s.selectedDate='2026-09-14';return s;}
function render(element){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(element));}
it.each([false,true])('Monday links to the single Thursday fact without completed card or missed label (legacy=%s)',legacy=>{
 const s=fixture();if(legacy){delete s.workouts[0].logicalSessionId;delete s.workouts[0].programDayId;delete s.workouts[0].originalScheduledDate;}
 const detail=vi.fn();render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={detail}/>);
 expect(document.body.textContent).toContain('Performed Thursday, Sep 17');expect(document.body.textContent).not.toContain('missed — not performed');expect(document.body.textContent).not.toContain('WORKOUT COMPLETE');
 act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='View completed workout').click());expect(detail).toHaveBeenCalledWith({completedWorkout:s.workouts[0].id});
});
it('completed day overflow offers one Repeat action, with History on the completed UI and no Move or Swap for the fact',()=>{
 const s=fixture();render(<TodayActionsSheet state={s} update={()=>{}} close={()=>{}} setDetail={()=>{}} date="2026-09-17" hasWorkout/>);expect(document.body.textContent).toContain('Repeat a workout');expect(document.body.textContent).not.toContain('View history');expect(document.body.textContent).not.toContain('Move to another day');expect(document.body.textContent).not.toContain('Swap with another workout');
});
it('zero-set Finish Anyway is an ended session, not a fully completed workout',()=>{const s=fixture(false);s.selectedDate='2026-09-17';expect(s.workouts[0].status).toBe('ended-early');render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);expect(document.body.textContent).toContain('ended without logged sets');expect(document.body.textContent).toContain('No sets logged');expect(document.body.textContent).toContain('SESSION ENDED · VIEW HISTORY');expect(document.body.textContent).not.toContain('WORKOUT COMPLETE');});
it('completed factual rows bind to logged sets and partial rows remain explicit',()=>{const s=fixture();s.selectedDate='2026-09-17';s.workouts[0].exercises[0].sets.forEach(x=>x.completed=false);s.workouts[0].endedEarly=true;s.workouts[0].status='ended-early';render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);expect(document.body.textContent).toContain('ended early');expect(document.body.textContent).toContain('No sets logged');expect(document.body.textContent).toMatch(/\d+ sets logged/);expect(document.body.textContent).not.toContain('WORKOUT COMPLETE');});
it('fully completed session keeps completion action and actual set counts',()=>{const s=fixture();s.selectedDate='2026-09-17';render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);expect(document.body.textContent).toContain('WORKOUT COMPLETE · VIEW HISTORY');expect(document.body.textContent).not.toContain('No sets logged');});
it('week and month give one execution only its performed-date check while the source stays fulfilled',()=>{
 const s=fixture();s.selectedDate='2026-09-14';render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
 const source=document.querySelector('.week-strip button[aria-label^="Mon "]'),actual=document.querySelector('.week-strip button[aria-label^="Thu "]');
 expect(source.querySelector('.completed-dot')).toBeNull();expect(source.getAttribute('aria-label')).toContain('workout performed elsewhere');expect(actual.querySelector('.completed-dot')).not.toBeNull();
 expect(document.body.textContent).toContain('Performed Thursday');expect(document.body.textContent).not.toContain('Train today instead');
 act(()=>root.render(<MonthCalendar state={s} today="2026-09-17" selectedDate="2026-09-14" onSelect={()=>{}}/>));
 expect(document.querySelector('[data-date="2026-09-14"]').getAttribute('aria-label')).toContain('workout performed elsewhere');
 expect(document.querySelector('[data-date="2026-09-14"] .calendar-status-mark.is-completed')).toBeNull();
 expect(document.querySelector('[data-date="2026-09-17"]').getAttribute('aria-label')).toContain('completed workout');
});
it.each(['weighted','bodyweight','timed','per-side','mixed','empty'])('completed %s rows show the actual formatter and never the target',kind=>{
 const s=fixture();s.selectedDate='2026-09-17';const e=s.workouts[0].exercises[0];
 Object.assign(e,{exerciseId:kind==='bodyweight'?'pull-up':kind==='timed'?'plank':'barbell-bench-press',loggingMode:kind==='per-side'?'per_side':'normal',repMin:15,repMax:15,targetRir:4});
 e.sets=[10,7,6].map((reps,i)=>({id:`actual-${i}`,completed:kind!=='empty',reps:kind==='timed'?45:reps,weight:kind==='bodyweight'||kind==='timed'?null:kind==='mixed'?70+i:70,rir:null,...kind==='per-side'?{sides:{left:{reps},right:{reps:reps-1}}}:{}}));
 render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
 const row=document.querySelector('.exercise-preview .exercise-list-row');
 expect(row.querySelector('.navigation-row-end').textContent).toBe(exerciseHistoryPerformanceLabel(e,e.sets)||'Not logged');
 expect(row.querySelector('.navigation-row-end').textContent).not.toContain('15');
 if(kind==='bodyweight')expect(row.textContent).toContain('10 / 7 / 6 reps');
 if(kind==='timed')expect(row.textContent).toContain('45 / 45 / 45 sec');
 if(kind==='per-side')expect(row.textContent).toContain('L 10 · R 9');
});
it('missed detail has one status and the real train-today action without disabled filler',()=>{const s=fixture();s.workouts=[];const detail=vi.fn();render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={detail}/>);expect(document.body.textContent).toContain('missed · not performed');expect(document.body.textContent).not.toContain('WORKOUT NOT LOGGED');act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Train today instead').click());expect(detail).toHaveBeenCalledWith({useWorkoutToday:{sessionId:expect.any(String)}});});
it.each([['2026-09-18','Fri',true],['2026-09-17','Thu',false]])('marks a finished Freestyle as training on %s, independently of the planned workout, including reload', (date,day,planned)=>{
 vi.setSystemTime(new Date(`${date}T18:10:00`));
 let s=deserializeState(serializeState(fixture()));s.workouts=[];s.activeWorkout=null;
 const plan=structuredClone(s.program),scheduled=flexibleSessions(s).find(session=>session.scheduledDate===date);
 expect(Boolean(scheduled)).toBe(planned);
 s=addFreestyleExercise(startFreestyleWorkout(s),'plank');
 s.selectedDate=date;s.selectedDay=day;
 render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
 const dateButton=()=>document.querySelector(`.week-strip button[aria-label^="${day} "]`);
 expect(dateButton().querySelector('.completed-dot')).toBeNull();
 Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,reps:45});
 s=completeWorkout(s);
 for(const next of [s,deserializeState(serializeState(s))]){
  act(()=>root.render(<Today state={next} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>));
  expect(dateButton().querySelector('.completed-dot')).not.toBeNull();
  expect(dateButton().classList.contains('workout-completed')).toBe(true);
  expect(dateButton().getAttribute('aria-label')).toContain('completed workout');
  expect(calendarDayStates(next,[date])[date]).toMatchObject({complete:true,active:false});
  expect(next.program).toEqual(plan);expect(next.workouts).toHaveLength(1);expect(next.workouts[0].source).toBe('freestyle');
  if(scheduled)expect(flexibleSessions(next).find(session=>session.logicalSessionId===scheduled.logicalSessionId).status).not.toBe('completed');
 }
});
