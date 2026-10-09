import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {insufficientDaysState} from './fixtures/insufficientDaysState.js';
let root,host;
const Header=({onBack,onClose})=><header>{onBack&&<button aria-label="Back" className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=text=>act(()=>button(text).click());
function render(state,update=vi.fn(),close=vi.fn()){
 if(!root){host=document.createElement('div');document.body.append(host);root=createRoot(host);}
 act(()=>root.render(<FlexibleWeekSheet state={state} Header={Header} update={update} close={close}/>));return {update,close};
}
function review({single=false,incompatible=false,zero=false,extra=false}={}){
 const state=insufficientDaysState({single,incompatible,extra}),spies=render(state);
 act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('My available days changed')).click());
 if(zero)act(()=>document.querySelector('[data-available-date]').click());
 click('REVIEW SCHEDULE');return {state,...spies};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();});
it('one workout and zero days offers Move later and Skip, no Combine, no draft writes',()=>{
 const {update}=review({single:true,zero:true});
 expect(button('MOVE LATER ›')).toBeDefined();expect(button('Skip this workout')).toBeDefined();expect(button('Combine with another workout')).toBeUndefined();
 expect(button('USE THIS SCHEDULE').disabled).toBe(true);expect(button('EDIT DAYS')).toBeDefined();
 expect(update).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBeNull();
});
it('an initially empty availability baseline can be explicitly reviewed without a pointless toggle',()=>{
 const state=insufficientDaysState({single:true});state.profile.availableDays=['Sat'];render(state);
 act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('My available days changed')).click());
 expect(document.querySelector('[data-available-date]').getAttribute('aria-pressed')).toBe('false');expect(button('REVIEW SCHEDULE').disabled).toBe(false);
 click('REVIEW SCHEDULE');expect(button('Skip this workout')).toBeDefined();expect(button('USE THIS SCHEDULE').disabled).toBe(true);
});
it('Move Later returns to the same review, resolves beyond Sunday, and persists only on Apply',()=>{
 const {state,update,close}=review({single:true,zero:true});click('MOVE LATER ›');
 expect(document.querySelector('h1').textContent).toBe('Move Lower B');expect(document.body.textContent).toContain('Next week');
 act(()=>document.querySelector('[data-move-date="2026-10-06"]').click());
 expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect(document.body.textContent).toContain('Tue, Oct 6');expect(document.body.textContent).toContain('Sat, Oct 3');
 expect(button('USE THIS SCHEDULE').disabled).toBe(false);expect(update).not.toHaveBeenCalled();
 click('USE THIS SCHEDULE');expect(update).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
 const next=update.mock.calls[0][0]();expect(next.program).toEqual(state.program);expect(Object.values(next.flexibleWeek.sessions)[0]).toMatchObject({originalDate:'2026-10-03',scheduledDate:'2026-10-06'});
});
it('skip confirmation has Keep it, stays a reversible draft, and returns to unresolved when changed',()=>{
 const {update}=review({single:true,zero:true});click('Skip this workout');
 expect(document.querySelector('h1').textContent).toBe('Skip Lower B this week?');expect(document.body.textContent).toContain('future Lower B workouts stay unchanged');
 click('KEEP IT');expect(button('USE THIS SCHEDULE').disabled).toBe(true);click('Skip this workout');click('SKIP WORKOUT');
 expect(document.body.textContent).toContain('Skipped this week');expect(button('USE THIS SCHEDULE').disabled).toBe(false);expect(update).not.toHaveBeenCalled();
 click('Change');expect(document.body.textContent).toContain('Needs a day');expect(button('USE THIS SCHEDULE').disabled).toBe(true);
});
it('compatible two-workout/one-day state reuses the canonical exercise preview and confirms both draft sources',()=>{
 const {update,state}=review();expect(document.querySelectorAll('[aria-label^="Resolve "]')).toHaveLength(1);
 click('Combine with another workout');expect(document.querySelector('h1').textContent).toBe('Combined session preview');
 expect(document.body.textContent).toContain('Sun, Oct 4');expect(document.body.textContent).toContain('Combined from');expect(document.body.textContent).toContain('Push');expect(document.body.textContent).toContain('Pull');
 expect(document.querySelectorAll('.adapt-review-list button').length).toBeGreaterThan(0);expect(document.body.textContent).toContain('Overlapping exercises');
 click('ADD TO SCHEDULE');expect(document.querySelectorAll('.flexible-week-review article')).toHaveLength(2);expect(document.querySelectorAll('[aria-label^="Resolve "]')).toHaveLength(0);
 expect(button('USE THIS SCHEDULE').disabled).toBe(false);expect(update).not.toHaveBeenCalled();
 act(()=>{button('USE THIS SCHEDULE').click();button('USE THIS SCHEDULE').click();});expect(update).toHaveBeenCalledTimes(1);
 const next=update.mock.calls[0][0]();expect(next.todayAdaptation.sourceSessions).toHaveLength(2);expect(next.program).toEqual(state.program);expect(next.workouts).toEqual([]);
});
it('multiple compatible partners require a choice, and the remaining third source still needs resolution',()=>{
 const {update}=review({extra:true});click('Combine with another workout');expect(document.querySelector('h1').textContent).toBe('Combine with which workout?');
 expect(document.querySelectorAll('.flexible-combine-choices button')).toHaveLength(2);
 act(()=>[...document.querySelectorAll('.flexible-combine-choices button')].find(b=>b.textContent.includes('Push')).click());
 expect(document.querySelector('h1').textContent).toBe('Combined session preview');click('ADD TO SCHEDULE');
 expect(button('USE THIS SCHEDULE').disabled).toBe(true);expect(document.querySelectorAll('[aria-label^="Resolve "]')).toHaveLength(1);
 click('MOVE LATER ›');act(()=>document.querySelector('[data-move-date="2026-10-06"]').click());expect(button('USE THIS SCHEDULE').disabled).toBe(false);
 click('USE THIS SCHEDULE');expect(update).toHaveBeenCalledTimes(1);const next=update.mock.calls[0][0]();expect(next.todayAdaptation.sourceSessions.map(s=>s.name)).toEqual(['Push','Pull']);
 expect(Object.values(next.flexibleWeek.sessions).find(s=>s.workoutId==='third-source')).toMatchObject({scheduledDate:'2026-10-06'});
});
it('preview Cancel and clearing its selected date release only the draft pair',()=>{
 const {update}=review();click('Combine with another workout');click('CANCEL');expect(document.body.textContent).toContain('Needs a day');
 click('Combine with another workout');click('ADD TO SCHEDULE');click('EDIT DAYS');act(()=>document.querySelector('[data-available-date]').click());click('REVIEW SCHEDULE');
 expect(document.querySelectorAll('[aria-label^="Resolve "]')).toHaveLength(2);expect(button('Combine with another workout')).toBeUndefined();expect(button('USE THIS SCHEDULE').disabled).toBe(true);expect(update).not.toHaveBeenCalled();
});
it('incompatible pair hides Combine but leaves both other resolutions available',()=>{
 review({incompatible:true});expect(button('Combine with another workout')).toBeUndefined();expect(button('MOVE LATER ›')).toBeDefined();expect(button('Skip this workout')).toBeDefined();
});
it('future selected dates cannot offer the today-only canonical Combine',()=>{
 vi.setSystemTime(new Date('2026-10-03T12:00:00'));review();expect(button('Combine with another workout')).toBeUndefined();
 expect(button('MOVE LATER ›')).toBeDefined();expect(button('Skip this workout')).toBeDefined();
});
it('failed atomic save leaves the previous durable schedule and both reservations intact',()=>{
 const {state,update}=review();localStorage.setItem('lift-v2-state',JSON.stringify(state));const previous=localStorage.getItem('lift-v2-state');
 click('Combine with another workout');click('ADD TO SCHEDULE');const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});
 click('USE THIS SCHEDULE');expect(update).not.toHaveBeenCalled();expect(localStorage.getItem('lift-v2-state')).toBe(previous);expect(document.body.textContent).toContain('previous schedule is unchanged');
 write.mockRestore();click('TRY AGAIN');expect(update).toHaveBeenCalledTimes(1);
});
it('closing/reloading abandons the draft; an external revision prevents stale Apply',()=>{
 const {state,update}=review({single:true,zero:true});click('Skip this workout');click('SKIP WORKOUT');
 const changed=structuredClone(state);changed.flexibleWeek={schemaVersion:1,revision:5,sessions:{}};render(changed,update);click('USE THIS SCHEDULE');
 expect(update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Review the schedule again');
 click('EDIT DAYS');expect(document.querySelector('h1').textContent).toBe('When can you train this week?');click('REVIEW SCHEDULE');
 expect(document.body.textContent).not.toContain('Skipped this week');expect(button('USE THIS SCHEDULE').disabled).toBe(false);expect(update).not.toHaveBeenCalled();
 act(()=>root.unmount());root=null;document.body.innerHTML='';render(state);expect(document.querySelector('h1').textContent).toBe('What changed?');expect(localStorage.getItem('lift-v2-state')).toBeNull();
});
