import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {missedFlexibleSessions,flexibleSessions} from './flexibleWeek.js';
import {serializeState} from './domain.js';

let root,host;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const Header=({onBack,onClose})=><header>{onBack&&<button aria-label="Back" className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===label||node.getAttribute('aria-label')===label);
const click=label=>act(()=>button(label).click());
function mount(state,request={missed:true},update=vi.fn(),close=vi.fn()){
  act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} request={request} update={update} close={close}/>));return {update,close};
}
function thirdWorkout(state,weekday='Sat'){
  state.profile.daysPerWeek=3;state.profile.availableDays=['Mon','Wed',weekday];
  const day={...structuredClone(state.program.days[1]),id:'third-source',weekday,name:'Lower'};day.exercises=day.exercises.slice(0,3).map((exercise,index)=>({...exercise,id:`third-${index}`,exerciseId:['leg-press','seated-leg-curl','standing-calf-raise-machine'][index],sets:exercise.sets.slice(0,3).map((set,i)=>({...set,id:`third-${index}-${i}`}))}));state.program.days.push(day);return state;
}
it('offers the exact two missed workouts in the missed list, prepares locally and persists only on Use',()=>{
  const state=combineExample(),before=serializeState(state),{update,close}=mount(state);
  click('Combine these workouts');expect(host.querySelectorAll('input:checked')).toHaveLength(2);
  expect(host.querySelector('select').value).toBe('60');click('PREVIEW WORKOUT');
  expect(host.textContent).toContain('Your combined workout');expect(host.querySelector('.combine-card')).not.toBeNull();
  expect(host.textContent).toContain('Full workout');expect(update).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBeNull();
  click('USE THIS WORKOUT');expect(update).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][1].persistedState.todayAdaptation.sourceSessions.map(source=>source.logicalSessionId)).toEqual(missedFlexibleSessions(state).map(source=>source.logicalSessionId));
  expect(serializeState(state)).toBe(before);
});
it('individual recovery exposes Combine, and Back restores the selected recovery and trigger focus',()=>{
  const state=combineExample(),source=missedFlexibleSessions(state)[1];mount(state,{sessionId:source.logicalSessionId});
  click('Combine these workouts');expect(host.querySelectorAll('input:checked')).toHaveLength(2);click('Back');
  expect(host.querySelector('h1').textContent).toBe(source.workout.name);expect(document.activeElement).toBe(button('Combine these workouts'));
});
it.each([3,6])('%i missed workouts require an explicit pair and enforce the two-source selection limit',count=>{
  vi.setSystemTime(new Date('2026-09-13T12:00:00'));
  const state=combineExample(),templates=state.program.days,days=['Mon','Tue','Wed','Thu','Fri','Sat'].slice(0,count);
  state.program.days=days.map((weekday,index)=>({...structuredClone(templates[index%2]),id:`missed-source-${index}`,weekday,name:`Workout ${index+1}`}));
  state.profile.daysPerWeek=count;state.profile.availableDays=days;mount(state);click('Combine two workouts');
  expect(host.querySelectorAll('input:checked')).toHaveLength(0);expect(button('PREVIEW WORKOUT').disabled).toBe(true);
  const inputs=[...host.querySelectorAll('.missed-combine-sources > section input')];expect(inputs).toHaveLength(count);act(()=>inputs[0].click());act(()=>inputs.at(-1).click());
  expect(inputs.slice(1,-1).every(input=>input.disabled)).toBe(true);expect(button('PREVIEW WORKOUT').disabled).toBe(false);
  act(()=>inputs[0].click());expect(inputs.every(input=>!input.disabled)).toBe(true);expect(button('PREVIEW WORKOUT').disabled).toBe(true);
});
it('one missed workout offers a combination with an upcoming workout without inventing a second missed source',()=>{
  vi.setSystemTime(new Date('2026-09-08T12:00:00'));const state=combineExample(),source=missedFlexibleSessions(state)[0];
  mount(state,{sessionId:source.logicalSessionId});click('Combine two workouts');expect(host.querySelectorAll('input:checked')).toHaveLength(1);
  expect(host.textContent).toContain('Upcoming');expect(button('PREVIEW WORKOUT').disabled).toBe(true);
});
it('asks for a future date for a third workout, shows that move in the preview, and saves once',()=>{
  const state=thirdWorkout(combineExample()),{update,close}=mount(state);click('Combine these workouts');click('PREVIEW WORKOUT');
  expect(host.querySelector('h1').textContent).toBe('Make room for today');expect(host.textContent).toContain('Lower');expect(update).not.toHaveBeenCalled();
  act(()=>host.querySelector('[data-combine-move-date="2026-09-13"]').click());expect(host.querySelector('.missed-combine-move').textContent).toContain('Also move Lower');expect(host.querySelector('.missed-combine-move').textContent).toContain('Sat, Sep 12 → Sun, Sep 13');
  expect(update).not.toHaveBeenCalled();click('SAVE BOTH CHANGES');expect(update,host.textContent).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
});
it('canceling date selection and preview abandons every pending change',()=>{
  const state=thirdWorkout(combineExample()),before=serializeState(state),{update}=mount(state);click('Combine these workouts');click('PREVIEW WORKOUT');click('CANCEL');
  expect(host.textContent).toContain('Choose a missed session');expect(update).not.toHaveBeenCalled();expect(serializeState(state)).toBe(before);expect(localStorage.getItem('lift-v2-state')).toBeNull();
});
it('a failed save stays in the preview and allows retry without applying the staged move first',()=>{
  const state=thirdWorkout(combineExample()),{update}=mount(state);click('Combine these workouts');click('PREVIEW WORKOUT');act(()=>host.querySelector('[data-combine-move-date="2026-09-13"]').click());
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});click('SAVE BOTH CHANGES');expect(update).not.toHaveBeenCalled();expect(host.textContent).toContain('Could not save');
  write.mockRestore();click('SAVE BOTH CHANGES');expect(update).toHaveBeenCalledOnce();
});
it('a changed live plan blocks stale Apply and offers a fresh review',()=>{
  const state=combineExample(),update=vi.fn();mount(state,{missed:true},update);click('Combine these workouts');click('PREVIEW WORKOUT');
  const changed=structuredClone(state);changed.program.version=(changed.program.version||0)+1;mount(changed,{missed:true},update);
  expect(button('USE THIS WORKOUT')).toBeUndefined();expect(host.textContent).toContain('Your workouts changed');click('CHOOSE WORKOUTS AGAIN');
  expect(button('PREVIEW WORKOUT')).toBeDefined();expect(update).not.toHaveBeenCalled();
});
it('an externally completed selected source no longer counts toward the selection limit',()=>{
  const state=combineExample();mount(state);click('Combine these workouts');
  const changed=structuredClone(state);changed.workouts.push({id:'external',logicalSessionId:missedFlexibleSessions(state)[0].logicalSessionId,completedAt:Date.now(),exercises:[]});mount(changed);
  expect(host.querySelectorAll('input:checked')).toHaveLength(1);expect(button('PREVIEW WORKOUT').disabled).toBe(true);
  const available=[...host.querySelectorAll('input')].find(input=>!input.checked);expect(available.disabled).toBe(false);
});
it('the Move picker also exposes a swap with a past uncompleted workout and saves both sides together',()=>{
  const state=combineExample(),upcoming=flexibleSessions(state).find(source=>source.scheduledDate==='2026-09-14'),missed=missedFlexibleSessions(state)[1];
  const {update}=mount(state,{sessionId:upcoming.logicalSessionId,destination:true});click('Swap with another workout');
  const row=host.querySelector(`[data-session-id="${missed.logicalSessionId}"]`);expect(row.textContent).toContain('Missed · Wed, Sep 9');act(()=>row.click());
  expect(update).not.toHaveBeenCalled();click('SWAP WORKOUTS');expect(update).toHaveBeenCalledOnce();const next=update.mock.calls[0][1].persistedState;
  expect(flexibleSessions(next).find(source=>source.logicalSessionId===upcoming.logicalSessionId).scheduledDate).toBe('2026-09-09');
  expect(flexibleSessions(next).find(source=>source.logicalSessionId===missed.logicalSessionId).scheduledDate).toBe('2026-09-14');expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
});
it('keeps the accepted preview stable while the parent sheet finishes closing',()=>{
  const initial=combineExample(),source=missedFlexibleSessions(initial)[0];
  function Owner(){const[state,setState]=useState(initial);return <FlexibleWeekSheet state={state} Header={Header} request={{sessionId:source.logicalSessionId}} update={setState} close={()=>{}}/>;}
  act(()=>root.render(<Owner/>));click('Combine these workouts');click('PREVIEW WORKOUT');click('USE THIS WORKOUT');
  expect(host.textContent).toContain('Your combined workout');expect(host.textContent).not.toContain('Your workouts changed');expect(button('Review current schedule')).toBeUndefined();
});
