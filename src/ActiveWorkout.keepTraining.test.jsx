import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveWorkout } from './App.jsx';
import { workoutSetSummary } from './domain.js';
import { keepTrainingState } from './fixtures/keepTrainingState.js';
import { useAnimationClock } from './testAnimationClock.js';
import { addWorkoutExercise } from './freestyleWorkout.js';

let host, root, current, change, revealed, navigate;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-09-29T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches:false, addEventListener(){}, removeEventListener(){} }));
  vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({top = 0} = {}) { this.scrollTop = top; };
  revealed = [];
  HTMLElement.prototype.scrollIntoView = function(options) {
    revealed.push({id:this.dataset.setId, options, locked:document.body.style.position,
      inert:host.querySelector('[data-active-workout]').inert});
  };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); navigate = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const button = text => [...document.querySelectorAll('button')].find(n => n.textContent.trim() === text);
const click = text => act(() => button(text).click());
function mount(initial) {
  function Harness() {
    const [state, setState] = useState(initial); current = state;
    change = fn => setState(previous => fn(structuredClone(previous)));
    return <ActiveWorkout state={state} update={change} setPage={navigate} setDetail={() => {}}/>;
  }
  act(() => root.render(<Harness/>));
}
function finish() { click('Finish'); advance(300); expect(document.querySelector('.workout-confirm')).not.toBeNull(); }
function keep() { click('KEEP TRAINING'); advance(220); advance(32); }
function expectTarget(before, ei, si) {
  const expected = structuredClone(before); expected.activeWorkout.exerciseIndex = ei;
  expect(current).toEqual(expected); // IDs, rest, dates, values, program and history unchanged.
  expect(revealed.at(-1)).toEqual({id:before.activeWorkout.exercises[ei].sets[si].id,
    options:{block:'center',behavior:'instant'}, locked:'', inert:false});
  expect(document.activeElement?.matches('input,textarea,select')).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  expect(document.querySelector('.workout-confirm')).toBeNull();
}
it('14/15 finished at the final exercise returns to the earlier third set, preserving rest and all state', () => {
  mount(keepTrainingState()); const before = structuredClone(current);
  expect(workoutSetSummary(current.activeWorkout)).toMatchObject({total:15,completed:14});
  finish(); keep(); expectTarget(before, 1, 2);
});
it('returns to set 1 of the first whole skipped exercise, ahead of a later skipped exercise', () => {
  mount(keepTrainingState([[1,0],[1,1],[1,2],[3,0],[3,1],[3,2]]));
  const before = structuredClone(current); finish(); keep(); expectTarget(before,1,0);
});
it('returns to the very first set when the first exercise was left unlogged', () => {
  mount(keepTrainingState([[0,0],[0,1],[0,2],[2,1]]));
  const before = structuredClone(current); finish(); keep(); expectTarget(before,0,0);
});
it('uses canonical exercise/set order, including superset members rather than alternating next-step order', () => {
  const state = keepTrainingState([[1,2],[2,0],[4,1]]);
  for (const i of [1,2]) Object.assign(state.activeWorkout.exercises[i], {supersetId:'pair', supersetOrder:i});
  mount(state); const before = structuredClone(current); finish(); keep(); expectTarget(before,1,2);
});
it('reveals a current-exercise set without unnecessary session state changes', () => {
  mount(keepTrainingState([[4,1]])); const before = structuredClone(current); finish(); keep(); expectTarget(before,4,1);
});
it.each(['bodyweight','per_side','timed','added-set','added-exercise','visited-empty'])('includes unfinished %s work using the Finish completion flag', kind => {
  const state = keepTrainingState(), exercise = state.activeWorkout.exercises[1], set = exercise.sets[2];
  if (kind === 'bodyweight') Object.assign(exercise,{exerciseId:'push-up',loadRequirement:'none'});
  if (kind === 'per_side') { Object.assign(exercise,{exerciseId:'bodyweight-split-squat',loggingMode:'per_side',loadRequirement:'optional'}); set.sides={left:{reps:8},right:{reps:null}}; }
  if (kind === 'timed') { exercise.exerciseId='plank'; set.reps=30; }
  if (kind === 'added-set') Object.assign(set,{added:true,planned:false});
  if (kind === 'added-exercise') exercise.prescriptionSource='freestyle';
  if (kind === 'visited-empty') Object.assign(set,{weight:null,reps:null,touched:false});
  mount(state); const before=structuredClone(current); finish(); keep(); expectTarget(before,1,2);
});
it('finds a real session-added exercise created by the current queue command', () => {
  let state=keepTrainingState([]);
  state=addWorkoutExercise(state,'lateral-raise',{requestId:'keep-training-added',sessionId:state.activeWorkout.id});
  mount(state); const before=structuredClone(current); finish(); keep(); expectTarget(before,5,0);
});
it('completed unusual results stay completed; removed work outside the active collection is not targeted', () => {
  const state=keepTrainingState(); Object.assign(state.activeWorkout.exercises[0].sets[0],{reps:0,weight:null});
  state.activeWorkout.removedUpNextExercises=[{id:'removed',sets:[{completed:false}]}];
  mount(state); const before=structuredClone(current); finish(); keep(); expectTarget(before,1,2);
});
it('recomputes from changed live state at press and on each repeated Finish / Keep Training', () => {
  mount(keepTrainingState([[1,2],[3,1],[4,0]])); finish();
  act(() => change(s => {s.activeWorkout.exercises[1].sets[2].completed=true; return s;}));
  let before=structuredClone(current); keep(); expectTarget(before,3,1);
  act(() => change(s => {s.activeWorkout.exercises[3].sets[1].completed=true; return s;}));
  before=structuredClone(current); finish(); keep(); expectTarget(before,4,0);
});
it('if all work becomes completed while open, only dismisses and does not finish', () => {
  mount(keepTrainingState()); finish();
  act(() => change(s => {s.activeWorkout.exercises[1].sets[2].completed=true; return s;}));
  const before=structuredClone(current); keep(); expect(current).toEqual(before); expect(revealed).toEqual([]);
  expect(navigate).not.toHaveBeenCalled(); expect(document.querySelector('.workout-confirm')).toBeNull();
});
it('summary target exists exactly when Finish finds incomplete work, including unplanned additions', () => {
  for (const unfinished of [[],[[0,0]],[[4,2]],[[1,2],[0,1]]]) {
    const workout=keepTrainingState(unfinished).activeWorkout;
    Object.assign(workout.exercises[0].sets[0],{added:true,planned:false});
    const summary=workoutSetSummary(workout);
    expect(Boolean(summary.firstIncomplete)).toBe(summary.completed<summary.total);
    if (summary.firstIncomplete) {
      const [ei,si]=unfinished.toSorted(([a,b],[c,d])=>a-c||b-d)[0];
      expect(summary.firstIncomplete).toMatchObject({exerciseIndex:ei,setIndex:si});
    }
  }
});
