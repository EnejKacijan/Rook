import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Today, RestTrainingSheet} from './App.jsx';
import {FlexibleWeekSheet, groupRescheduleCandidates, missedSessionDestinations} from './FlexibleWeekSheet.jsx';
import {todayMissedRestFixture} from './todayMissedRest.fixture.js';
import {isoDay, serializeState, deserializeState, plannedWorkoutForDate, startWorkout, completeWorkout, STORAGE_KEY} from './domain.js';
import {moveWorkoutCandidates, flexibleSessions, flexibleSessionById, missedFlexibleSessions, proposeFlexibleWeek, applyFlexibleWeek} from './flexibleWeek.js';
import {buildCombinedProposal, applyCombinedProposal} from './combineWorkouts.js';

let root;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(){const s=todayMissedRestFixture();s.program.days.forEach(d=>{d.name='NOGE B (FUNKCIJA)';d.workoutName=d.name;});return s;}
const ids=s=>moveWorkoutCandidates(s).map(i=>i.logicalSessionId);
const friday=s=>flexibleSessions(s).find(i=>i.scheduledDate==='2026-09-18');
const completeLink=(s,item,field='logicalSessionId')=>s.workouts.push({id:`history-${item.logicalSessionId}`,[field]:item.logicalSessionId,completedAt:'2026-09-19T11:00:00',workoutDateKey:'2026-09-19',name:item.workout.name,exercises:[]});
function move(s,id,toDate){const p=proposeFlexibleWeek(s,{mode:'move',sessionId:id,toDate});expect(p.status,p.error).toBe('ready');const r=applyFlexibleWeek(s,p);expect(r.status,r.error).toBe('applied');return r.state;}
function onlyFriday(){const s=fixture(),id=friday(s).logicalSessionId;flexibleSessions(s).filter(i=>i.logicalSessionId!==id).forEach(i=>completeLink(s,i));return s;}
function mount(element){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(element));}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const Header=({onBack})=>onBack?<button onClick={onBack}>Back</button>:null;

it('offers Friday missed on Saturday rest even with no upcoming uncompleted occurrence',()=>{
 const s=onlyFriday();expect(plannedWorkoutForDate(s,isoDay())).toBeNull();expect(ids(s)).toEqual([friday(s).logicalSessionId]);
 mount(<FlexibleWeekSheet state={s} Header={Header} request={{move:true}} update={()=>{}} close={()=>{}}/>);
 expect(document.querySelector('h1').textContent).toBe('Choose a workout');expect(document.querySelectorAll('[data-session-id]')).toHaveLength(1);
 expect(document.body.textContent).toContain('MISSED');expect(document.body.textContent).toContain('Missed · Fri, Sep 18');expect(document.body.textContent).not.toContain('UPCOMING');
 act(()=>document.querySelector('[data-session-id]').click());expect(button('Move to today')).toBeDefined();expect(document.querySelector('[data-move-date="2026-09-20"]').disabled).toBe(false);
});
it('groups two missed separately from ascending upcoming dates across the week boundary',()=>{
 const s=fixture(),mon=flexibleSessions(s).find(i=>i.scheduledDate==='2026-09-14');completeLink(s,mon);
 const groups=groupRescheduleCandidates(moveWorkoutCandidates(s));expect(groups.map(g=>g.label)).toEqual(['MISSED','UPCOMING']);
 expect(groups[0].sessions.map(i=>i.scheduledDate)).toEqual(['2026-09-16','2026-09-18']);
 expect(groups[1].sessions.map(i=>i.scheduledDate)).toEqual(['2026-09-21','2026-09-23','2026-09-25','2026-09-28','2026-09-30','2026-10-02']);
});
it('retains upcoming workouts later this week, sorted by current rather than original placement',()=>{
 vi.setSystemTime(new Date('2026-09-15T12:00:00'));let s=fixture();const mon=missedFlexibleSessions(s)[0];s=move(s,mon.logicalSessionId,'2026-09-17');
 expect(groupRescheduleCandidates(moveWorkoutCandidates(s))[0].sessions.map(i=>i.scheduledDate).slice(0,3)).toEqual(['2026-09-16','2026-09-17','2026-09-18']);
});
it('moves one stable ID to today, preserves original provenance/template/history and resolves its reminder after reload',()=>{
 const s=fixture(),item=friday(s),plan=structuredClone(s.program),history=structuredClone(s.workouts);const next=deserializeState(serializeState(move(s,item.logicalSessionId,isoDay())));
 expect(next.program).toEqual(plan);expect(next.workouts).toEqual(history);expect(Object.keys(next.flexibleWeek.sessions)).toEqual([item.logicalSessionId]);
 expect(flexibleSessionById(next,item.logicalSessionId)).toMatchObject({originalDate:'2026-09-18',scheduledDate:'2026-09-19',status:'planned'});
 expect(plannedWorkoutForDate(next,isoDay()).logicalSessionId).toBe(item.logicalSessionId);expect(plannedWorkoutForDate(next,'2026-09-18')).toBeNull();
 expect(missedFlexibleSessions(next)).toHaveLength(2);expect(missedFlexibleSessions(next).some(i=>i.logicalSessionId===item.logicalSessionId)).toBe(false);
 expect(flexibleSessions(next).filter(i=>i.logicalSessionId===item.logicalSessionId)).toHaveLength(1);
});
it('same names and template repetitions retain distinct eligibility, including completion elsewhere',()=>{
 const s=fixture(),item=friday(s);completeLink(s,item,'sourceOccurrenceId');
 expect(ids(s)).not.toContain(item.logicalSessionId);expect(moveWorkoutCandidates(s).filter(i=>i.workoutId===item.workoutId).map(i=>i.scheduledDate)).toEqual(['2026-09-25','2026-10-02']);
 expect(moveWorkoutCandidates(s).filter(i=>i.status==='missed')).toHaveLength(2);
});
it('a moved and then completed occurrence cannot reappear as a move source',()=>{
 let s=fixture();const item=friday(s);s=move(s,item.logicalSessionId,isoDay());s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,isoDay()));
 s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));s=deserializeState(serializeState(completeWorkout(s)));
 expect(ids(s)).not.toContain(item.logicalSessionId);expect(missedFlexibleSessions(s).some(i=>i.logicalSessionId===item.logicalSessionId)).toBe(false);
});
it.each(['skip','legacy skip','deleted','active','optional active'])('excludes a %s source',kind=>{
 let s=fixture();const item=friday(s);
 if(kind==='skip')s=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:item.logicalSessionId})).state;
 if(kind==='legacy skip')s.workoutOccurrenceOverrides={[item.scheduledDate]:{[item.workoutId]:{skipWorkout:true}}};
 if(kind==='deleted')s.program.days=s.program.days.filter(d=>d.id!==item.workoutId);
 if(kind==='active'){s.selectedDate=item.scheduledDate;s.activeWorkout=startWorkout(s,item.workout);}
 if(kind==='optional active')s.activeOptionalSession={id:'optional',date:item.scheduledDate};
 expect(ids(s)).not.toContain(item.logicalSessionId);expect(proposeFlexibleWeek(s,{mode:'move',sessionId:item.logicalSessionId,toDate:isoDay()}).status).toBe('conflict');
});
it('does not invent a new move source from a completed repeat',()=>{
 const s=fixture(),before=ids(s);s.workouts.push({id:'repeat-completed',source:'repeat',logicalSessionId:'repeat-only',completedAt:'2026-09-19T11:00:00',name:friday(s).workout.name});expect(ids(s)).toEqual(before);expect(ids(s)).not.toContain('repeat-only');
});
it('combined and repeated temporary workflows keep their global canonical scheduling guard',()=>{
 let s=fixture();const sourceIds=missedFlexibleSessions(s).slice(0,2).map(i=>i.logicalSessionId),p=buildCombinedProposal(s,{sourceIds,minutes:60});expect(p.status,p.error).toBe('ready');
 s=applyCombinedProposal(s,p.proposal,()=>true);expect(ids(s)).toEqual([]);expect(proposeFlexibleWeek(s,{mode:'move',sessionId:sourceIds[0],toDate:isoDay()}).status).toBe('conflict');
 const repeated=fixture();repeated.todayAdaptation={schemaVersion:1,mode:'repeat',id:'repeat'};expect(ids(repeated)).toEqual([]);
});
it('excludes Adjust Today reservations from the chooser and retains explicit keep/restore safety for direct requests',()=>{
 const s=fixture(),item=friday(s);s.todayAdaptation={id:'adjustment',mode:'less-time',programDayId:item.workoutId,date:item.scheduledDate,workout:{exercises:[]}};
 expect(ids(s)).not.toContain(item.logicalSessionId);const p=proposeFlexibleWeek(s,{mode:'move',sessionId:item.logicalSessionId,toDate:isoDay()});expect(p.adaptationConflict).toBe(true);
 expect(applyFlexibleWeek(s,p).status).toBe('conflict');expect(s.todayAdaptation.id).toBe('adjustment');
});
it('allows cross-week destinations within 14 days and rejects past/out-of-window dates',()=>{
 const s=fixture(),item=friday(s);expect(missedSessionDestinations(s,item.logicalSessionId)).toContain('2026-09-22');
 const next=move(s,item.logicalSessionId,'2026-09-22');expect(flexibleSessionById(next,item.logicalSessionId).originalDate).toBe('2026-09-18');
 for(const toDate of ['2026-09-17','2026-10-03'])expect(proposeFlexibleWeek(s,{mode:'move',sessionId:item.logicalSessionId,toDate}).status).toBe('conflict');
});
it('a previously advanced, now missed occurrence cannot move earlier than its original date',()=>{
 vi.setSystemTime(new Date('2026-09-18T12:00:00'));let s=fixture();const future=flexibleSessions(s).find(i=>i.scheduledDate==='2026-09-21'),fri=friday(s);
 s=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:fri.logicalSessionId})).state;s=move(s,future.logicalSessionId,'2026-09-18');vi.setSystemTime(new Date('2026-09-19T12:00:00'));
 expect(ids(s)).toContain(future.logicalSessionId);expect(missedSessionDestinations(s,future.logicalSessionId)).not.toContain(isoDay());
 expect(proposeFlexibleWeek(s,{mode:'move',sessionId:future.logicalSessionId,toDate:isoDay()}).status).toBe('conflict');expect(proposeFlexibleWeek(s,{mode:'move',sessionId:future.logicalSessionId,toDate:'2026-09-22'}).status).toBe('ready');
});
it.each(['planned','active','completed'])('rejects an occupied %s destination without overwriting either occurrence',kind=>{
 const s=fixture(),source=friday(s),target=flexibleSessions(s).find(i=>i.scheduledDate==='2026-09-21'),before=serializeState(s);
 if(kind==='active'){s.selectedDate=target.scheduledDate;s.activeWorkout=startWorkout(s,target.workout);}if(kind==='completed')completeLink(s,target);
 const snapshot=serializeState(s);expect(proposeFlexibleWeek(s,{mode:'move',sessionId:source.logicalSessionId,toDate:target.scheduledDate}).status).toBe('conflict');expect(serializeState(s)).toBe(snapshot);
 if(kind==='planned'){const result=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'swap',sessionId:source.logicalSessionId,otherSessionId:target.logicalSessionId}));expect(result.status).toBe('applied');expect(flexibleSessionById(result.state,source.logicalSessionId).scheduledDate).toBe(target.scheduledDate);expect(flexibleSessionById(result.state,target.logicalSessionId).scheduledDate).toBe(source.scheduledDate);expect(serializeState(s)).toBe(before);}
});
it.each(['completed','active','reservation','plan change'])('revalidates a reviewed move after %s changes',kind=>{
 const s=fixture(),item=friday(s),p=proposeFlexibleWeek(s,{mode:'move',sessionId:item.logicalSessionId,toDate:isoDay()});
 if(kind==='completed')completeLink(s,item);if(kind==='active'){s.selectedDate=item.scheduledDate;s.activeWorkout=startWorkout(s,item.workout);}if(kind==='reservation')s.todayAdaptation={id:'reserve',programDayId:item.workoutId,date:item.scheduledDate};if(kind==='plan change')s.program.version++;
 const snapshot=serializeState(s);expect(applyFlexibleWeek(s,p).status).toBe('stale');expect(serializeState(s)).toBe(snapshot);
});
it('does not offer a swap that would move a missed occurrence backward into another missed date',()=>{
 const s=fixture(),[a,b]=missedFlexibleSessions(s),snapshot=serializeState(s);
 expect(proposeFlexibleWeek(s,{mode:'swap',sessionId:b.logicalSessionId,otherSessionId:a.logicalSessionId}).status).toBe('conflict');
 mount(<FlexibleWeekSheet state={s} Header={Header} request={{sessionId:b.logicalSessionId,swap:true}} update={()=>{}} close={()=>{}}/>);
 expect([...document.querySelectorAll('[data-session-id]')].map(e=>e.dataset.sessionId)).not.toContain(a.logicalSessionId);expect(serializeState(s)).toBe(snapshot);
});
it('preserves closed-week backlog policy and does not expose a completed plan',()=>{
 const s=fixture();vi.setSystemTime(new Date('2026-09-22T12:00:00'));expect(moveWorkoutCandidates(s).filter(i=>i.status==='missed').every(i=>i.scheduledDate>='2026-09-21')).toBe(true);
 s.program.trainingBlock.completed=true;expect(ids(s)).toEqual([]);
});
it('shows the truthful empty copy after all occurrences resolve',()=>{
 const s=fixture();flexibleSessions(s).forEach(i=>completeLink(s,i));mount(<FlexibleWeekSheet state={s} Header={Header} request={{move:true}} update={()=>{}} close={()=>{}}/>);
 expect(document.querySelector('[role="status"]').textContent).toBe('No missed or upcoming workouts can be moved.');expect(document.querySelector('[data-session-id]')).toBeNull();
});
it('Rest-day entry → shared chooser → move today → Today → persisted reload uses the same occurrence once',()=>{
 const initial=onlyFriday(),id=friday(initial).logicalSessionId;
 function Harness(){const [state,setState]=useState(initial),[detail,setDetail]=useState({restTraining:true});const update=fn=>setState(current=>fn(structuredClone(current)));const close=()=>setDetail(null);
  return detail?.restTraining?<RestTrainingSheet date={isoDay()} state={state} update={update} close={close} setDetail={setDetail} setPage={()=>{}}/>:detail?.flexibleWeek?<FlexibleWeekSheet state={state} request={detail.flexibleWeek} Header={Header} update={update} close={close}/>:<Today state={state} update={update} setPage={()=>{}} setDetail={setDetail}/>;
 }
 mount(<Harness/>);act(()=>document.querySelector('.rest-training-option').click());expect(document.querySelector('h1').textContent).toBe('Choose a workout');
 act(()=>document.querySelector('[data-session-id]').click());act(()=>button('Move to today').click());act(()=>button('APPLY MOVE').click());expect(document.body.textContent).toContain('Workout moved');act(()=>button('DONE').click());
 expect(button('START WORKOUT')).toBeDefined();expect(document.querySelector('.today-missed-summary')).toBeNull();
 const reloaded=deserializeState(localStorage.getItem(STORAGE_KEY));expect(plannedWorkoutForDate(reloaded,isoDay()).logicalSessionId).toBe(id);expect(missedFlexibleSessions(reloaded)).toEqual([]);expect(Object.keys(reloaded.flexibleWeek.sessions)).toEqual([id]);expect(reloaded.program).toEqual(initial.program);
});
