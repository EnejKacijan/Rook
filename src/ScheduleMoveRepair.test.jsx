import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import * as domain from './domain.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,temporaryScheduleReview} from './flexibleWeek.js';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,persist;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const Header=({title,onBack,onClose})=><header><strong>{title}</strong>{onBack&&<button className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const click=text=>act(()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click());
function mount(){
  let state=domain.blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=domain.buildProgram(state.profile);state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';state=domain.deserializeState(state);
  const source=flexibleSessions(state).find(item=>item.scheduledDate==='2026-10-23');
  state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-24'})).state;
  state.flexibleWeek.sessions[source.logicalSessionId].planFingerprint='unlinked-legacy-move';
  function Harness(){const[value,setValue]=useState(state);current=value;return <FlexibleWeekSheet state={value} update={fn=>setValue(fn)} close={()=>{}} Header={Header} request={{reviewExisting:true}}/>;}
  act(()=>root.render(<Harness/>));return source.logicalSessionId;
}
it('offers a usable repair for a past-original/today-destination move and restores Today after explicit confirmation',()=>{
  const id=mount();expect(temporaryScheduleReview(current).unresolved).toHaveLength(1);click('Review this move');
  expect(host.textContent).toContain('Keep the moved date and use the current plan');expect(persist).not.toHaveBeenCalled();
  click('KEEP MOVED DATE');expect(persist).toHaveBeenCalledOnce();expect(temporaryScheduleReview(current).unresolved).toHaveLength(0);
  expect(domain.plannedWorkoutForDate(current,'2026-10-24').logicalSessionId).toBe(id);
});
it('leaves a reviewed move untouched on Back or storage failure and supports retry',()=>{
  mount();const before=structuredClone(current);click('Review this move');click('Back');expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
  click('Review this move');persist.mockReturnValue(false);click('KEEP MOVED DATE');expect(current).toEqual(before);expect(host.textContent).toContain('Could not save');
  persist.mockReturnValue(true);click('KEEP MOVED DATE');expect(temporaryScheduleReview(current).unresolved).toHaveLength(0);
});
it('requires an explicit removal confirmation and preserves workout history',()=>{
  const id=mount(),history=structuredClone(current.workouts);click('Review this move');click('REMOVE TEMPORARY MOVE');
  expect(current.flexibleWeek.sessions[id]).toBeTruthy();expect(persist).not.toHaveBeenCalled();click('REMOVE TEMPORARY MOVE');
  expect(current.flexibleWeek.sessions[id]).toBeUndefined();expect(current.workouts).toEqual(history);expect(current.flexibleWeek.recoveryHistory[0].id).toBe(id);
});
it('offers a working free-date choice and retains it for retry when storage fails',()=>{
  const id=mount();click('Review this move');click('MOVE TO A FREE DATE');
  const choose=()=>host.querySelector('[data-repair-date="2026-10-25"]');
  expect(choose()).not.toBeNull();
  persist.mockReturnValue(false);act(()=>choose().click());
  expect(current.flexibleWeek.sessions[id].scheduledDate).toBe('2026-10-24');
  expect(host.textContent).toContain('Could not save');
  persist.mockReturnValue(true);act(()=>choose().click());
  expect(current.flexibleWeek.sessions[id].scheduledDate).toBe('2026-10-25');
  expect(temporaryScheduleReview(current).unresolved).toHaveLength(0);
});
