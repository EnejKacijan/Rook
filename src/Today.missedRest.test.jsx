import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today,TodayActionsSheet,RestTrainingSheet} from './App.jsx';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {todayMissedRestFixture} from './todayMissedRest.fixture.js';
import {missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {dismissMissedReminder} from './missedWorkoutActions.js';
import {deserializeState,serializeState,isoDay,startWorkout,completeWorkout} from './domain.js';
import {canUseWorkoutToday} from './useWorkoutToday.js';
let root,detail,update;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));localStorage.clear();const host=document.createElement('div');document.body.append(host);root=createRoot(host);detail=vi.fn();update=vi.fn();});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=element=>act(()=>element.click());
const draw=state=>act(()=>root.render(<Today state={state} update={update} setPage={()=>{}} setDetail={detail}/>));
const overflow=state=>act(()=>root.render(<TodayActionsSheet state={state} date={isoDay()} hasWorkout={false} update={update} setDetail={detail} close={()=>{}}/>));
const Header=({onBack})=>onBack?<button onClick={onBack}>Back</button>:null;
const sheet=(state,request)=>act(()=>root.render(<FlexibleWeekSheet state={state} request={request} update={update} setDetail={detail} close={()=>{}} Header={Header}/>));

it.each([0,1,2,3])('rest hierarchy and routing with %i missed occurrences',count=>{
 const state=todayMissedRestFixture({count}),before=serializeState(state);draw(state);
 const rest=document.querySelector('.rest-day-state'),summary=document.querySelector('.today-missed-row');
 expect(rest).not.toBeNull();expect(rest.textContent).toContain('This is a planned recovery day.');
 expect(document.body.textContent).not.toMatch(/View all|Oldest:|Train today instead|Choose exercises as you go/);
 expect(Boolean(summary)).toBe(count>0);
 if(count){expect(rest.contains(summary)).toBe(true);expect(rest.querySelector('p').compareDocumentPosition(summary)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(summary.compareDocumentPosition(rest.querySelector('.rest-up-next'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();click(document.querySelector('.today-missed-open'));expect(detail).toHaveBeenCalledWith({flexibleWeek:count===1?{sessionId:missedFlexibleSessions(state)[0].logicalSessionId}:{missed:true}});}
 expect(rest.querySelector('.rest-up-next-row').tagName).toBe('BUTTON');expect(rest.querySelector('.rest-freestyle-action').textContent).toBe('+ Start freestyle workout');
 expect(serializeState(state)).toBe(before);expect(update).not.toHaveBeenCalled();
});
it.each([1,2,3])('dismissed %i occurrences remain accessible through overflow after reload',count=>{
 const before=todayMissedRestFixture({count}),state=deserializeState(serializeState(dismissMissedReminder(before,{persist:()=>true})));
 draw(state);expect(document.querySelector('.today-missed-row')).toBeNull();overflow(state);click(button('Missed workouts'));
 const request=detail.mock.calls[0][0].flexibleWeek;expect(request).toEqual(count===1?{sessionId:missedFlexibleSessions(state)[0].logicalSessionId}:{missed:true});
 sheet(state,request);expect(document.querySelector('h1').textContent).toBe(count===1?'Move UPPER B':'Choose a missed session');
 expect(update).not.toHaveBeenCalled();expect(state.flexibleWeek).toEqual(before.flexibleWeek);expect(state.workouts).toEqual(before.workouts);
});
it('the single missed action also bypasses the chooser through Adjust week',()=>{
 const state=todayMissedRestFixture({count:1});sheet(state,{});click([...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('I missed a workout')));
 expect(document.querySelector('h1').textContent).toBe('Move UPPER B');expect(document.body.textContent).toContain('Fri, Sep 18');expect(update).not.toHaveBeenCalled();
});
it('same-name rows retain dates and canonical targeting after plan order changes',()=>{
 const state=todayMissedRestFixture({count:3}),missed=missedFlexibleSessions(state);sheet(state,{missed:true});
 expect([...document.querySelectorAll('[data-session-id]')].map(b=>b.textContent)).toEqual(missed.map(s=>`UPPER BMissed · ${new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(s.scheduledDate+'T12:00:00'))}`));
 const target=missed[2],row=document.querySelector(`[data-session-id="${target.logicalSessionId}"]`);state.program.days.reverse();sheet({...state},{missed:true});expect(document.querySelector(`[data-session-id="${target.logicalSessionId}"]`)).toBe(row);
 click(row);expect(document.body.textContent).toContain('Currently Fri, Sep 18');click(button('Use this workout today'));expect(document.body.textContent).toContain('From Fri, Sep 18, 2026.');expect(update).not.toHaveBeenCalled();click(button('APPLY'));
 const next=update.mock.calls[0][0]();expect(missedFlexibleSessions(next).map(s=>s.logicalSessionId)).toEqual(missed.slice(0,2).map(s=>s.logicalSessionId));
});
it.each(['move','skip','complete'])('resolved missed occurrence leaves reminder and list: %s',kind=>{
 let state=todayMissedRestFixture({count:2});const target=missedFlexibleSessions(state)[0];
 if(kind==='complete'){state.activeWorkout=startWorkout({...state,selectedDate:target.scheduledDate},target.workout);state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{reps:8,weight:20,completed:true})));state=completeWorkout(state);state.selectedDate=isoDay();}
 else state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:kind,sessionId:target.logicalSessionId,...(kind==='move'?{toDate:'2026-09-20'}:{})})).state;
 const remaining=missedFlexibleSessions(state);expect(remaining).toHaveLength(1);expect(remaining[0].logicalSessionId).not.toBe(target.logicalSessionId);draw(deserializeState(serializeState(state)));click(document.querySelector('.today-missed-open'));expect(detail).toHaveBeenCalledWith({flexibleWeek:{sessionId:remaining[0].logicalSessionId}});
});
it('planned Today retains its hero and active Today suppresses the reminder while preserving overflow access',()=>{
 vi.setSystemTime(new Date('2026-09-18T12:00:00'));let state=todayMissedRestFixture({count:2});draw(state);expect(document.querySelector('.rest-day-state')).toBeNull();expect(document.querySelector('.today-missed-row')).not.toBeNull();expect(button('START WORKOUT')).toBeDefined();
 state=todayMissedRestFixture({count:2,active:true});draw(state);expect(button('RESUME WORKOUT')).toBeDefined();expect(document.querySelector('.today-missed-row')).toBeNull();overflow(state);expect(button('Rest-day activities')).toBeUndefined();click(button('Missed workouts'));sheet(state,{sessionId:missedFlexibleSessions(state)[0].logicalSessionId});expect(button('Use this workout today')).toBeUndefined();expect(canUseWorkoutToday(state,{sessionId:missedFlexibleSessions(state)[0].logicalSessionId})).toBe(false);
});
it('rest overflow preserves the full optional-activity menu without an ambiguous standalone CTA',()=>{
 const state=todayMissedRestFixture({count:0});draw(state);expect(button('Train today instead')).toBeUndefined();overflow(state);expect(button('Missed workouts')).toBeUndefined();click(button('Rest-day activities'));expect(detail).toHaveBeenCalledWith({restTraining:isoDay()});
 act(()=>root.render(<RestTrainingSheet state={state} date={isoDay()} update={update} setDetail={detail} setPage={()=>{}} close={()=>{}}/>));
 for(const label of ['MOVE A WORKOUT','LIGHT CARDIO','MOBILITY / RECOVERY','ASK COACH'])expect(document.body.textContent).toContain(label);expect(update).not.toHaveBeenCalled();
});
