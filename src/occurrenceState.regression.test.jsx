import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today,TodayActionsSheet} from './App.jsx';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {UseWorkoutTodaySheet} from './UseWorkoutTodaySheet.jsx';
import {MissedWorkoutSummary} from './missedWorkoutPresentation.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {plannedWorkoutForDate,startWorkout,completeWorkout,weekKey,serializeState,deserializeState,adaptedTemplateForToday,workoutPerformedDate} from './domain.js';
import {flexibleOccurrenceForDate,flexibleSessionById,missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,actionableMissedSession} from './flexibleWeek.js';
import {proposeWorkoutToday,applyWorkoutToday,canUseWorkoutToday} from './useWorkoutToday.js';
import {completedWorkoutsForDate} from './completedWorkoutsForDate.js';
import {calendarDayStates} from './workoutCalendar.js';
import {buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';

let root;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(){const s=createReturningUserFixture(2);s.workouts=[];s.activeWorkout=null;s.todayAdaptation=null;s.flexibleWeek=null;s.weekScheduleOverrides={};s.workoutOccurrenceOverrides={};s.program.trainingBlock.startDate='2026-09-01';s.program.createdAt='2026-09-01T12:00:00';s.selectedDate='2026-09-17';s.selectedDay='Thu';return s;}
function finish(s){s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));return completeWorkout(s);}
function render(s){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>));}
function mount(element){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(element));}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const Header=({title})=><h2>{title}</h2>;
it('reproduces a legacy week move whose completed identity differs from the selected scheduled date',()=>{
 let s=fixture();const tue=s.program.days.find(d=>d.weekday==='Tue'),thu=s.program.days.find(d=>d.weekday==='Thu');tue.name='UPPER B';
 s.weekScheduleOverrides[weekKey(s.selectedDate)]={[tue.id]:'2026-09-17',[thu.id]:'2026-09-15'};
 s.program.userEdited=true;s=deserializeState(serializeState(finish(s)),{strict:true});render(s);
 expect(s.workouts[0].originalScheduledDate).toBe('2026-09-15');
 expect(document.body.textContent).not.toContain('missed · not performed');
 expect(document.body.textContent).toContain('Performed');
 expect(document.body.textContent).not.toContain('Train today instead');
});
it('A unresolved Thursday exposes exactly the same eligible Train today request as the action',()=>{
 const s=fixture(),item=flexibleOccurrenceForDate(s,s.selectedDate);render(s);
 expect(item.status).toBe('missed');expect(document.body.textContent).toContain('missed · not performed');expect(button('Train today instead')).toBeTruthy();
 expect(canUseWorkoutToday(s,{sessionId:item.logicalSessionId})).toBe(true);expect(proposeWorkoutToday(s,{sessionId:item.logicalSessionId}).status).toBe('ready');
 const plan=structuredClone(s.program),next=applyWorkoutToday(s,proposeWorkoutToday(s,{sessionId:item.logicalSessionId}),{persist:()=>true});
 expect(plannedWorkoutForDate(next,'2026-09-18').logicalSessionId).toBe(item.logicalSessionId);expect(next.program).toEqual(plan);expect(flexibleSessionById(next,item.logicalSessionId).originalDate).toBe('2026-09-17');
});
it.each(['logicalSessionId','sourceOccurrenceId'])('B explicit %s resolves Thursday while the one History fact stays Friday',field=>{
 let s=fixture();const item=flexibleOccurrenceForDate(s,s.selectedDate);s=finish(s);
 if(field==='sourceOccurrenceId'){s.workouts[0].sourceOccurrenceId=item.logicalSessionId;delete s.workouts[0].logicalSessionId;delete s.workouts[0].programDayId;delete s.workouts[0].templateId;}
 const history=structuredClone(s.workouts);render(s);
 expect(document.body.textContent).not.toContain('missed · not performed');expect(button('Train today instead')).toBeUndefined();expect(button('View completed workout')).toBeTruthy();expect(button('Repeat today')).toBeTruthy();
 expect(flexibleOccurrenceForDate(s,s.selectedDate).status).toBe('completed');expect(completedWorkoutsForDate(s.workouts,'2026-09-17')).toEqual([]);expect(completedWorkoutsForDate(s.workouts,'2026-09-18')).toHaveLength(1);
 expect(calendarDayStates(s,['2026-09-17','2026-09-18'])['2026-09-17'].complete).toBe(false);expect(s.workouts).toEqual(history);
 const reloaded=deserializeState(serializeState(s));expect(flexibleOccurrenceForDate(reloaded,'2026-09-17').status).toBe('completed');
});
it('C Repeat creates a fresh session with no completed actuals and unchanged Friday history',()=>{
 const s=finish(fixture()),history=structuredClone(s.workouts),record=s.workouts[0];
 const next=applyWorkoutToday(s,proposeWorkoutToday(s,{workoutId:record.id}),{persist:()=>true});const template=adaptedTemplateForToday(next);
 expect(template.logicalSessionId).not.toBe(record.logicalSessionId);expect(template.exercises.flatMap(e=>e.sets).every(set=>!set.completed&&set.reps===null&&set.weight===null&&set.rir===null)).toBe(true);
 next.activeWorkout=startWorkout(next,template);expect(next.activeWorkout.id).not.toBe(record.id);expect(next.activeWorkout.repeatedFromWorkoutId).toBe(record.id);expect(next.workouts).toEqual(history);expect(workoutPerformedDate(next.workouts[0])).toBe('2026-09-18');
});
it('D a completion after review removes Apply and offers working History/Repeat recovery without stale mutation',()=>{
 const s=fixture(),item=flexibleOccurrenceForDate(s,s.selectedDate),request={sessionId:item.logicalSessionId},review=proposeWorkoutToday(s,request),update=vi.fn(),setDetail=vi.fn();
 const sheet=state=><UseWorkoutTodaySheet state={state} update={update} close={()=>{}} Header={Header} request={request} setDetail={setDetail}/>;
 mount(sheet(s));expect(button('APPLY')).toBeTruthy();const completed=finish(structuredClone(s)),history=structuredClone(completed.workouts);
 expect(()=>applyWorkoutToday(completed,review,{persist:()=>true})).toThrow(/changed/);
 act(()=>root.render(sheet(completed)));expect(button('APPLY')).toBeUndefined();expect(document.body.textContent).toContain('Performed');
 act(()=>button('View completed workout').click());expect(setDetail).toHaveBeenCalledWith({completedWorkout:completed.workouts[0].id});
 act(()=>button('Repeat today').click());expect(document.body.textContent).toContain('Start a new session');expect(button('APPLY')).toBeTruthy();expect(update).not.toHaveBeenCalled();expect(completed.workouts).toEqual(history);
});
it('E same-named sessions in different weeks resolve only the explicit linked occurrence',()=>{
 let s=fixture();s.program.days.forEach(d=>d.name='UPPER B');s.selectedDate='2026-09-10';s=finish(s);s.selectedDate='2026-09-17';render(s);
 expect(flexibleOccurrenceForDate(s,'2026-09-10').status).toBe('completed');expect(flexibleOccurrenceForDate(s,'2026-09-17').status).toBe('missed');expect(button('Train today instead')).toBeTruthy();
 s.workouts[0].sourceOccurrenceId=s.workouts[0].logicalSessionId;s.workouts[0].originalScheduledDate='2026-09-17';expect(flexibleOccurrenceForDate(s,'2026-09-17').status).toBe('missed');
});
it('F Tuesday moved to Thursday then completed Thursday resolves both source and destination',()=>{
 let s=fixture();s.program.days=s.program.days.filter(d=>d.weekday!=='Thu');vi.setSystemTime(new Date('2026-09-15T12:00:00'));
 const source=flexibleOccurrenceForDate(s,'2026-09-15');s=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-09-17'})).state;
 vi.setSystemTime(new Date('2026-09-17T12:00:00'));s.selectedDate='2026-09-17';s=finish(s);s.selectedDate='2026-09-15';render(s);
 expect(flexibleOccurrenceForDate(s,'2026-09-15').status).toBe('completed');expect(flexibleOccurrenceForDate(s,'2026-09-17').status).toBe('completed');expect(missedFlexibleSessions(s).some(i=>i.logicalSessionId===source.logicalSessionId)).toBe(false);
 expect(document.body.textContent).toContain('Performed Thursday, Sep 17');expect(button('Train today instead')).toBeUndefined();expect(completedWorkoutsForDate(s.workouts,'2026-09-17')).toHaveLength(1);
});
it('G reminder and chooser candidates drop 4 → 3 immediately and after reload',()=>{
 vi.setSystemTime(new Date('2026-09-20T12:00:00'));const s=fixture();expect(missedFlexibleSessions(s)).toHaveLength(4);const stale=missedFlexibleSessions(s).find(i=>i.scheduledDate===s.selectedDate);
 mount(<MissedWorkoutSummary state={s} onSelect={()=>{}}/>);expect(document.body.textContent).toContain('4 missed workouts');const completed=finish(s);
 act(()=>root.render(<MissedWorkoutSummary state={completed} onSelect={()=>{}}/>));expect(document.body.textContent).toContain('3 missed workouts');expect(missedFlexibleSessions(completed)).toHaveLength(3);expect(actionableMissedSession(completed,stale)).toBe(false);expect(missedFlexibleSessions(deserializeState(serializeState(completed)))).toHaveLength(3);
});
it('H ambiguous legacy name/date evidence never fabricates a completion or rewrites history',()=>{
 const s=fixture();s.workouts=[{id:'legacy',name:plannedWorkoutForDate(s,s.selectedDate).name,completedAt:'2026-09-18T12:00:00',exercises:[]}];const original=structuredClone(s);
 expect(flexibleOccurrenceForDate(s,s.selectedDate).status).toBe('missed');render(s);expect(button('Train today instead')).toBeTruthy();expect(s).toEqual(original);
});
it('completed historical overflow repeats the linked record without duplicating its visible detail action',()=>{
 const s=finish(fixture()),detail=vi.fn();mount(<TodayActionsSheet state={s} update={()=>{}} close={()=>{}} setDetail={detail} date="2026-09-17" hasWorkout/>);
 expect(document.body.textContent).not.toContain('View completed workout');expect(document.body.textContent).toContain('Repeat today');expect(document.body.textContent).not.toContain('Train today instead');expect(document.body.textContent).not.toContain('Move to another day');expect(document.body.textContent).not.toContain('Swap with another workout');
 act(()=>button('Repeat today').click());expect(detail).toHaveBeenCalledWith({useWorkoutToday:{workoutId:s.workouts[0].id}});
});
it.each(['active','skipped'])('a %s occurrence never receives missed copy or a Train today CTA',status=>{
 let s=fixture();const item=flexibleOccurrenceForDate(s,s.selectedDate);
 if(status==='active')s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));else s=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:item.logicalSessionId})).state;
 render(s);expect(document.body.textContent).not.toContain('missed · not performed');expect(button('Train today instead')).toBeUndefined();expect(flexibleOccurrenceForDate(s,s.selectedDate).status).toBe(status);
});
it('a legacy explicit skip stays skipped without changing its saved override',()=>{
 const s=fixture(),item=flexibleOccurrenceForDate(s,s.selectedDate);s.workoutOccurrenceOverrides[s.selectedDate]={[item.workoutId]:{skipWorkout:true}};const snapshot=structuredClone(s);
 render(s);expect(document.body.textContent).toContain('Skipped this session');expect(button('Train today instead')).toBeUndefined();expect(s).toEqual(snapshot);
});
it('combined reservations and valid resolutions share the same historical presentation and record link',()=>{
 let s=fixture();const item=flexibleOccurrenceForDate(s,s.selectedDate),other=flexibleOccurrenceForDate(s,'2026-09-15');
 const proposal=buildCombinedProposal(s,{sourceIds:[other.logicalSessionId,item.logicalSessionId],minutes:60});expect(proposal.status).toBe('ready');
 s=applyCombinedProposal(s,proposal.proposal,()=>true);s.selectedDate='2026-09-17';render(s);expect(document.body.textContent).toContain('Included in a combined workout');expect(button('Train today instead')).toBeUndefined();
 s.selectedDate='2026-09-18';s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));s=completeWorkout(s);s.selectedDate='2026-09-17';
 act(()=>root.render(<Today state={s} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>));expect(flexibleOccurrenceForDate(s,s.selectedDate).status).toBe('combined');expect(button('View completed workout')).toBeTruthy();expect(document.body.textContent).toContain('Performed Friday, Sep 18');expect(button('Train today instead')).toBeUndefined();expect(s.workouts).toHaveLength(1);
});
it('a stale request opened after completion immediately exposes the correct recovery record',()=>{
 const s=finish(fixture()),item=flexibleOccurrenceForDate(s,s.selectedDate),update=vi.fn();
 mount(<UseWorkoutTodaySheet state={s} update={update} close={()=>{}} Header={Header} request={{sessionId:item.logicalSessionId}} setDetail={()=>{}}/>);
 expect(button('View completed workout')).toBeTruthy();expect(button('Repeat today')).toBeTruthy();expect(button('APPLY')).toBeUndefined();expect(update).not.toHaveBeenCalled();
});
it('a legacy explicit link without a reliable performed date resolves without inventing one',()=>{
 const s=finish(fixture());Object.assign(s.workouts[0],{startedAt:null,completedAt:true,endedAt:null,workoutDateKey:null,canonicalPlanDate:null});
 render(s);expect(document.body.textContent).toContain('Completed workout');expect(button('View completed workout')).toBeTruthy();expect(button('Train today instead')).toBeUndefined();
 act(()=>root.render(<UseWorkoutTodaySheet state={s} update={()=>{}} close={()=>{}} Header={Header} request={{sessionId:s.workouts[0].logicalSessionId}} setDetail={()=>{}}/>));expect(document.body.textContent).toContain('Completed workout.');
 act(()=>button('Repeat today').click());expect(button('APPLY')).toBeTruthy();
});
it('the rest-day move chooser also rejects an explicitly resolved future occurrence',()=>{
 let s=fixture();s.selectedDate='2026-09-19';const item=flexibleOccurrenceForDate(s,s.selectedDate);s=finish(s);s.workouts[0].sourceOccurrenceId=item.logicalSessionId;delete s.workouts[0].logicalSessionId;delete s.workouts[0].programDayId;
 mount(<FlexibleWeekSheet state={s} Header={Header} request={{move:true}} update={()=>{}} close={()=>{}}/>);
 expect(document.querySelector(`[data-session-id="${item.logicalSessionId}"]`)).toBeNull();
 expect(document.body.textContent).toContain('Select a missed or upcoming workout to move.');
});
