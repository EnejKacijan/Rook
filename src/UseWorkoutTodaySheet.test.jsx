import React,{act} from 'react';import{createRoot}from'react-dom/client';
import{it,expect,vi,beforeEach,afterEach}from'vitest';
import{UseWorkoutTodaySheet}from'./UseWorkoutTodaySheet.jsx';
import{blankState,buildProgram}from'./domain.js';import{flexibleSessions,proposeFlexibleWeek}from'./flexibleWeek.js';
let root,state,source,occupied,update,close;
const Header=({title,onBack,onClose})=><header>{title}{onBack&&<button onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes(text));
function render(next=state){act(()=>root.render(<UseWorkoutTodaySheet state={next} update={update} close={close} Header={Header} request={{sessionId:source.logicalSessionId}}/>));}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-09T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-08-31';
 source=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-11');occupied=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-09');
 const host=document.createElement('div');document.body.append(host);root=createRoot(host);update=vi.fn();close=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
it('presents names and the real source slot with primary Swap, no unexplained date grid',()=>{
 render();expect(document.querySelector('h1').textContent).toBe(`Train ${source.workout.name} today?`);expect(document.body.textContent).toContain(`Today already has ${occupied.workout.name}.`);
 expect(document.body.textContent).toContain(`${source.workout.name} today`);expect(document.body.textContent).toContain(`${occupied.workout.name} moves to Fri, Sep 11, 2026`);
 expect(button('SWAP WORKOUTS').classList.contains('primary')).toBe(true);expect(document.querySelector('.flexible-week-dates')).toBeNull();expect(update).not.toHaveBeenCalled();
});
it('opens an explicit displaced-workout picker, omits invalid dates and returns focus on Back',()=>{
 render();act(()=>button('Choose another date').click());expect(document.querySelector('h1').textContent).toBe(`Move ${occupied.workout.name}`);expect(document.body.textContent).toContain('Choose a new date for this workout.');
 const dates=[...document.querySelectorAll('.flexible-week-dates button')];expect(dates.length).toBeGreaterThan(0);expect(dates.every(b=>b.querySelector('small'))).toBe(true);
 expect(dates.some(b=>b.textContent.includes('Fri, Sep 11'))).toBe(false);expect(proposeFlexibleWeek(state,{mode:'move',sessionId:occupied.logicalSessionId,toDate:'2026-09-11'}).error).toBeTruthy();
 expect(button('SWAP WORKOUTS')).toBeUndefined();expect(button('APPLY')).toBeUndefined();act(()=>button('Back').click());expect(document.activeElement).toBe(button('Choose another date'));expect(update).not.toHaveBeenCalled();
});
it('applies one canonical swap and selects Today, preserving the permanent plan and history',()=>{
 render();act(()=>{button('SWAP WORKOUTS').click();button('SWAP WORKOUTS').click();});expect(update).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 const next=update.mock.calls[0][0]();expect(next.selectedDate).toBe('2026-09-09');expect(next.flexibleWeek.sessions[source.logicalSessionId].scheduledDate).toBe('2026-09-09');expect(next.flexibleWeek.sessions[occupied.logicalSessionId].scheduledDate).toBe('2026-09-11');expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
});
it('date selection reviews both moves without applying before confirmation',()=>{
 render();act(()=>button('Choose another date').click());act(()=>document.querySelector('.flexible-week-dates button').click());expect(button('APPLY')).toBeDefined();expect(update).not.toHaveBeenCalled();
 act(()=>button('APPLY').click());expect(update).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
});
it('no conflict leaves the existing safe Apply flow with no relocation step',()=>{
 vi.setSystemTime(new Date('2026-09-10T12:00:00'));render();expect(button('APPLY')).toBeDefined();expect(button('Choose another date')).toBeUndefined();expect(button('SWAP WORKOUTS')).toBeUndefined();expect(document.querySelector('.flexible-week-dates')).toBeNull();
});
it('a changed schedule removes the stale Swap action and Cancel never mutates',()=>{
 render();render({...state,weekScheduleOverrides:{'2026-09-07':{}}});expect(button('SWAP WORKOUTS')).toBeUndefined();expect(document.querySelector('[role=alert]').textContent).toContain('schedule changed');act(()=>button('CANCEL').click());expect(update).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
});
