import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {MissedWorkoutFeedbackProvider} from './MissedWorkoutFeedback.jsx';
import {MissedWorkoutSummary} from './missedWorkoutPresentation.jsx';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {todayMissedRestFixture} from './todayMissedRest.fixture.js';
import {missedFlexibleSessions,applyFlexibleWeek,proposeFlexibleWeek} from './flexibleWeek.js';
import {deserializeState,STORAGE_KEY} from './domain.js';

let root,current,change;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T12:00:00'));localStorage.clear();const host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
const Header=()=>null;
function draw(count=3){const initial=todayMissedRestFixture({count});function Harness(){const [state,setState]=useState(initial),[request,setRequest]=useState(null);current=state;change=fn=>act(()=>setState(fn));return <MissedWorkoutFeedbackProvider state={state} update={setState}>
 <MissedWorkoutSummary state={state} update={setState} onSelect={setRequest}/>
 {request&&<FlexibleWeekSheet state={state} update={setState} request={request} Header={Header} close={()=>setRequest(null)}/>}
 </MissedWorkoutFeedbackProvider>;}act(()=>root.render(<Harness/>));return initial;}
const click=el=>act(()=>el.click());
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const hide=()=>document.querySelector('.missed-reminder-hide');
const status=()=>document.querySelector('.exercise-remove-undo');
const undo=()=>status()?.querySelector('button');
const saved=()=>deserializeState(localStorage.getItem(STORAGE_KEY));
function recover(kind){click(document.querySelector('.today-missed-open'));const chooser=document.querySelector('[data-session-id]');if(chooser)click(chooser);if(kind==='skip'){click(button('More options'));click(button('Skip this session'));}else{click(button('MOVE TO ANOTHER DAY'));click(document.querySelector('[data-move-date]'));click(button('APPLY MOVE'));}}

it.each([1,3])('shared header and separate accessible navigation with %i missed',count=>{
 draw(count);expect(document.querySelector('.today-missed-label').textContent).toBe(count===1?'MISSED WORKOUT':'MISSED WORKOUTS');
 expect(hide().textContent).toBe('Hide');expect(hide().getAttribute('aria-label')).toBe(count===1?'Hide missed workout reminder':'Hide missed workouts reminder');
 const row=document.querySelector('.today-missed-open');expect(row.contains(hide())).toBe(false);expect(row.getAttribute('aria-label')).toBe(count===1?'Recover UPPER B, missed Friday September 18':'View 3 missed workouts');
 expect(document.body.textContent).not.toContain('×');if(count===1){expect(row.textContent).toContain('Missed · Fri, Sep 18');expect(row.textContent).not.toContain('1 missed workout');}
 click(row);expect(document.querySelector('h1').textContent).toBe(count===1?'UPPER B':'Choose a missed session');
});
it.each([1,3])('Hide and Undo touch only visibility, keeping later profile changes (%i)',count=>{
 const before=draw(count);click(hide());expect(hide()).toBeNull();expect(current).toEqual({...before,dismissedMissedReminderKey:current.dismissedMissedReminderKey});expect(status().textContent).toContain(count===1?'Missed workout reminder hidden':'Missed workouts hidden');
 change(s=>({...s,profile:{...s.profile,units:'lb'}}));act(()=>vi.advanceTimersByTime(4999));click(undo());
 expect(hide()).not.toBeNull();expect(current).toEqual({...before,profile:{...before.profile,units:'lb'},dismissedMissedReminderKey:null});expect(saved().dismissedMissedReminderKey).toBeNull();expect(status()).toBeNull();
});
it('Hide expires at five seconds despite unrelated rerenders and remains hidden after reload',()=>{
 draw();click(hide());act(()=>vi.advanceTimersByTime(2500));change(s=>({...s,profile:{...s.profile,units:'lb'}}));act(()=>vi.advanceTimersByTime(2499));expect(status()).not.toBeNull();act(()=>vi.advanceTimersByTime(1));expect(status()).toBeNull();
 change(()=>saved());expect(hide()).toBeNull();expect(missedFlexibleSessions(current)).toHaveLength(3);
});
it('hidden count change reopens the correct singular reminder and invalidates old Hide Undo',()=>{
 draw(2);click(hide());change(s=>applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:missedFlexibleSessions(s)[0].logicalSessionId})).state);
 expect(status()).toBeNull();expect(hide().getAttribute('aria-label')).toBe('Hide missed workout reminder');expect(document.querySelector('.today-missed-label').textContent).toBe('MISSED WORKOUT');
});
it('one becomes multiple without stale header or accessible names',()=>{
 draw(1);change(()=>todayMissedRestFixture({count:3}));expect(document.querySelector('.today-missed-label').textContent).toBe('MISSED WORKOUTS');expect(hide().getAttribute('aria-label')).toBe('Hide missed workouts reminder');expect(document.querySelector('.today-missed-open').getAttribute('aria-label')).toBe('View 3 missed workouts');
});
it.each(['move','skip'])('%s feedback survives sheet close and Undo restores only the exact occurrence mutation',kind=>{
 const before=draw(2),ids=missedFlexibleSessions(before).map(s=>s.logicalSessionId);recover(kind);
 expect(document.querySelector('.flexible-week-sheet')).toBeNull();expect(missedFlexibleSessions(current).map(s=>s.logicalSessionId)).toEqual([ids[1]]);expect(hide().getAttribute('aria-label')).toBe('Hide missed workout reminder');expect(status().textContent).toContain(kind==='move'?'UPPER B moved to Sat, Sep 19':'UPPER B skipped');
 change(s=>({...s,profile:{...s.profile,units:'lb'}}));click(undo());expect(current).toEqual({...before,profile:{...before.profile,units:'lb'}});expect(missedFlexibleSessions(saved()).map(s=>s.logicalSessionId)).toEqual(ids);expect(status()).toBeNull();
});
it.each(['move','skip'])('Hide after %s replaces feedback; Undo Hide never reverses the schedule',kind=>{
 draw(2);recover(kind);const schedule=structuredClone(current.flexibleWeek);click(hide());expect(document.querySelectorAll('.exercise-remove-undo')).toHaveLength(1);expect(status().textContent).toContain('reminder hidden');click(undo());expect(current.flexibleWeek).toEqual(schedule);expect(missedFlexibleSessions(current)).toHaveLength(1);
});
it('new workout data invalidates schedule Undo rather than replacing later work',()=>{
 draw(2);recover('move');change(s=>({...s,workouts:[...s.workouts,{id:'later',completedAt:'2026-09-19T12:00:00'}]}));expect(status()).toBeNull();expect(current.workouts.at(-1).id).toBe('later');
});
it('when the final skip advances the block, later program metadata also invalidates its snapshot Undo',()=>{
 const before=draw(1);recover('skip');expect(current.program).not.toEqual(before.program);
 change(s=>({...s,program:{...s.program,name:'Renamed after skipping'}}));expect(status()).toBeNull();expect(current.program.name).toBe('Renamed after skipping');
});
it('failed Hide or Undo writes never publish the change, and Undo permits retry within its lifetime',()=>{
 const before=draw(1),fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});click(hide());expect(current).toEqual(before);expect(status()).toBeNull();expect(document.querySelector('[role="alert"]').textContent).toContain('still visible');fail.mockRestore();click(hide());const hidden=current;
 const undoFail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});click(undo());expect(current).toBe(hidden);expect(status()).not.toBeNull();expect(document.querySelector('[role="alert"]').textContent).toContain('unchanged');undoFail.mockRestore();click(button('Dismiss'));click(undo());expect(hide()).not.toBeNull();expect(status()).toBeNull();
});
