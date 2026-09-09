import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FlexibleWeekSheet, missedSessionDestinations } from './FlexibleWeekSheet.jsx';
import { blankState, buildProgram, startWorkout } from './domain.js';
import { missedFlexibleSessions, flexibleSessions, proposeFlexibleWeek } from './flexibleWeek.js';
let root;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.useRealTimers();});
function fixture(start='2026-09-06') {const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate=start;return s;}
const Header=({onBack})=>onBack?<button onClick={onBack}>Back</button>:null;
function render(state,request={},update=()=>{},close=()=>{}){if(!root){const host=document.createElement('div');document.body.append(host);root=createRoot(host);}act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} update={update} close={close} request={request}/>));}
const missed=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('I missed a workout'));
it('disabled missed action cannot open an empty flow and updates when eligible work appears',()=>{
  render(fixture());expect(missed().disabled).toBe(true);expect(missed().textContent).toContain('No missed workouts to move.');act(()=>missed().click());expect(document.querySelector('h1').textContent).toBe('What changed?');
  render(fixture('2026-08-31'));expect(missed().disabled).toBe(false);act(()=>missed().click());expect(document.querySelector('h1').textContent).toBe('Choose a missed session');
});
it('retains a defensive empty state when eligible work disappears after navigation',()=>{
  render(fixture('2026-08-31'));act(()=>missed().click());render(fixture());expect(document.body.textContent).toContain('No unstarted sessions need moving.');expect(document.querySelectorAll('.adjust-option-list .choice-row').length).toBe(0);
});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
it('offers today only when empty and renders only authoritative valid destinations',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,before=JSON.stringify(state);
 const valid=missedSessionDestinations(state,id);
 expect(valid).toContain('2026-09-06');for(const toDate of valid)expect(proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate}).status).toBe('ready');
 render(state,{sessionId:id});expect(button('Move to today')).toBeDefined();
 expect([...document.querySelectorAll('[data-move-date]')].map(e=>e.dataset.moveDate).sort()).toEqual(valid.sort());
 expect(document.querySelectorAll('.flexible-week-dates button:disabled')).toHaveLength(0);
 act(()=>button('Move to today').click());expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect(JSON.stringify(state)).toBe(before);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toMatch(/^Move /);expect(JSON.stringify(state)).toBe(before);
});
it.each(['planned','active','completed'])('excludes today occupied by a %s workout without displacing it',status=>{
 vi.setSystemTime(new Date('2026-09-07T12:00:00'));const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId;
 const today=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-07');
 if(status!=='planned'){state.selectedDate='2026-09-07';state.activeWorkout=startWorkout(state,today.workout);if(status==='completed'){state.workouts=[{...state.activeWorkout,completedAt:Date.now()}];state.activeWorkout=null;}}
 const before=JSON.stringify(state);expect(missedSessionDestinations(state,id)).not.toContain('2026-09-07');render(state,{sessionId:id});expect(button('Move to today')).toBeUndefined();expect(document.body.textContent).toContain(`Today already has ${today.workout.name}`);expect(JSON.stringify(state)).toBe(before);
});
it('commits a reviewed move once, preserving plan/history and resolving that missed identity',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn(),close=vi.fn();render(state,{sessionId:id},update,close);
 act(()=>document.querySelector('[data-move-date]').click());expect(update).not.toHaveBeenCalled();
 act(()=>{button('USE THIS SCHEDULE').click();button('USE THIS SCHEDULE').click();});expect(update).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
 const next=update.mock.calls[0][0]();expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);expect(missedFlexibleSessions(next).some(s=>s.logicalSessionId===id)).toBe(false);
});
it('Back pops review to destination to picker to root without applying changes',()=>{
 const state=fixture(),before=JSON.stringify(state);render(state);
 act(()=>button('Move a workout').click());act(()=>document.querySelector('.flexible-workout-list button').click());
 const title=document.querySelector('h1').textContent;
 act(()=>document.querySelector('.flexible-week-dates button:not([disabled])').click());expect(document.querySelector('h1').textContent).toBe('Review your schedule');
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe(title);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('Choose a workout');
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('What changed?');expect(button('Back')).toBeUndefined();expect(JSON.stringify(state)).toBe(before);
});
for(const date of ['2026-09-07','2026-09-09','2026-09-06']) it(`initial window has exactly seven local dates on ${date}`,()=>{
  vi.setSystemTime(new Date(`${date}T12:00:00`));render(fixture());act(()=>button('My available days changed').click());
  const dates=[...document.querySelectorAll('.flexible-week-dates button')];expect(dates).toHaveLength(7);expect(dates.filter(b=>b.getAttribute('aria-pressed')==='true')).toHaveLength(3);
  expect(button('REVIEW SCHEDULE').disabled).toBe(true);
  expect(dates[0].getAttribute('aria-label')).toBe(new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`)));
  expect(button('SHOW MORE DATES')).toBeUndefined();
});
it('expands only after conflict and reviews only explicitly selected next-week dates',()=>{
  const state=fixture(),original=JSON.stringify(state.profile);render(state);act(()=>button('My available days changed').click());
  act(()=>document.querySelector('.flexible-week-dates button[aria-pressed="true"]').click());
  act(()=>button('REVIEW SCHEDULE').click());expect(document.querySelector('[role="status"]').textContent).toContain('3 sessions remain');
  expect(button('Choose a session to skip')).toBeUndefined();expect(button('DONE')).toBeUndefined();expect(button('CANCEL')).toBeDefined();
  act(()=>button('SHOW MORE DATES').click());expect(document.querySelectorAll('.flexible-week-dates button')).toHaveLength(14);
  // Include four explicitly selected second-window dates for all six occurrences.
  for(const index of [7,8,10,12]) act(()=>document.querySelectorAll('.flexible-week-dates button')[index].click());
  act(()=>button('REVIEW SCHEDULE').click());expect(document.querySelector('h1').textContent).toBe('Review your schedule');
  const text=document.querySelector('.flexible-week-review').textContent;expect(text).toContain('Sun, Sep 13');expect(document.querySelectorAll('.flexible-week-review article')).toHaveLength(6);
  expect(JSON.stringify(state.profile)).toBe(original);
});
for(const count of [1,3]) it(`reviews ${count} remaining sessions within the initial seven days`,()=>{
  const state=fixture();state.program.days=state.program.days.slice(0,count);render(state);act(()=>button('My available days changed').click());
  for(const selected of document.querySelectorAll('.flexible-week-dates button[aria-pressed="true"]'))act(()=>selected.click());
  for(const index of [0,2,4].slice(0,count))act(()=>document.querySelectorAll('.flexible-week-dates button')[index].click());
  act(()=>button('REVIEW SCHEDULE').click());expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect(document.querySelectorAll('.flexible-week-review article')).toHaveLength(count);
});
it('restoring the profile baseline disables Review again without changing profile data',()=>{
 const state=fixture(),before=JSON.stringify(state.profile);render(state);act(()=>button('My available days changed').click());const date=document.querySelector('.flexible-week-dates button');
 act(()=>date.click());expect(button('REVIEW SCHEDULE').disabled).toBe(false);act(()=>date.click());expect(button('REVIEW SCHEDULE').disabled).toBe(true);expect(JSON.stringify(state.profile)).toBe(before);
});
it('missing profile availability uses an empty deterministic UI baseline',()=>{
 const state=fixture();delete state.profile.availableDays;render(state);act(()=>button('My available days changed').click());expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);expect(button('REVIEW SCHEDULE').disabled).toBe(true);
});
