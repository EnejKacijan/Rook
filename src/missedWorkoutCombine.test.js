import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {combineExample} from './combineWorkouts.fixture.js';
import {missedCombineSources,reviewMissedWorkoutCombine,applyMissedWorkoutCombine} from './missedWorkoutCombine.js';
import {flexibleSessions,missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {deserializeState,serializeState,startWorkout,completeWorkout,adaptedTemplateForToday,validateProgram,estimateWorkoutMinutes} from './domain.js';
import {cancelCombinedWorkout} from './combinedWorkoutLifecycle.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const request=(state,extra={})=>({sourceIds:missedFlexibleSessions(state).slice(0,2).map(source=>source.logicalSessionId),minutes:60,...extra});
function withToday(){
  const state=combineExample();Object.assign(state.profile,{daysPerWeek:3,availableDays:['Mon','Wed','Sat']});
  const day={...structuredClone(state.program.days[1]),id:'today-source',weekday:'Sat',name:'Lower'};
  day.exercises=day.exercises.slice(0,3).map((exercise,index)=>({...exercise,id:`third-${index}`,exerciseId:['leg-press','seated-leg-curl','standing-calf-raise-machine'][index],sets:exercise.sets.slice(0,3).map((set,i)=>({...set,id:`third-${index}-${i}`}))}));
  day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile);state.program.days.push(day);return deserializeState(state,{strict:true});
}

it.each([['2026-09-07',0],['2026-09-08',1],['2026-09-10',2],['2026-09-14',0]])('only offers unresolved occurrences in the current week on %s', (day,count)=>{
  vi.setSystemTime(new Date(`${day}T12:00:00`));const state=combineExample(),before=serializeState(state);
  expect(missedCombineSources(state).filter(source=>source.status==='missed')).toHaveLength(count);expect(serializeState(state)).toBe(before);
});
it.each([45,60,75,90,null])('builds a bounded combined session for %s minutes from two missed sources',minutes=>{
  const state=combineExample(),before=serializeState(state),review=reviewMissedWorkoutCombine(state,request(state,{minutes}));
  expect(review.status,review.error).toBe('ready');expect(review.proposal.requestedMinutes).toBe(minutes);
  expect(review.proposal.workout.exercises.length).toBeLessThan(state.program.days.flatMap(day=>day.exercises).length);
  if(minutes!==null)expect(review.proposal.estimatedMinutes).toBeLessThanOrEqual(minutes);
  expect(applyMissedWorkoutCombine(state,review,review.proposal,{persist:()=>true}).todayAdaptation.requestedMinutes).toBe(minutes);
  expect(serializeState(state)).toBe(before);
});
it('refuses an unrealistically short combination instead of dropping essential movements',()=>{
  const state=combineExample(),before=serializeState(state);
  const result=reviewMissedWorkoutCombine(state,request(state,{minutes:30}));expect(result.status).toBe('conflict');expect(result.error).toMatch(/cannot fit/);expect(serializeState(state)).toBe(before);
});
it('reviews a third workout move without writes and saves both operations atomically, retaining all identities on reload',()=>{
  const state=withToday(),before=serializeState(state),input=request(state),choice=reviewMissedWorkoutCombine(state,input);
  const valid=validateProgram(state.program,null,{preserveSchedule:true});expect(valid.valid,JSON.stringify(valid.errors)).toBe(true);
  expect(choice.status).toBe('choose-date');expect(choice.displaced.workoutId).toBe('today-source');expect(choice.dates).toContain('2026-09-13');
  expect(choice.dates).not.toContain('2026-09-14');expect(serializeState(state)).toBe(before);
  const reviewed=reviewMissedWorkoutCombine(state,{...input,displacedToDate:'2026-09-13'});
  expect(reviewed.status,reviewed.error).toBe('ready');expect(reviewed.move).toMatchObject({workoutId:'today-source',fromDate:'2026-09-12',toDate:'2026-09-13'});
  const persist=vi.fn(()=>true),next=deserializeState(serializeState(applyMissedWorkoutCombine(state,reviewed,reviewed.proposal,{persist})),{strict:true});
  expect(persist).toHaveBeenCalledOnce();expect(serializeState(state)).toBe(before);expect(next.program).toEqual(state.program);expect(next.workouts).toEqual(state.workouts);
  expect(next.todayAdaptation.sourceSessions.map(source=>source.logicalSessionId)).toEqual(input.sourceIds);
  expect(flexibleSessions(next).filter(source=>source.status==='reserved')).toHaveLength(2);
  expect(flexibleSessions(next).find(source=>source.workoutId==='today-source'&&source.originalDate==='2026-09-12').scheduledDate).toBe('2026-09-13');
  expect(new Set(flexibleSessions(next).map(source=>source.logicalSessionId)).size).toBe(flexibleSessions(next).length);
});
it('including today in the pair needs no displacement and leaves the other missed workout unresolved',()=>{
  const state=withToday(),sources=missedCombineSources(state),today=sources.find(source=>source.scheduledDate==='2026-09-12');
  const input={sourceIds:[sources[0].logicalSessionId,today.logicalSessionId],minutes:60};
  const review=reviewMissedWorkoutCombine(state,input);expect(review.status,review.error).toBe('ready');expect(review.move).toBeNull();
  const next=applyMissedWorkoutCombine(state,review,review.proposal,{persist:()=>true});
  expect(missedFlexibleSessions(next).map(source=>source.logicalSessionId)).toEqual([sources[1].logicalSessionId]);
});
it.each(['activeWorkout','activeOptionalSession','todayAdaptation'])('does not replace a pending %s',field=>{
  const state=withToday();state[field]={id:'owned'};const before=serializeState(state);
  expect(reviewMissedWorkoutCombine(state,request(state)).status).toBe('conflict');expect(serializeState(state)).toBe(before);
});
it.each(['2026-09-11','2026-09-12','2026-09-14','2026-10-31','invalid'])('rejects a past, occupied or invalid displacement %s',displacedToDate=>{
  const state=withToday(),before=serializeState(state);
  expect(reviewMissedWorkoutCombine(state,request(state,{displacedToDate})).status).toBe('conflict');expect(serializeState(state)).toBe(before);
});
it('failed storage saves neither the third move nor source reservations and a retry succeeds once',()=>{
  const state=withToday(),review=reviewMissedWorkoutCombine(state,request(state,{displacedToDate:'2026-09-13'})),before=serializeState(state);
  const failed=vi.fn(()=>false);expect(()=>applyMissedWorkoutCombine(state,review,review.proposal,{persist:failed})).toThrow(/save/);
  expect(failed).toHaveBeenCalledOnce();expect(serializeState(state)).toBe(before);
  const next=applyMissedWorkoutCombine(state,review,review.proposal,{persist:()=>true});expect(next.todayAdaptation.sourceSessions).toHaveLength(2);
  expect(()=>applyMissedWorkoutCombine(next,review,review.proposal,{persist:()=>true})).toThrow(/changed/);
});
it.each(['completion','plan','profile','midnight'])('rejects a reviewed combination after %s changes',kind=>{
  const state=combineExample(),review=reviewMissedWorkoutCombine(state,request(state)),persist=vi.fn(()=>true);
  if(kind==='completion')state.workouts.push({id:'external',logicalSessionId:review.request.sourceIds[0],completedAt:Date.now(),exercises:[]});
  if(kind==='plan')state.program.version=(state.program.version||0)+1;
  if(kind==='profile')state.profile.equipment=['dumbbells'];
  if(kind==='midnight')vi.setSystemTime(new Date('2026-09-13T00:01:00'));
  expect(()=>applyMissedWorkoutCombine(state,review,review.proposal,{persist})).toThrow(/changed/);expect(persist).not.toHaveBeenCalled();
});
it('keeps identically named sources distinct, releases them on cancel, and completes both only after a full session',()=>{
  const state=combineExample();state.program.days.forEach(day=>day.name='My workout');const input=request(state);
  const review=reviewMissedWorkoutCombine(state,input);let next=applyMissedWorkoutCombine(state,review,review.proposal,{persist:()=>true});
  const cancelled=cancelCombinedWorkout(next);expect(missedFlexibleSessions(cancelled).map(source=>source.logicalSessionId)).toEqual(input.sourceIds);
  next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));
  next.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,weight:20,reps:8})));
  next=deserializeState(serializeState(completeWorkout(next)),{strict:true});
  expect(next.workouts).toHaveLength(1);expect(next.workouts[0].combinedSourcesResolved).toBe(true);expect(missedFlexibleSessions(next)).toHaveLength(0);
});
it('skipped and completed sources cannot reappear; a completed block has no recovery combination',()=>{
  let state=combineExample(),input=request(state);state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:input.sourceIds[0]})).state;
  expect(reviewMissedWorkoutCombine(state,input).status).toBe('conflict');
  state=combineExample();state.program.trainingBlock.completed=true;
  expect(missedCombineSources(state)).toEqual([]);expect(reviewMissedWorkoutCombine(state,input).status).toBe('conflict');
});
it.each([[],['same','same'],['old','missing']])('rejects invalid source identities %j without changing any data',sourceIds=>{
  const state=combineExample(),before=serializeState(state);expect(reviewMissedWorkoutCombine(state,{sourceIds,minutes:60}).status).toBe('conflict');expect(serializeState(state)).toBe(before);
});
it('returns an actionable schedule review for an outdated move',()=>{
  let state=combineExample();const source=missedFlexibleSessions(state)[0];state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-09-13'})).state;
  state.program.version=(state.program.version||0)+1;const before=serializeState(state);
  const result=reviewMissedWorkoutCombine(state,{sourceIds:[source.logicalSessionId,'pull-source:2026-09-09'],minutes:60});expect(result.scheduleReviewRequired).toBe(true);expect(serializeState(state)).toBe(before);
});
it('keeps both sources unresolved after finishing the combined workout early',()=>{
  const state=combineExample(),review=reviewMissedWorkoutCombine(state,request(state));let next=applyMissedWorkoutCombine(state,review,review.proposal,{persist:()=>true});
  next.activeWorkout=startWorkout(next,adaptedTemplateForToday(next));Object.assign(next.activeWorkout.exercises[0].sets[0],{completed:true,weight:20,reps:8});
  next=deserializeState(serializeState(completeWorkout(next)),{strict:true});expect(next.workouts[0].combinedSourcesResolved).toBe(false);expect(missedFlexibleSessions(next)).toHaveLength(2);
  expect(next.workouts[0].exercises.some(exercise=>exercise.sets.some(set=>set.completed))).toBe(true);
});
