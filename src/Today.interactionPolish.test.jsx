import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Today, Profile, CompletedWorkoutDetail, Coach } from './App.jsx';
import { blankState, weekday } from './domain.js';
import { createTrainingReviewState } from './fixtures/trainingReviewState.js';
import { calendarStatusFixture, calendarStatusDate } from './calendarStatus.fixture.js';
import { flexibleOccurrenceForDate, proposeFlexibleWeek, applyFlexibleWeek } from './flexibleWeek.js';

let host,root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollIntoView=()=>{};
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const draw = element => act(()=>root.render(element));
const renderToday = (state,update=vi.fn()) => draw(<Today state={state} update={update} setDetail={()=>{}} setPage={()=>{}}/>);
function pointer(node,type) {
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:30});
  act(()=>node.dispatchEvent(event));
}
it('calendar-selected missed metadata has one status and preserves canonical classification',()=>{
  const state=calendarStatusFixture(); const before=JSON.stringify(state);
  renderToday(state);
  expect(host.querySelector('.today-hero p').textContent).toContain('Missed');
  expect(host.querySelector('.today-hero').textContent).not.toMatch(/not performed/i);
  expect(flexibleOccurrenceForDate(state,calendarStatusDate).status).toBe('missed');
  expect(JSON.stringify(state)).toBe(before);
});
it('intentionally skipped occurrence stays Skipped and separate from Missed',()=>{
  const initial=calendarStatusFixture();const occurrence=flexibleOccurrenceForDate(initial,calendarStatusDate);
  const result=applyFlexibleWeek(initial,proposeFlexibleWeek(initial,{mode:'skip',sessionId:occurrence.logicalSessionId}));
  expect(result.status).toBe('applied');renderToday(result.state);
  expect(host.querySelector('.today-hero p').textContent).toBe('Skipped');
  expect(flexibleOccurrenceForDate(result.state,calendarStatusDate).status).toBe('skipped');
});
it('moved source displays its destination and keeps original scheduling provenance',()=>{
  vi.setSystemTime(new Date(`${calendarStatusDate}T12:00:00`));
  const state=calendarStatusFixture('moved'),before=JSON.stringify(state);renderToday(state);
  expect(host.querySelector('.today-moved-provenance').textContent).toContain('Moved to Tuesday, Sep 22');
  expect(JSON.stringify(state)).toBe(before);
});
it('completed and ended-early details use the same taxonomy while notes remain editable',()=>{
  vi.setSystemTime(new Date(`${calendarStatusDate}T12:00:00`));
  const state=calendarStatusFixture('completed'),workout=state.workouts[0];
  draw(<CompletedWorkoutDetail workoutId={workout.id} state={state} update={()=>{}} close={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
  expect(host.querySelector('.workout-status').textContent).toBe('Completed');
  const note=host.querySelector('textarea[aria-label="Session note"]');
  expect(note.disabled).toBe(false);expect(note.readOnly).toBe(false);
  note.value='Useful training note';note.setSelectionRange(0,6);expect(note.value.slice(note.selectionStart,note.selectionEnd)).toBe('Useful');
  workout.endedEarly=true;workout.status='ended-early';
  draw(<CompletedWorkoutDetail workoutId={workout.id} state={state} update={()=>{}} close={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>);
  expect(host.querySelector('.workout-status').textContent).toBe('Ended early');
});
it('Up Next acknowledges immediately, clears on release/cancel and navigates once per tap',()=>{
  const state=createTrainingReviewState(blankState()),before=JSON.stringify(state),update=vi.fn();renderToday(state,update);
  const row=host.querySelector('.rest-up-next-row');expect(row.tagName).toBe('BUTTON');expect(row.classList.contains('rook-ui')).toBe(true);
  vi.spyOn(row,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:310,bottom:150});
  for(let i=0;i<3;i++){
    pointer(row,'pointerdown');expect(row.hasAttribute('data-row-pressed')).toBe(true);
    pointer(row,'pointercancel');expect(row.hasAttribute('data-row-pressed')).toBe(false);
    pointer(row,'pointerdown');pointer(row,'pointerup');act(()=>row.click());
    expect(row.hasAttribute('data-row-pressed')).toBe(false);
  }
  expect(update).toHaveBeenCalledTimes(3);expect(JSON.stringify(state)).toBe(before);
});
it('Today optional rows, Rest Day actions and Profile navigation use the shared primitive',()=>{
  const state=createTrainingReviewState(blankState());
  state.optionalSessions=[{id:'walking',date:state.selectedDate,status:'completed',kind:'Cardio',activity:'Walking',intensity:'Easy',elapsedSeconds:65}];
  renderToday(state);
  for(const selector of ['.rest-day-action','.optional-session-note']) expect(host.querySelector(selector).classList.contains('rook-ui')).toBe(true);
  draw(<Profile state={state} update={()=>{}} setDetail={()=>{}} setPage={()=>{}}/>);
  expect(host.querySelector('[data-profile-area="preferences"]').classList.contains('exercise-row-feedback')).toBe(true);
});
it('Coach retains its explicit Copy action and copies the response text',async()=>{
  const state=createTrainingReviewState(blankState());state.activeCoachConversationId='copy-test';
  state.coachConversationMeta={'copy-test':{id:'copy-test',createdAt:Date.now(),lastActivityAt:Date.now(),localDateStarted:'2026-10-04'}};
  state.conversations=[{id:'message',conversationId:'copy-test',createdAt:Date.now(),user:'How should I train?',reply:{text:'Keep your planned session. Rest between sets.'}}];
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  draw(<Coach state={state} update={()=>{}} setPage={()=>{}} setDetail={()=>{}} availability={{state:'ready'}}/>);
  const response=host.querySelector('.coach-message p');expect(response.textContent).toContain('Keep your planned session.');
  const copy=host.querySelector('[aria-label="Copy Coach response"]');expect(copy).not.toBeNull();
  await act(async()=>{copy.click();await Promise.resolve();});
  expect(writeText).toHaveBeenCalledWith('Keep your planned session. Rest between sets.');
});
