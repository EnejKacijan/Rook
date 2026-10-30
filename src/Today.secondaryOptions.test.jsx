import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today} from './App.jsx';
import {TodayOptionalActivities} from './ConditioningSheet.jsx';
import {coachQualityFixture} from './coachQuality.fixture.js';
import {isoDay,serializeState,startWorkout,startOptionalSession,finishOptionalSession} from './domain.js';

let host,root,detail,update,navigate;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00'));localStorage.clear();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);detail=vi.fn();update=vi.fn();navigate=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const fixture=()=>coachQualityFixture({todayThird:true});
const mount=state=>act(()=>root.render(<Today state={state} update={update} setDetail={detail} setPage={navigate}/>));
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
it('groups the two secondary routes below the exercises while retaining the primary workout action',()=>{
  const state=fixture(),before=serializeState(state);mount(state);const group=host.querySelector('[aria-label="Other training options"]');
  expect([...group.querySelectorAll('button')].map(node=>node.textContent)).toEqual(['Add conditioning','Choose a workout']);
  expect(group.previousElementSibling.classList.contains('exercise-preview')).toBe(true);expect(button('START WORKOUT')).toBeDefined();
  for(const action of group.querySelectorAll('button'))expect(action.querySelector('.rook-navigation-chevron')).not.toBeNull();
  act(()=>button('Add conditioning').click());expect(detail).toHaveBeenLastCalledWith({conditioning:isoDay()});
  act(()=>button('Choose a workout').click());expect(detail).toHaveBeenLastCalledWith('saved-workouts');
  expect(serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
  expect(host.querySelector('.today-optional-activities')).toBeNull();expect(host.textContent).not.toContain('Review missed sessions');
});
it('keeps a completed optional activity visible and still allows adding another when the normal start guard allows it',()=>{
  let state=fixture();state=finishOptionalSession(startOptionalSession(state,{date:isoDay(),kind:'Conditioning',intent:'conditioning',activity:'Rower',format:'steady',duration:20,intensity:'Moderate'},Date.now()-1200000));
  const before=serializeState(state);mount(state);expect(host.querySelectorAll('.optional-session-note')).toHaveLength(1);expect(host.querySelector('.optional-session-note').textContent).toContain('Rower');
  expect(button('Add conditioning')).toBeDefined();act(()=>host.querySelector('.optional-session-note').click());expect(detail).toHaveBeenLastCalledWith({optionalActivity:state.optionalSessions[0].id});expect(serializeState(state)).toBe(before);
});
it.each(['workout','optional'])('does not expose a conditioning start while a %s is already open',kind=>{
  let state=fixture();if(kind==='workout')state.activeWorkout=startWorkout(state,state.program.days.find(day=>day.id==='lower-source'));
  else state=startOptionalSession(state,{date:isoDay(),kind:'Conditioning',intent:'conditioning',activity:'Bike',format:'steady',duration:20,intensity:'Moderate'});
  mount(state);expect(button('Add conditioning')).toBeUndefined();expect(button('+ Conditioning')).toBeUndefined();expect(host.querySelector('.today-optional-actions')).toBeNull();
});
it.each([true,false])('an empty optional-history section reserves no space (historyOnly %s)',historyOnly=>{
  const state=fixture();act(()=>root.render(<TodayOptionalActivities state={state} date="2026-10-30" setDetail={detail} historyOnly={historyOnly}/>));expect(host.innerHTML).toBe('');
});
