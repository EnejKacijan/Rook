import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Complete, Today} from './App.jsx';
import {CompletedSessionOverview, completedSessionMetrics} from './CompletedSessionOverview.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout, completeWorkout, plannedWorkoutForDate, workoutSetSummary} from './domain.js';

let host, root, setDetail, setPage, update;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  setDetail=vi.fn();setPage=vi.fn();update=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(partial=false){const s=createReturningUserFixture(0);s.selectedDate='2026-10-08';Object.assign(s.profile,{showExerciseImages:false,restTimerEnabled:false});s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.startedAt=Date.now()-72*60000;s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:!partial,weight:30,reps:8})));return completeWorkout(s);}
const render=node=>act(()=>root.render(node));
const button=name=>[...host.querySelectorAll('button')].find(b=>b.textContent===name);
const props=state=>({state,update,setPage,setDetail});

it.each([Complete,Today])('%s shows one completion hero, saved metrics and a route to this workout’s details',Screen=>{
  const state=fixture(),workout=state.workouts.at(-1),before=structuredClone(state);
  render(<Screen {...props(state)}/>);
  const hero=host.querySelector('.completed-session-overview'),summary=hero.querySelector('dl');
  expect(hero.querySelector('.completion-eyebrow').textContent).toBe('WORKOUT COMPLETE');expect(hero.querySelector('h1').textContent).toBe(workout.name);
  expect(host.querySelectorAll('h1')).toHaveLength(1);expect(summary.getAttribute('aria-label')).toBe('Completed session summary');
  expect([...summary.querySelectorAll('dd')].map(n=>n.textContent)).toEqual([String(workout.exercises.length),String(workoutSetSummary(workout).completed),'72 min']);
  expect([...summary.querySelectorAll('dt')].map(n=>n.textContent)).toEqual(['Exercises','Sets','Elapsed']);
  const action=button('VIEW WORKOUT DETAILS'),list=host.querySelector('.complete-session-log,.exercise-preview');
  expect(hero.compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  if(Screen===Today){
    expect(list).toBeNull();expect([...host.querySelectorAll('.eyebrow')].some(n=>n.textContent==='WORKOUT DETAILS')).toBe(false);
  }else{
    expect(action.compareDocumentPosition(list)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.textContent).toContain('WORKOUT DETAILS');expect(list.querySelectorAll('button').length).toBeGreaterThanOrEqual(workout.exercises.length);
  }
  expect(host.textContent).not.toContain('WORKOUT COMPLETE · VIEW HISTORY');
  act(()=>action.click());expect(setDetail).toHaveBeenCalledWith({completedWorkout:workout.id});expect(update).not.toHaveBeenCalled();expect(state).toEqual(before);
});
it('reads the finished record even after the recurring plan changes',()=>{
  const state=fixture(),workout=state.workouts.at(-1);state.program.days.forEach(d=>d.exercises=[]);
  render(<Complete {...props(state)}/>);expect(host.querySelector('.completion-summary dd').textContent).toBe(String(workout.exercises.length));
});
it('Done retains the existing canonical Today destination without changing the completed record',()=>{
  const state=fixture(),workouts=structuredClone(state.workouts);render(<Complete {...props(state)}/>);
  expect(button('VIEW WORKOUT DETAILS').classList.contains('primary')).toBe(true);
  expect(button('DONE').classList.contains('secondary')).toBe(true);
  act(()=>button('DONE').click());expect(setPage).toHaveBeenCalledWith('today');expect(update).not.toHaveBeenCalled();expect(state.workouts).toEqual(workouts);
});
it('Done after a midnight finish uses the existing today/date correction and preserves session facts',()=>{
  const state=fixture();Object.assign(state.workouts.at(-1),{actualPerformedDate:'2026-10-07',workoutDateKey:'2026-10-07',completedAt:'2026-10-07T23:59:00',startedAt:new Date('2026-10-07T22:47:00').getTime()});render(<Complete {...props(state)}/>);
  act(()=>button('DONE').click());expect(setPage).toHaveBeenCalledWith('today');expect(update).toHaveBeenCalledOnce();
  const next=update.mock.calls[0][0](structuredClone(state));expect(next.selectedDate).toBe('2026-10-08');expect(next.workouts).toEqual(state.workouts);
});
it.each([Complete,Today])('%s never calls a zero-set ended session complete',Screen=>{
  render(<Screen {...props(fixture(true))}/>);expect(host.querySelector('.completed-session-overview')).toBeNull();expect(host.textContent).not.toContain('WORKOUT COMPLETE');expect(host.textContent.toLowerCase()).toContain('ended');
});
it('does not turn unknown elapsed time into an estimate or zero duration',()=>{
  const w=fixture().workouts.at(-1);w.durationSeconds=null;render(<CompletedSessionOverview workout={w}/>);
  expect(host.querySelector('dl').textContent).toContain('Not recorded');expect(host.textContent).not.toContain('~');
});
it('uses a plain workout fallback when a legacy record has no name',()=>{
  const workout=fixture().workouts.at(-1);delete workout.name;
  render(<CompletedSessionOverview workout={workout}/>);
  expect(host.querySelector('h1').textContent).toBe('Workout');
  expect(host.querySelector('.completion-eyebrow').textContent).toBe('WORKOUT COMPLETE');
});
it('summary excludes empty and partly logged exercises and only counts recorded completed sets',()=>{
  const w={durationSeconds:0,exercises:[{sets:[]},{sets:[{completed:true},{completed:false}]},{sets:[{completed:true}]}]};
  expect(completedSessionMetrics(w)).toEqual({exercises:1,sets:2,elapsed:'0 min'});
});
it('historical display is static and contains no celebration overlay',()=>{
  render(<Complete {...props(fixture())}/>);expect(host.querySelector('.is-live-completion')).toBeNull();expect(host.querySelector('.completion-badge').getAttribute('aria-hidden')).toBe('true');
  const css=readFileSync('src/completedSessionOverview.css','utf8');expect(css).not.toMatch(/@keyframes|infinite|confetti/i);
  expect(css).toContain('var(--rook-motion-state, 200ms)');expect(css).toContain('1 both');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion: reduce\)\s*\{\s*\.complete-screen \.completion-badge\s*\{\s*animation: none;/);
});
it('the completion surface uses central theme tokens for readable hero, stats and accent',()=>{
  const css=readFileSync('src/completedSessionOverview.css','utf8');expect(css).toContain('var(--rook-text)');expect(css).toContain('var(--rook-secondary)');expect(css).toContain('color: var(--rook-accent-text)');expect(css).toContain('var(--rook-accent)');expect(css).toContain('var(--rook-surface)');expect(css).not.toMatch(/#[\da-f]{3,8}\b/i);
});
