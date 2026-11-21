import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Today} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout, completeWorkout, plannedWorkoutForDate, startOptionalSession, finishOptionalSession} from './domain.js';
import {startFreestyleWorkout, addFreestyleExercise} from './freestyleWorkout.js';

let host, root, setDetail;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);setDetail=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});

function planned({early=false}={}){
  let s=createReturningUserFixture(0);s.selectedDate='2026-10-08';Object.assign(s.profile,{showExerciseImages:false,restTimerEnabled:false});
  s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.startedAt=Date.now()-60*60000;
  s.activeWorkout.exercises.forEach((e,i)=>e.sets.forEach(set=>Object.assign(set,{completed:!early||i===0,weight:30,reps:8})));
  if(early)s.activeWorkout.endedEarly=true;
  return completeWorkout(s);
}
function freestyle(s,minutes){vi.advanceTimersByTime(minutes*60000);s=addFreestyleExercise(startFreestyleWorkout(s),'push-up');Object.assign(s.activeWorkout.exercises[0].sets[0],{reps:12,completed:true});return completeWorkout(s);}
const conditioning=(s,minutes)=>{vi.advanceTimersByTime(minutes*60000);return finishOptionalSession(startOptionalSession(s,{kind:'Conditioning',intent:'conditioning',activity:'Rower',format:'steady',duration:20,intensity:'Moderate'},Date.now()-20*60000));};
const render=state=>act(()=>root.render(<Today state={state} update={()=>{}} setPage={()=>{}} setDetail={setDetail}/>));

it('a single finished workout shows only the completion hero',()=>{
  render(planned());
  expect(host.querySelector('.completed-session-overview')).not.toBeNull();
  expect(host.querySelector('.today-done-extras')).toBeNull();
  expect(host.querySelector('.today-completed-workouts')).toBeNull();
  expect(host.querySelector('.optional-session-history')).toBeNull();
});

it('extra workouts and conditioning share one list under the hero, newest first',()=>{
  let s=planned();s=freestyle(s,30);s=conditioning(s,30);s=freestyle(s,30);s.workouts.at(-1).name='Evening arms';
  render(s);
  const extras=host.querySelector('.today-done-extras');
  expect(host.querySelector('.completed-session-overview').compareDocumentPosition(extras)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(extras.querySelector('.eyebrow').textContent).toBe('Also today · 3');
  const rows=[...extras.querySelectorAll('.today-done-extra')];
  expect(rows.map(row=>row.querySelector('strong').textContent)).toEqual(['Evening arms','Rower','Freestyle workout']);
  expect(rows[0].querySelector('small').textContent).toMatch(/^Freestyle · \d+ min · 1 set$/);
  expect(rows[1].querySelector('small').textContent).toBe('Conditioning · 20 min · Moderate');
  // The hero workout is never listed twice, and the old split lists are gone.
  expect(rows.some(row=>row.dataset.workoutId===s.workouts.find(w=>w.source!=='freestyle'&&w.completedAt.startsWith('2026-10-08'))?.id)).toBe(false);
  expect(host.querySelector('.today-completed-workouts')).toBeNull();
  expect(host.querySelector('.optional-session-history')).toBeNull();
  act(()=>rows[0].click());expect(setDetail).toHaveBeenLastCalledWith({completedWorkout:rows[0].dataset.workoutId});
  act(()=>rows[1].click());expect(setDetail).toHaveBeenLastCalledWith({optionalActivity:s.optionalSessions[0].id});
});

it('one extra item drops the count',()=>{
  render(conditioning(planned(),30));
  expect(host.querySelector('.today-done-extras .eyebrow').textContent).toBe('Also today');
  expect(host.querySelectorAll('.today-done-extra')).toHaveLength(1);
});

it('an early finish says how much was done and does not repeat empty rows',()=>{
  const s=planned({early:true}),workout=s.workouts.at(-1);
  render(s);
  expect(host.querySelector('.today-hero').textContent).toContain(`1 of ${workout.exercises.length} exercises`);
  expect(host.querySelector('.exercise-preview .eyebrow').textContent).toBe('EXERCISES');
  expect(host.querySelector('.exercise-preview').textContent).not.toContain('Not logged');
  expect(host.querySelector('.exercise-preview').textContent).toContain('No sets logged');
});
