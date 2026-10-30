import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {Today} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {deserializeState,serializeState,startWorkout,completeWorkout} from './domain.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';

let root,host,detail,update,navigate;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
  HTMLElement.prototype.scrollTo=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);
  detail=vi.fn();update=vi.fn();navigate=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(kind='other'){
  let state=createReturningUserFixture(1);state.profile.showExerciseImages=false;
  state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';
  state.program.days[0].name='Upper B';state.program.days[0].workoutName='Upper B';state.program.days[0].nameEdited=true;
  state=deserializeState(serializeState(state),{strict:true});
  const source=flexibleSessions(state).find(row=>row.workoutId===state.program.days[0].id&&row.originalDate==='2026-10-26');
  const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-30'});expect(proposal.status).toBe('ready');state=applyFlexibleWeek(state,proposal).state;
  if(kind!=='none'){
    state.activeWorkout=startWorkout(state,flexibleSessions(state).find(row=>row.scheduledDate==='2026-10-29').workout);state.activeWorkout.name='Functional day';
    state.activeWorkout.startedAt=Date.now()-(kind==='yesterday'?30:6)*3600000;state.activeWorkout.lastMeaningfulWorkoutActivityAt=Date.now()-(kind==='yesterday'?28:4)*3600000;
    if(kind==='yesterday'){state.activeWorkout.workoutDateKey='2026-10-28';state.activeWorkout.canonicalPlanDate='2026-10-28';}
    const sets=state.activeWorkout.exercises.flatMap(exercise=>exercise.sets);sets.forEach((set,index)=>Object.assign(set,{weight:20,reps:8,completed:index<sets.length-1}));
  }
  state.selectedDate=kind==='same'?'2026-10-29':'2026-10-30';state.selectedDay=kind==='same'?'Thu':'Fri';return state;
}
function mount(state){act(()=>root.render(<Today state={state} update={update} setDetail={detail} setPage={navigate}/>));}
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
it('keeps the selected workout, active-session reason, move/block routes and previous values without repeated list context',()=>{
  const state=fixture(),before=serializeState(state);mount(state);
  expect(host.querySelector('h1').textContent).toBe('Upper B');expect(host.querySelector('.active-workout-notice').textContent).toContain('Started Oct 29');
  expect(host.querySelector('.active-workout-start-lock').textContent).toBe('Finish Functional day to start this workout.');
  expect(host.querySelector('.today-hero').textContent).not.toContain('last done');expect(host.querySelector('.today-exercise-edit-header')).toBeNull();
  expect(host.querySelector('section[aria-label="Workout exercises"] .exercise-list-row')).not.toBeNull();expect(host.querySelector('.exercise-preview').textContent).toContain('Last:');
  act(()=>button('View change').click());expect(detail.mock.calls.at(-1)[0]).toEqual({flexibleWeek:{reviewExisting:true,focusSessionId:expect.any(String)}});
  act(()=>host.querySelector('[aria-label="View training block"]').click());expect(detail.mock.calls.at(-1)[0]).toBe('training-block');
  expect(host.querySelector('.today-start-button')).toBeNull();expect(serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();
});
it('labels an older open session with its start date and keeps the selected date separate',()=>{
  mount(fixture('yesterday'));expect(host.querySelector('.active-workout-notice').textContent).toContain('Started Oct 28');
  expect(host.querySelector('.today-day-header').textContent).toContain('Friday, Oct 30');expect(host.querySelector('[aria-label="Review Functional day session"]')).not.toBeNull();
});
it('uses one resume action and no other-session warning when the active workout itself is selected',()=>{
  mount(fixture('same'));expect(host.querySelector('.active-workout-notice,.active-workout-start-lock')).toBeNull();expect(button('RESUME WORKOUT')).toBeDefined();
  expect(host.querySelector('.exercise-preview[aria-label="Workout exercises"]')).not.toBeNull();expect(host.querySelector('.today-exercise-list-heading')).toBeNull();
});
it('keeps the existing start action on a plan without an active workout',()=>{
  const state=fixture('none'),before=serializeState(state);mount(state);expect(host.querySelector('.active-workout-notice,.active-workout-start-lock')).toBeNull();expect(button('START TODAY')).toBeDefined();
  expect(button('Train today instead')).toBeUndefined();act(()=>button('Move to today').click());expect(detail.mock.calls.at(-1)[0]).toEqual({useWorkoutToday:{sessionId:expect.any(String)}});
  expect(serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
});
it('does not show a start lock or unfinished-session warning for a completed workout',()=>{
  vi.setSystemTime(new Date('2026-10-30T12:00:00'));
  let state=fixture('none');const source=flexibleSessions(state).find(row=>row.scheduledDate==='2026-10-30');state.activeWorkout=startWorkout(state,source.workout);
  state.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{weight:20,reps:8,completed:true})));state=completeWorkout(state);state.selectedDate='2026-10-30';mount(state);
  expect(host.querySelector('.active-workout-start-lock')).toBeNull();expect(button('VIEW WORKOUT DETAILS')).toBeDefined();
});
