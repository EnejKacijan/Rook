import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { deserializeState,plannedWorkoutForDate,adaptedTemplateForToday,startWorkout,saveState,completeWorkout } from './domain.js';
import { applyFlexibleWeek,availabilityAdjustmentScope,flexibleSessions,moveWorkoutDestinations,proposeFlexibleWeek,temporaryScheduleReview } from './flexibleWeek.js';
import { buildCombinedProposal } from './combineWorkouts.js';
import { combinedTemplate } from './combinedWorkoutLifecycle.js';
import { syncEntities,applySyncDownloads } from './accountSyncModel.js';
import { insufficientDaysState } from './fixtures/insufficientDaysState.js';
const today='2026-10-04';
const request=(availableDates=[],resolutions=[],combinedProposal)=>({mode:'available',dateScope:'current-week',availableDates,resolutions,...(combinedProposal?{combinedProposal}:{})});
const ids=state=>availabilityAdjustmentScope(state).sources.map(s=>s.logicalSessionId);
const combine=state=>{const result=buildCombinedProposal(state,{sourceIds:ids(state),minutes:null,date:today});expect(result.status).toBe('ready');return result.proposal;};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(today+'T12:00:00'));localStorage.clear();});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('zero days keeps the one genuine unresolved occurrence and cannot apply a partial draft',()=>{
 const state=insufficientDaysState({single:true}),before=structuredClone(state),review=proposeFlexibleWeek(state,request());
 expect(review).toMatchObject({status:'insufficient-capacity',unresolvedCount:1,canApplySchedule:false});
 expect(review.availabilitySchedule).toHaveLength(1);expect(review.availabilitySchedule[0].toDate).toBeNull();
 expect(applyFlexibleWeek(state,review).status).toBe('stale');expect(state).toEqual(before);
});
it('Move later uses the canonical chooser beyond Sunday without absorbing next week or displacing it',()=>{
 const state=insufficientDaysState(),sourceIds=ids(state),draft=request([today]);
 const available=moveWorkoutDestinations(state,sourceIds[1],today,draft).filter(d=>d.available).map(d=>d.date);
 expect(available).toContain('2026-10-06');expect(available).not.toContain('2026-10-05');
 const review=proposeFlexibleWeek(state,request([today],[{mode:'move',sessionId:sourceIds[1],toDate:'2026-10-06'}]));
 expect(review).toMatchObject({status:'ready',unresolvedCount:0,canApplySchedule:true});expect(review.sourceScope.sessionIds).toEqual(sourceIds);
 const next=applyFlexibleWeek(state,review).state;
 expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
 expect(next.flexibleWeek.sessions[sourceIds[1]]).toMatchObject({originalDate:'2026-09-30',scheduledDate:'2026-10-06'});
 expect(flexibleSessions(next).filter(s=>s.originalDate>'2026-10-04').map(s=>[s.logicalSessionId,s.scheduledDate])).toEqual(flexibleSessions(state).filter(s=>s.originalDate>'2026-10-04').map(s=>[s.logicalSessionId,s.scheduledDate]));
 expect(plannedWorkoutForDate(next,'2026-10-06')?.id).toBe(state.program.days[1].id);
});
it('skip stores a canonical occurrence, no history/completion/credit, and leaves future definitions usable',()=>{
 const state=insufficientDaysState({single:true}),[id]=ids(state),review=proposeFlexibleWeek(state,request([],[{mode:'skip',sessionId:id}]));
 expect(review).toMatchObject({status:'ready',unresolvedCount:0,canApplySchedule:true});expect(review.availabilitySchedule[0]).toMatchObject({skipped:true,toDate:null});
 const next=applyFlexibleWeek(state,review).state;
 expect(next.flexibleWeek.sessions[id]).toMatchObject({skipped:true,originalDate:'2026-10-03'});
 expect(next.workouts).toEqual(state.workouts);expect(next.activeWorkout).toBeNull();
 expect(next.program.days).toEqual(state.program.days);expect(next.profile).toEqual(state.profile);
 expect(plannedWorkoutForDate(next,'2026-10-03')).toBeNull();expect(plannedWorkoutForDate(next,'2026-10-10')?.id).toBe(state.program.days[0].id);
 // Existing block skip resolution may advance a fully resolved block week; it
 // is not a real workout, logged set, or a rewrite of recurring definitions.
 expect(next.program.trainingBlock.resolvedSkips).toHaveLength(1);
});
it('two workouts on one day keep one unresolved until an explicit skip, then apply together',()=>{
 const state=insufficientDaysState(),sourceIds=ids(state),partial=proposeFlexibleWeek(state,request([today]));
 expect(partial).toMatchObject({placedCount:1,unresolvedCount:1});
 const review=proposeFlexibleWeek(state,request([today],[{mode:'skip',sessionId:sourceIds[1]}]));
 expect(review.status).toBe('ready');const next=applyFlexibleWeek(state,review).state;
 expect(next.flexibleWeek.sessions[sourceIds[0]].scheduledDate).toBe(today);expect(next.flexibleWeek.sessions[sourceIds[1]].skipped).toBe(true);
 expect(next.workouts).toEqual([]);expect(next.program.days).toEqual(state.program.days);
});
it('uses the canonical merged prescription, both reservations, one Today session, and no fake history',()=>{
 const state=insufficientDaysState(),combined=combine(state),before=structuredClone(state),review=proposeFlexibleWeek(state,request([today],[],combined));
 expect(review).toMatchObject({status:'ready',unresolvedCount:0,placedCount:2});expect(review.availabilitySchedule.every(s=>s.combined)).toBe(true);expect(state).toEqual(before);
 const next=applyFlexibleWeek(state,review).state;
 expect(next.todayAdaptation.id).toBe(combined.id);expect(next.todayAdaptation.workout.exercises).toEqual(combined.workout.exercises);
 expect(next.todayAdaptation.sourceSessions.map(s=>s.logicalSessionId)).toEqual(ids(state));
 expect(next.todayAdaptation.sourceSessions.every(s=>s.reservedBy===combined.id)).toBe(true);
 expect(flexibleSessions(next).filter(s=>ids(state).includes(s.logicalSessionId)).map(s=>s.status)).toEqual(['reserved','reserved']);
 expect(plannedWorkoutForDate(next,today)).toBeNull();expect(adaptedTemplateForToday(next,today)?.id).toBe(combined.id);expect(combinedTemplate(next,today)?.exercises).toEqual(combined.workout.exercises);
 expect(next.workouts).toEqual([]);expect(next.program).toEqual(state.program);
});
it('rejects incompatible, out-of-scope, unselected, and tampered combined resolutions',()=>{
 const incompatible=insufficientDaysState({incompatible:true});expect(buildCombinedProposal(incompatible,{sourceIds:ids(incompatible),minutes:null,date:today}).status).toBe('conflict');
 const state=insufficientDaysState(),combined=combine(state);
 expect(proposeFlexibleWeek(state,request([],[],combined)).status).toBe('conflict');
 const foreign=buildCombinedProposal(state,{sourceIds:[ids(state)[0],flexibleSessions(state).find(s=>s.originalDate==='2026-10-07').logicalSessionId],minutes:null,date:today}).proposal;
 expect(proposeFlexibleWeek(state,request([today],[],foreign)).status).toBe('conflict');
 const bad=structuredClone(combined);bad.workout.exercises[0].sets.push({...bad.workout.exercises[0].sets[0],id:'invented-set'});
 expect(proposeFlexibleWeek(state,request([today],[],bad)).status).toBe('conflict');
});
it.each(['move','skip','combine'])('%s survives durable reload and canonical sync convergence',mode=>{
 const state=insufficientDaysState(),sourceIds=ids(state),review=proposeFlexibleWeek(state,mode==='combine'?request([today],[],combine(state)):
   request([today],[{mode,sessionId:sourceIds[1],...(mode==='move'?{toDate:'2026-10-06'}:{})}]));
 const next=applyFlexibleWeek(state,review).state;expect(saveState(next)).toBe(true);
 const reloaded=deserializeState(JSON.parse(localStorage.getItem('lift-v2-state')));
 const remote=syncEntities(next),downloads=[...remote].map(([key,entity])=>({key,operation:'upsert',entity:{...entity,revision:2}}));
 const second=deserializeState(applySyncDownloads(state,downloads));
 expect(second.flexibleWeek).toEqual(reloaded.flexibleWeek);expect(second.todayAdaptation).toEqual(reloaded.todayAdaptation);
 expect(temporaryScheduleReview(second).unresolved).toEqual([]);
 expect(second.workouts).toEqual(state.workouts);expect(second.program.days).toEqual(state.program.days);
 if(mode==='combine')expect(adaptedTemplateForToday(second,today)?.id).toBe(next.todayAdaptation.id);
 else expect(second.flexibleWeek.sessions[sourceIds[1]].skipped).toBe(mode==='skip');
});
it('preserves completed and active occurrences and rejects stale schedule or combined reviews',()=>{
 const state=insufficientDaysState(),[id]=ids(state),proposal=proposeFlexibleWeek(state,request([today],[{mode:'skip',sessionId:ids(state)[1]}]));
 const changed=structuredClone(state);changed.flexibleWeek={schemaVersion:1,revision:9,sessions:{}};
 expect(applyFlexibleWeek(changed,proposal).status).toBe('stale');
 const combined=proposeFlexibleWeek(state,request([today],[],combine(state)));const profileChanged=structuredClone(state);profileChanged.profile.sessionMinutes=30;
 expect(applyFlexibleWeek(profileChanged,combined).status).not.toBe('applied');
 const source=flexibleSessions(state).find(s=>s.logicalSessionId===id);state.selectedDate=source.scheduledDate;state.activeWorkout=startWorkout(state,source.workout);
 expect(ids(state)).not.toContain(id);expect(proposeFlexibleWeek(state,request([],[{mode:'skip',sessionId:id}])).status).toBe('conflict');
 state.workouts=[{...state.activeWorkout,completedAt:Date.now()}];state.activeWorkout=null;
 expect(ids(state)).not.toContain(id);expect(proposeFlexibleWeek(state,request([],[{mode:'move',sessionId:id,toDate:'2026-10-06'}])).status).toBe('conflict');
});
it('three-workout mismatch composes one canonical pair and a later move atomically',()=>{
 let state=insufficientDaysState();const third={...structuredClone(state.program.days[0]),id:'third-source',name:'Upper B',weekday:'Thu'};
 third.exercises.forEach(e=>{e.id='third-'+e.id;e.sets.forEach(s=>s.id='third-'+s.id);});state.program.days.push(third);
 state.program.trainingBlock=null;state=deserializeState(state);state.program.trainingBlock.startDate='2026-09-28';
 const sourceIds=ids(state),pair=buildCombinedProposal(state,{sourceIds:sourceIds.slice(0,2),minutes:null,date:today});expect(pair.status).toBe('ready');
 const review=proposeFlexibleWeek(state,request([today],[{mode:'move',sessionId:sourceIds[2],toDate:'2026-10-06'}],pair.proposal));
 expect(review).toMatchObject({status:'ready',remainingSessions:3,unresolvedCount:0});
 const result=applyFlexibleWeek(state,review);expect(result.status).toBe('applied');expect(result.state.todayAdaptation.sourceSessions.map(s=>s.logicalSessionId)).toEqual(sourceIds.slice(0,2));
 expect(result.state.flexibleWeek.sessions[sourceIds[2]]).toMatchObject({originalDate:'2026-10-01',scheduledDate:'2026-10-06'});
 expect(result.state.program).toEqual(state.program);expect(result.state.workouts).toEqual([]);
});
it('combined completion uses one real performed-date history with both original source links',()=>{
 const state=insufficientDaysState(),review=proposeFlexibleWeek(state,request([today],[],combine(state))),next=applyFlexibleWeek(state,review).state;
 next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));
 next.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,weight:20,reps:8})));
 const completed=completeWorkout(next);expect(completed.workouts).toHaveLength(1);expect(completed.workouts[0]).toMatchObject({workoutDateKey:today,combinedSourcesResolved:true});
 expect(completed.workouts[0].adjustment.sourceSessions.map(s=>s.logicalSessionId)).toEqual(ids(state));
 expect(completed.workouts[0].adjustment.sourceSessions.map(s=>s.originalDate)).toEqual(['2026-09-28','2026-09-30']);
 expect(completed.program.days).toEqual(state.program.days);
});
it('unrelated partial sync retains already applied outcomes and does not invent a Needs a day state',()=>{
 const state=insufficientDaysState(),next=applyFlexibleWeek(state,proposeFlexibleWeek(state,request([today],[],combine(state)))).state;
 const profile=syncEntities(next).get('profile:"root"');const second=applySyncDownloads(next,[{key:'profile:"root"',operation:'upsert',entity:{...profile,revision:3}}]);
 expect(second.todayAdaptation).toEqual(next.todayAdaptation);expect(second.flexibleWeek).toEqual(next.flexibleWeek);expect(temporaryScheduleReview(second).unresolved).toEqual([]);
});
