import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FlexibleWeekSheet, missedSessionDestinations, groupRescheduleCandidates } from './FlexibleWeekSheet.jsx';
import { blankState, buildProgram, startWorkout } from './domain.js';
import { missedFlexibleSessions, flexibleSessions, proposeFlexibleWeek, applyFlexibleWeek } from './flexibleWeek.js';
import {MissedWorkoutSummary} from './missedWorkoutPresentation.jsx';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {adjustWeekState} from './fixtures/adjustWeekState.js';
let root;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
function fixture(start='2026-09-06') {const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate=start;return s;}
const Header=({onBack,onClose})=><header>{onBack && <button className="detail-header-back" aria-label="Back" onClick={onBack}>Back</button>}<button aria-label="Close" onClick={onClose}>Close</button></header>;
function render(state,request={},update=()=>{},close=()=>{}){if(!root){const host=document.createElement('div');document.body.append(host);root=createRoot(host);}act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} update={update} close={close} request={request}/>));}
const missed=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('I missed a workout'));
it('hides missed action when empty and updates when eligible work appears',()=>{
  render(fixture());expect(missed()).toBeUndefined();expect(document.body.textContent).not.toContain('No missed workouts to move.');expect(document.querySelector('h1').textContent).toBe('What changed?');
  render(fixture('2026-08-31'));expect(missed().disabled).toBe(false);act(()=>missed().click());expect(document.querySelector('h1').textContent).toBe('Choose a missed session');
});
it('retains a defensive empty state when eligible work disappears after navigation',()=>{
  render(fixture('2026-08-31'));act(()=>missed().click());render(fixture());expect(document.body.textContent).toContain('No unstarted sessions need moving.');expect(document.querySelectorAll('.adjust-option-list .choice-row').length).toBe(0);
});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
it('reviews valid moves as resolved and pinpoints a stale move with an action',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId;
 const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-09-06'})).state;
 render(moved,{reviewExisting:true});
 expect(document.querySelector('h1').textContent).toBe('Temporary schedule');
 expect(document.body.textContent).toContain('All other workouts keep their dates.');
 expect([...document.querySelectorAll('[data-session-id]')].find(node=>node.dataset.sessionId===id).textContent).toContain('Mon, Aug 31');
 expect([...document.querySelectorAll('[data-session-id]')].find(node=>node.dataset.sessionId===id).textContent).toContain('Sun, Sep 6');
 expect(button('REVIEW RESTORING ORIGINAL SCHEDULE')).toBeUndefined();
 const changed=structuredClone(moved);changed.program.days[0].name='Changed';render(changed,{reviewExisting:true,focusSessionId:id});
 expect(document.body.textContent).toContain('1 workout needs attention');
 expect([...document.querySelectorAll('[data-session-id]')].find(node=>node.dataset.sessionId===id).textContent).toContain('NEEDS ATTENTION');
 expect(button('Restore original schedule').disabled).toBe(true);
});
it('multiple missed summary opens a chooser without selecting the first identity',()=>{
 const state=fixture('2026-08-31'),select=vi.fn(),host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<MissedWorkoutSummary state={state} onSelect={select}/>));expect(document.body.textContent).toContain('3 missed workouts');
 act(()=>document.querySelector('.today-missed-open').click());expect(select).toHaveBeenCalledWith({missed:true});
 act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} update={()=>{}} close={()=>{}} request={{missed:true}}/>));
 expect([...document.querySelectorAll('[data-session-id]')].map(e=>e.dataset.sessionId)).toEqual(missedFlexibleSessions(state).map(s=>s.logicalSessionId));
});
it.each([0,1])('summary handles %i missed without inventing another choice',count=>{
 const state=fixture('2026-08-31');vi.setSystemTime(new Date(count?'2026-09-01T12:00:00':'2026-08-31T12:00:00'));
 const select=vi.fn(),host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<MissedWorkoutSummary state={state} onSelect={select}/>));
 if(count){act(()=>document.querySelector('.today-missed-open').click());expect(select).toHaveBeenCalledWith({sessionId:missedFlexibleSessions(state)[0].logicalSessionId});}else expect(document.querySelector('aside')).toBeNull();
});
it('failed direct move keeps the previous saved schedule and can be retried',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn();render(state,{sessionId:id},update);
 localStorage.setItem('lift-v2-state',JSON.stringify(state));const before=localStorage.getItem('lift-v2-state');act(()=>button('MOVE TO ANOTHER DAY').click());act(()=>document.querySelector('[data-move-date]').click());
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});act(()=>button('APPLY MOVE').click());
 expect(update).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBe(before);expect(document.querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');
 write.mockRestore();act(()=>button('TRY AGAIN').click());expect(update).toHaveBeenCalledTimes(1);expect(update.mock.calls[0][1].persistedState).toBeDefined();
});
it('immediately persists only a missed occurrence skip, once, without review',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn(),close=vi.fn();render(state,{sessionId:id},update,close);
 act(()=>button('More options').click());act(()=>{button('Skip this session').click();button('Skip this session').click();});
 expect(update).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);expect(document.body.textContent).not.toContain('Review your schedule');
 const next=update.mock.calls[0][0]();expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);expect(next.profile).toEqual(state.profile);
 expect(missedFlexibleSessions(next).some(s=>s.logicalSessionId===id)).toBe(false);
 expect(flexibleSessions(next).filter(s=>s.logicalSessionId!==id).map(s=>[s.logicalSessionId,s.scheduledDate])).toEqual(flexibleSessions(state).filter(s=>s.logicalSessionId!==id).map(s=>[s.logicalSessionId,s.scheduledDate]));
 expect(JSON.parse(localStorage.getItem('lift-v2-state')).flexibleWeek).toEqual(next.flexibleWeek);
});
it('failed skip persistence leaves the missed session and sheet recoverable',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn(),close=vi.fn();render(state,{sessionId:id},update,close);
 act(()=>button('More options').click());
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});
 act(()=>button('Skip this session').click());expect(update).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.querySelector('[role="alert"]').textContent).toContain('still missed');
 write.mockRestore();act(()=>button('Skip this session').click());expect(update).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
});
it('offers today only when empty and renders only authoritative valid destinations',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,before=JSON.stringify(state);
 const valid=missedSessionDestinations(state,id);
 expect(valid).toContain('2026-09-06');for(const toDate of valid)expect(proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate}).status).toBe('ready');
 render(state,{sessionId:id});act(()=>button('MOVE TO ANOTHER DAY').click());
 expect([...document.querySelectorAll('[data-move-date]:not(:disabled)')].map(e=>e.dataset.moveDate).sort()).toEqual(valid.sort());
 expect(document.querySelectorAll('.flexible-week-dates button:disabled')).toHaveLength(0);
 act(()=>document.querySelector('[data-move-date]').click());expect(document.querySelector('h1').textContent).toMatch(/^Move /);expect(JSON.stringify(state)).toBe(before);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toMatch(/^Move /);expect(JSON.stringify(state)).toBe(before);
});
it.each(['planned','active','completed'])('excludes today occupied by a %s workout without displacing it',status=>{
 vi.setSystemTime(new Date('2026-09-09T12:00:00'));const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId;
 const today=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-09');
 if(status!=='planned'){state.selectedDate='2026-09-09';state.activeWorkout=startWorkout(state,today.workout);if(status==='completed'){state.workouts=[{...state.activeWorkout,completedAt:Date.now()}];state.activeWorkout=null;}}
 const before=JSON.stringify(state);expect(missedSessionDestinations(state,id)).not.toContain('2026-09-09');render(state,{sessionId:id});expect(button('Move to today')).toBeUndefined();expect(document.body.textContent).not.toContain(`Today already has ${today.workout.name}`);act(()=>button('MOVE TO ANOTHER DAY').click());expect(document.querySelector('[data-move-date="2026-09-09"]')).toBeNull();expect(JSON.stringify(state)).toBe(before);
});
it('commits a reviewed move once, preserving plan/history and resolving that missed identity',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn(),close=vi.fn();render(state,{sessionId:id},update,close);
 act(()=>button('MOVE TO ANOTHER DAY').click());act(()=>document.querySelector('[data-move-date]').click());expect(update).not.toHaveBeenCalled();
 act(()=>{button('APPLY MOVE').click();button('APPLY MOVE').click();});expect(update).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Workout moved');
 const next=update.mock.calls[0][0]();expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);expect(missedFlexibleSessions(next).some(s=>s.logicalSessionId===id)).toBe(false);
});
it('Back pops review to destination to picker to root without applying changes',()=>{
 const state=fixture(),before=JSON.stringify(state);render(state);
 act(()=>button('Move a workout').click());act(()=>document.querySelector('.flexible-workout-list button').click());
 const title=document.querySelector('h1').textContent;
 act(()=>document.querySelector('.flexible-week-dates button:not([disabled])').click());expect(document.querySelector('h1').textContent).toMatch(/^Move /);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe(title);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('Choose a workout');
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('What changed?');expect(button('Back')).toBeUndefined();expect(JSON.stringify(state)).toBe(before);
});
for(const [date,count,selected] of [['2026-09-07',7,3],['2026-09-09',5,2]]) it(`Adjust week shows only ${count} remaining dates on ${date}`,()=>{
  vi.setSystemTime(new Date(`${date}T12:00:00`));render(fixture());act(()=>button('My available days changed').click());
  const dates=[...document.querySelectorAll('.flexible-week-dates button')];expect(dates).toHaveLength(count);expect(dates.filter(b=>b.getAttribute('aria-pressed')==='true')).toHaveLength(selected);
  expect(button('REVIEW SCHEDULE').disabled).toBe(date==='2026-09-06');
  expect(dates[0].getAttribute('aria-label')).toBe(new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`)));
  expect(dates.at(-1).getAttribute('aria-label')).toContain('Sun');
  expect(button('SHOW LATER DATES')).toBeUndefined();
});
it('keeps Adjust week inside the calendar week, reviews missing dates, and preserves choices on Back',()=>{
  vi.setSystemTime(new Date('2026-09-29T12:00:00'));const state=adjustWeekState(),original=JSON.stringify(state),update=vi.fn();render(state,{},update);act(()=>button('My available days changed').click());
  // Baseline Tue/Wed/Thu/Fri has room for only four of five current-week sources.
  expect([...document.querySelectorAll('[data-available-date]')].map(node=>node.dataset.availableDate)).toEqual(['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
  expect(document.querySelector('[role="status"]').textContent).toContain('4 of 5 workouts');
  expect(button('REVIEW SCHEDULE').disabled).toBe(false);
  act(()=>button('REVIEW SCHEDULE').click());
  expect(document.querySelectorAll('.flexible-week-review article')).toHaveLength(5);
  expect(document.body.textContent).toContain('Needs a day');expect(button('USE THIS SCHEDULE').disabled).toBe(true);
  expect(document.body.textContent).not.toContain('Mon, Oct 5');
  const rows=[...document.querySelectorAll('[data-session-id]')].map(n=>n.dataset.sessionId);
  act(()=>button('Back').click());expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(4);
  expect(document.body.textContent).toContain('Review to move later');
  act(()=>document.querySelector('[data-available-date="2026-10-04"]').click());
  act(()=>button('REVIEW SCHEDULE').click());expect(button('USE THIS SCHEDULE').disabled).toBe(false);
  expect([...document.querySelectorAll('[data-session-id]')].map(n=>n.dataset.sessionId)).toEqual(rows);
  expect(document.body.textContent).toContain('Sun, Oct 4');
  act(()=>button('EDIT DAYS').click());expect(document.querySelector('[data-available-date="2026-10-04"]').getAttribute('aria-pressed')).toBe('true');
  expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(original);
});
for(const count of [1,3]) it(`reviews ${count} remaining sessions within the initial seven days`,()=>{
  vi.setSystemTime(new Date('2026-09-07T12:00:00'));const state=fixture();state.program.days=state.program.days.slice(0,count);render(state);act(()=>button('My available days changed').click());
  for(const selected of document.querySelectorAll('.flexible-week-dates button[aria-pressed="true"]'))act(()=>selected.click());
  for(const index of [0,2,4].slice(0,count))act(()=>document.querySelectorAll('.flexible-week-dates button')[index].click());
  act(()=>button('REVIEW SCHEDULE').click());expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect(document.querySelectorAll('.flexible-week-review article')).toHaveLength(count);
});
it('the profile baseline can be reviewed without changing profile data',()=>{
 vi.setSystemTime(new Date('2026-09-07T12:00:00'));const state=fixture(),before=JSON.stringify(state.profile);render(state);act(()=>button('My available days changed').click());const date=document.querySelector('.flexible-week-dates button');
 act(()=>date.click());expect(button('REVIEW SCHEDULE').disabled).toBe(false);act(()=>date.click());expect(button('REVIEW SCHEDULE').disabled).toBe(false);expect(JSON.stringify(state.profile)).toBe(before);
});
it('missing profile availability uses an empty deterministic UI baseline',()=>{
 vi.setSystemTime(new Date('2026-09-07T12:00:00'));const state=fixture();delete state.profile.availableDays;render(state);act(()=>button('My available days changed').click());expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);expect(button('REVIEW SCHEDULE').disabled).toBe(false);
});
it('availability Apply publishes one reviewed proposal only after a successful write and supports retry',()=>{
 vi.setSystemTime(new Date('2026-09-29T12:00:00'));const state=adjustWeekState(),update=vi.fn(),close=vi.fn();
 localStorage.setItem('lift-v2-state',JSON.stringify(state));render(state,{},update,close);
 act(()=>button('My available days changed').click());
 act(()=>document.querySelector('[data-available-date="2026-10-04"]').click());
 act(()=>button('REVIEW SCHEDULE').click());expect(button('USE THIS SCHEDULE').disabled).toBe(false);
 const before=localStorage.getItem('lift-v2-state'),write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
 act(()=>button('USE THIS SCHEDULE').click());expect(update).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 expect(localStorage.getItem('lift-v2-state')).toBe(before);expect(document.querySelector('[role="alert"]').textContent).toContain('previous schedule is unchanged');
 write.mockRestore();act(()=>{button('TRY AGAIN').click();button('TRY AGAIN').click();});
 expect(update).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 const saved=JSON.parse(localStorage.getItem('lift-v2-state'));expect(saved.program).toEqual(state.program);
 expect(Object.values(saved.flexibleWeek.sessions).map(s=>s.scheduledDate).sort()).toEqual(['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-04']);
});
it('availability Apply rejects an externally changed schedule while preserving the reviewed rows',()=>{
 vi.setSystemTime(new Date('2026-09-29T12:00:00'));const state=adjustWeekState(),update=vi.fn();render(state,{},update);
 act(()=>button('My available days changed').click());act(()=>document.querySelector('[data-available-date="2026-10-03"]').click());
 act(()=>button('REVIEW SCHEDULE').click());const text=document.querySelector('.flexible-week-review').textContent;
 const changed={...state,flexibleWeek:{...state.flexibleWeek,revision:2}};render(changed,{},update);
 act(()=>button('USE THIS SCHEDULE').click());expect(update).not.toHaveBeenCalled();
 expect(document.querySelector('[role="alert"]').textContent).toContain('Review the schedule again');
 expect(document.querySelector('.flexible-week-review').textContent).toBe(text);
});
it('groups missed before upcoming, sorts current dates, and preserves session identities',()=>{
 const candidates=['2026-09-04','2026-09-07','2026-09-11','2026-09-14','2026-09-21'].map((scheduledDate,i)=>({scheduledDate,status:i<2?'missed':'planned',logicalSessionId:`session-${i}`}));
 const groups=groupRescheduleCandidates([...candidates].reverse());
 expect(groups.map(g=>g.label)).toEqual(['MISSED','UPCOMING']);
 const flattened=groups.flatMap(g=>g.sessions);expect(flattened).toEqual(candidates);flattened.forEach((s,i)=>expect(s).toBe(candidates[i]));
 expect(groupRescheduleCandidates(candidates.slice(2)).map(g=>g.label)).toEqual(['UPCOMING']);
 expect(groupRescheduleCandidates([],'2026-09-11')).toEqual([]);
});
it('Swap persists both occurrences once; a failed write keeps both original dates and retries',()=>{
 const state=fixture('2026-08-31'),[a,b]=flexibleSessions(state).filter(s=>s.status==='planned'),update=vi.fn(),close=vi.fn();render(state,{sessionId:a.logicalSessionId,swap:true},update,close);
 const target=[...document.querySelectorAll('[data-session-id]')].find(el=>el.dataset.sessionId===b.logicalSessionId);expect(target).toBeDefined();act(()=>target.click());expect(document.querySelector('h1').textContent).toMatch(/^Swap /);
 localStorage.setItem('lift-v2-state',JSON.stringify(state));const before=localStorage.getItem('lift-v2-state');const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
 act(()=>button('SWAP WORKOUTS').click());expect(update).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBe(before);write.mockRestore();
 act(()=>{button('TRY AGAIN').click();button('TRY AGAIN').click();});expect(update).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);const saved=JSON.parse(localStorage.getItem('lift-v2-state'));expect(saved.flexibleWeek.sessions[a.logicalSessionId].scheduledDate).toBe(b.scheduledDate);expect(saved.flexibleWeek.sessions[b.logicalSessionId].scheduledDate).toBe(a.scheduledDate);
});

it('selecting a missed occurrence reveals only the recovery choices and keeps its source date',()=>{
 const state=fixture('2026-08-31'),selected=missedFlexibleSessions(state)[1],update=vi.fn(),before=JSON.stringify(state);
 render(state,{missed:true},update);act(()=>document.querySelector(`[data-session-id="${selected.logicalSessionId}"]`).click());
 expect(document.querySelector('h1').textContent).toBe(selected.workout.name);expect(document.body.textContent).toContain('Missed · Wed, Sep 2');
 for(const label of ['TRAIN TODAY','MOVE TO ANOTHER DAY','More options'])expect(button(label)).toBeDefined();
 expect(document.querySelector('[data-move-date]')).toBeNull();expect(document.body.textContent).not.toMatch(/TEMPORARY SCHEDULE|AVAILABLE DATES|Today already|Skip this session|Swap with/);
 expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('Choose a missed session');
});
it('Train Today on a free day reviews before applying and resolves the exact missed occurrence',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[1].logicalSessionId,update=vi.fn(),close=vi.fn(),before=JSON.stringify(state);
 render(state,{sessionId:id},update,close);act(()=>button('TRAIN TODAY').click());
 expect(document.querySelector('.use-workout-today-sheet')).not.toBeNull();expect(button('APPLY')).toBeDefined();expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
 act(()=>button('Back').click());expect(button('TRAIN TODAY')).toBe(document.activeElement);
 act(()=>button('TRAIN TODAY').click());act(()=>button('APPLY').click());expect(update).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 const next=update.mock.calls[0][0]();expect(next.flexibleWeek.sessions[id].scheduledDate).toBe('2026-09-06');expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
});
it('Train Today reveals the occupied workout only after intent, preserving the displacement review',()=>{
 vi.setSystemTime(new Date('2026-09-09T12:00:00'));const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],occupied=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-09'),update=vi.fn(),before=JSON.stringify(state);
 render(state,{sessionId:source.logicalSessionId},update);expect(document.body.textContent).not.toContain('instead of');expect(document.querySelector('.flexible-week-dates')).toBeNull();
 act(()=>button('TRAIN TODAY').click());expect(document.querySelector('h1').textContent).toBe(`Train ${source.workout.name} today?`);expect(document.body.textContent).toContain(`Today already has ${occupied.workout.name}.`);expect(button('APPLY')).toBeUndefined();expect(document.querySelector('.flexible-week-dates')).toBeNull();
 act(()=>button('Choose another date').click());expect(document.querySelector('h1').textContent).toBe(`Move ${occupied.workout.name}`);
 act(()=>document.querySelector('.flexible-week-dates button').click());expect(button('APPLY')).toBeDefined();expect(document.body.textContent).toContain('stays uncompleted');expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe(`Move ${occupied.workout.name}`);act(()=>button('Back').click());expect(button('SWAP WORKOUTS')).toBeDefined();act(()=>button('Back').click());expect(button('TRAIN TODAY')).toBeDefined();expect(document.querySelector('[data-move-date]')).toBeNull();
});
it('an active workout guard prevents advertising Train Today and cannot be bypassed',()=>{
 const state=startFreestyleWorkout(fixture('2026-08-31')),source=missedFlexibleSessions(state)[0],update=vi.fn();
 render(state,{sessionId:source.logicalSessionId},update);
 expect(button('TRAIN TODAY')).toBeUndefined();expect(button('APPLY')).toBeUndefined();expect(update).not.toHaveBeenCalled();expect(button('More options')).toBeDefined();
});
it('Move preserves the candidate date across review/Back without exposing unrelated actions',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn();render(state,{sessionId:id},update);
 act(()=>button('MOVE TO ANOTHER DAY').click());expect(document.body.textContent).toContain('From Mon, Aug 31');expect(document.body.textContent).not.toMatch(/TRAIN TODAY|Use this workout today|More options|Skip this session|Adjust remaining week|TEMPORARY SCHEDULE/);
 const date=document.querySelectorAll('[data-move-date]')[1].dataset.moveDate;act(()=>document.querySelector(`[data-move-date="${date}"]`).click());act(()=>button('Back').click());
 expect(document.querySelector(`[data-move-date="${date}"]`).getAttribute('aria-pressed')).toBe('true');act(()=>button('Back').click());expect(button('MOVE TO ANOTHER DAY')).toBe(document.activeElement);
 act(()=>button('MOVE TO ANOTHER DAY').click());expect(document.querySelector(`[data-move-date="${date}"]`).getAttribute('aria-pressed')).toBe('true');expect(update).not.toHaveBeenCalled();
});
it.each(['Swap with another workout','Adjust remaining week'])('More options exposes %s and its child returns to the same action screen',label=>{
 const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],update=vi.fn(),before=JSON.stringify(state);render(state,{sessionId:source.logicalSessionId},update);
 act(()=>button('More options').click());for(const name of ['Swap with another workout','Adjust remaining week','Skip this session'])expect(button(name)).toBeDefined();
 act(()=>button(label).click());expect(button('TRAIN TODAY')).toBeUndefined();act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe(source.workout.name);expect(button('More options')).toBe(document.activeElement);expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
});
it.each(['TRAIN TODAY','MOVE TO ANOTHER DAY','More options'])('Close from %s dismisses the whole flow without mutation',label=>{
 const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],update=vi.fn(),close=vi.fn(),before=JSON.stringify(state);render(state,{sessionId:source.logicalSessionId},update,close);
 act(()=>button(label).click());act(()=>button('Close').click());expect(close).toHaveBeenCalledOnce();expect(update).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
});
it('a missed move revalidates changed schedule on Apply and leaves the new schedule untouched',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn();render(state,{sessionId:id},update);act(()=>button('MOVE TO ANOTHER DAY').click());act(()=>document.querySelector('[data-move-date]').click());
 const changed={...state,weekScheduleOverrides:{'2026-09-07':{}}},before=JSON.stringify(changed);render(changed,{sessionId:id},update);act(()=>button('APPLY MOVE').click());expect(document.querySelector('[role="alert"]').textContent).toContain('Review the schedule again');expect(update).not.toHaveBeenCalled();expect(JSON.stringify(changed)).toBe(before);
});
it('Train Today revalidates changed schedule before exposing Apply again',()=>{
 const state=fixture('2026-08-31'),id=missedFlexibleSessions(state)[0].logicalSessionId,update=vi.fn();render(state,{sessionId:id},update);act(()=>button('TRAIN TODAY').click());expect(button('APPLY')).toBeDefined();
 render({...state,weekScheduleOverrides:{'2026-09-07':{}}},{sessionId:id},update);expect(button('APPLY')).toBeUndefined();expect(document.querySelector('[role="alert"]').textContent).toContain('schedule changed');expect(update).not.toHaveBeenCalled();
});
it('an externally resolved occurrence leaves recovery safely and Back reviews current scheduling actions',()=>{
 const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],update=vi.fn();render(state,{sessionId:source.logicalSessionId},update);
 const changed={...state,activeWorkout:startWorkout(state,source.workout)};render(changed,{sessionId:source.logicalSessionId},update);expect(document.querySelector('[role="status"]').textContent).toContain('no longer available');expect(button('APPLY')).toBeUndefined();
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('What changed?');expect(update).not.toHaveBeenCalled();
});

it('Train Today presents the canonical Swap immediately and returns to the same missed selection',()=>{
 vi.setSystemTime(new Date('2026-09-09T12:00:00'));const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],update=vi.fn();render(state,{sessionId:source.logicalSessionId},update);
 act(()=>button('TRAIN TODAY').click());expect(button('SWAP WORKOUTS')).toBeDefined();expect(button('Swap these workouts')).toBeUndefined();expect(document.querySelector('.flexible-week-dates')).toBeNull();
 act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe(source.workout.name);expect(button('TRAIN TODAY')).toBeDefined();expect(update).not.toHaveBeenCalled();
});
it('externally starting the selected occurrence during Train Today returns to current schedule in one Back',()=>{
 const state=fixture('2026-08-31'),source=missedFlexibleSessions(state)[0],update=vi.fn();render(state,{sessionId:source.logicalSessionId},update);act(()=>button('TRAIN TODAY').click());
 render({...state,activeWorkout:startWorkout(state,source.workout)},{sessionId:source.logicalSessionId},update);act(()=>button('Back').click());expect(document.querySelector('h1').textContent).toBe('What changed?');expect(update).not.toHaveBeenCalled();
});
