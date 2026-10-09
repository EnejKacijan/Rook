import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {Today, Detail, ModalLayer, BottomNav} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';

let host, root, state, target, route, update, setPage, persist;
const button = name => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === name);
const click = node => act(() => node.click());
const settle = () => {act(() => vi.advanceTimersByTime(300));act(() => vi.advanceTimersByTime(40));};
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({matches:true, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{width:100,height:44}]);
  state = createReturningUserFixture(0);
  Object.assign(state.profile, {showExerciseImages:false, restTimerEnabled:false});
  state.selectedDate = '2026-10-08';
  state.activeWorkout = domain.startWorkout(state, domain.plannedWorkoutForDate(state, state.selectedDate));
  state.activeWorkout.startedAt = Date.now() - 3474 * 1000;
  state.activeWorkout.exercises.forEach((exercise, i) => {
    exercise.sets = exercise.sets.slice(0, [3,2,2,1,2,2,2,2][i]);
    exercise.sets.forEach(set => Object.assign(set, {completed:true,weight:30,reps:8}));
  });
  state = domain.completeWorkout(state);target = state.workouts.at(-1);
  target.sessionNote = 'Keep this exact session note';target.sessionFeedback = 'as-planned';
  const other = structuredClone(target);
  Object.assign(other, {id:'other-same-name',logicalSessionId:'other-session',programDayId:'other-day',originalScheduledDate:'2026-10-07',canonicalPlanDate:'2026-10-07',workoutDateKey:'2026-10-07',startedAt:new Date('2026-10-07T11:02:06').getTime(),completedAt:'2026-10-07T12:00:00'});
  state.workouts.unshift(other);
  update = vi.fn();setPage = vi.fn();persist = vi.spyOn(domain, 'saveState').mockReturnValue(true);
  host = document.createElement('div');document.body.append(host);root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());host.remove();localStorage.clear();
  vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
});
function mount() {
  function Harness() {
    const [selection, setSelection] = useState(null), background = useRef(null);
    route = selection;
    return <><div ref={background}>
      <Today state={state} update={update} setPage={setPage} setDetail={setSelection}/>
      <BottomNav page="today" setPage={setPage}/>
    </div>{selection && <ModalLayer backgroundRef={background} close={() => setSelection(null)}>
      {close => <Detail detail={selection} state={state} update={update} close={close} setDetail={setSelection} setPage={setPage}/>}
    </ModalLayer>}</>;
  }
  act(() => root.render(<Harness/>));settle();
}
it('completed Today ends session-specific content at its details action, retaining summary and navigation', () => {
  mount();const today = document.querySelector('.today-screen');
  expect(today.querySelector('h1').textContent).toBe(target.name);
  expect([...today.querySelectorAll('.completion-summary dt')].map(n=>n.textContent)).toEqual(['Exercises','Sets','Elapsed']);
  expect([...today.querySelectorAll('.completion-summary dd')].map(n => n.textContent)).toEqual(['8','16','58 min']);
  expect(today.querySelector('.exercise-preview,.complete-session-log,textarea,.workout-photo-memory')).toBeNull();
  expect(button('VIEW WORKOUT DETAILS')).toBeTruthy();expect(button('VIEW WORKOUT HISTORY')).toBeUndefined();
  expect(button('DONE')).toBeUndefined();expect(button('BACK TO TODAY')).toBeUndefined();
  expect(button('TODAY')).toBeTruthy();expect(button('COACH')).toBeTruthy();
});
it.each(['close','escape','backdrop','handle'])('%s returns to the same date, root DOM, scroll and facts without reopening/completing a workout', method => {
  const before = domain.serializeState(state);mount();
  const today = document.querySelector('.today-screen'), trigger = button('VIEW WORKOUT DETAILS');
  today.scrollTop = 97;act(() => trigger.focus());click(trigger);settle();
  expect(route).toEqual({completedWorkout:target.id});
  const detail = document.querySelector('.completed-workout-detail');
  expect(detail.querySelector('.detail-header').textContent).toContain('Workout details');
  expect(detail.querySelector('h1').textContent).toBe(target.name);
  expect(detail.querySelector('textarea').value).toBe(target.sessionNote);
  expect(detail.textContent).toContain('WORKOUT PHOTO');expect(detail.textContent).toContain('SESSION LOG');
  expect(detail.querySelectorAll('.session-log-trigger')).toHaveLength(8);
  expect(detail.querySelectorAll('.session-log-set')).toHaveLength(16);
  for(const item of detail.querySelectorAll('.session-log-item')) {
    click(item.querySelector('button'));expect(item.querySelector('button').getAttribute('aria-expanded')).toBe('true');
    expect(item.querySelector('.session-log-details').textContent).toContain('30');
    expect(item.querySelector('.session-log-details').textContent).toContain('8');
  }
  if(method === 'escape')act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})));
  else if(method === 'backdrop')click(document.querySelector('.modal-layer'));
  else click(document.querySelector(method === 'close' ? '[aria-label="Close workout details"]' : '.modal-drag-handle'));
  settle();expect(route).toBeNull();expect(document.querySelector('.completed-workout-detail')).toBeNull();
  expect(document.querySelector('.today-screen')).toBe(today);expect(today.scrollTop).toBe(97);
  expect(document.querySelector('.week-strip [aria-pressed="true"]').getAttribute('aria-label')).toContain('Thu 8');
  expect(document.activeElement).toBe(trigger);
  expect(domain.serializeState(state)).toBe(before);expect(state.activeWorkout).toBeNull();
  expect(update).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();expect(setPage).not.toHaveBeenCalled();
});
it('keeps the week link on its existing canonical training-block route', () => {
  mount();const before = domain.serializeState(state), today = document.querySelector('.today-screen');
  click(today.querySelector('[aria-label="View training block"]'));settle();
  expect(route).toBe('training-block');expect(document.querySelector('.modal-layer').textContent).toContain('CURRENT BLOCK');
  click(document.querySelector('.modal-layer .detail-header-close'));settle();
  expect(route).toBeNull();expect(document.querySelector('.today-screen')).toBe(today);
  expect(domain.serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();
});
it('keeps Conditioning as a quiet optional action opening the existing setup without changing history',()=>{
  mount();const today=document.querySelector('.today-screen'),action=button('+ Conditioning'),before=domain.serializeState(state);
  expect(action.classList.contains('text-button')).toBe(true);expect(action.classList.contains('primary')).toBe(false);
  expect(today.querySelector('.completion-actions').compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(today.querySelector('.today-optional-activities .eyebrow')).toBeNull();
  click(action);settle();expect(route).toEqual({conditioning:state.selectedDate});
  expect(document.querySelector('.conditioning-sheet')).toBeTruthy();expect(button('START SESSION').disabled).toBe(false);
  click(document.querySelector('.conditioning-sheet .detail-header-close'));settle();
  expect(route).toBeNull();expect(document.querySelector('.today-screen')).toBe(today);
  expect(domain.serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();
});
