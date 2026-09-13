import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {blankState,buildProgram,deserializeState,serializeState,startWorkout,completeWorkout,adaptedTemplateForToday} from './domain.js';
import {flexibleSessions} from './flexibleWeek.js';
import {buildCombinedProposal,applyCombinedProposal,combineSources} from './combineWorkouts.js';
import {cancelCombinedWorkout,combinedAdjustment,persistCombinedState} from './combinedWorkoutLifecycle.js';
import {buildTodayAdjustment} from './adjustToday.js';
import {combineExample} from './combineWorkouts.fixture.js';
import {coachCombineReply} from './coachCombine.js';
import {currentWeekSchedule,exerciseCatalog,exerciseName} from './domain.js';
import {accumulateStimulus} from './trainingVolume.js';
import {reviewCombinedSelection} from './combineWorkouts.js';
import {proposeFlexibleWeek} from './flexibleWeek.js';
import {updateGymProfile} from './gymProfiles.js';
import {restartActiveWorkout,consistencyForCurrentWeek,readStartupState} from './domain.js';
import {persistProgramReplacement} from './planReplacement.js';
import {validateSupersetExercises,supersetSteps} from './supersets.js';
import {buildWorkoutExport} from './workoutExport.js';
import {AIService} from './aiService.js';

export function combineFixture(){
 const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
 s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-09-07';s.selectedDate='2026-09-12';return deserializeState(s);
}
const prepare=s=>buildCombinedProposal(s,{sourceIds:combineSources(s).filter(s=>s.status==='missed').slice(0,2).map(s=>s.logicalSessionId),minutes:75});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('combined temporary occurrence lifecycle',()=>{
 it('reserves two sources only after persisted Apply, then reloads',()=>{
  const s=combineFixture(),snapshot=serializeState(s),p=prepare(s);expect(p.status,p.error).toBe('ready');
  expect(serializeState(s)).toBe(snapshot);let saved;const applied=applyCombinedProposal(s,p.proposal,next=>{saved=serializeState(next);return true;});
  expect(applied.program).toEqual(s.program);expect(applied.planVersions).toEqual(s.planVersions);expect(applied.workouts).toEqual(s.workouts);
  const loaded=deserializeState(saved);expect(combinedAdjustment(loaded).sourceSessions).toHaveLength(2);
  expect(flexibleSessions(loaded).filter(s=>s.status==='reserved')).toHaveLength(2);
  expect(buildTodayAdjustment(loaded,{mode:'less-time',minutes:30}).status).toBe('unavailable');
  expect(prepare(loaded).status).toBe('conflict');
 });
 it('one actual completion atomically resolves both without plan mutation',()=>{
  const s=combineFixture(),p=prepare(s);expect(p.status,p.error).toBe('ready');
  let state=applyCombinedProposal(s,p.proposal,()=>true);state.activeWorkout=startWorkout(state,adaptedTemplateForToday(state));
  state=deserializeState(serializeState(state));
  state.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>{set.completed=true;set.reps=e.repMin;}));
  const next=completeWorkout(state);expect(next.workouts).toHaveLength(1);expect(next.workouts[0].combinedSourcesResolved).toBe(true);
  expect(next.todayAdaptation).toBeNull();expect(next.activeWorkout).toBeNull();expect(next.program).toEqual(state.program);
  let disk=serializeState(state);expect(()=>persistCombinedState(state,next,()=>false)).toThrow(/Could not save/);expect(disk).toBe(serializeState(state));
  persistCombinedState(state,next,value=>{disk=serializeState(value);return true;});
  const loaded=deserializeState(disk);expect(flexibleSessions(loaded).filter(s=>s.status==='combined')).toHaveLength(2);
  expect(flexibleSessions(loaded).filter(s=>s.status==='reserved')).toHaveLength(0);
  expect(completeWorkout(loaded).workouts).toHaveLength(1);
 });
 it('cancel before start and zero-set finish release both without history',()=>{
  const s=combineFixture(),p=prepare(s);let a=applyCombinedProposal(s,p.proposal,()=>true);
  const cancelled=cancelCombinedWorkout(a);expect(cancelled.todayAdaptation).toBeNull();expect(cancelled.program).toEqual(s.program);
  expect(flexibleSessions(cancelled).filter(s=>s.status==='reserved')).toHaveLength(0);
  a.activeWorkout=startWorkout(a,adaptedTemplateForToday(a));const zero=completeWorkout(a);
  expect(zero.workouts).toHaveLength(0);expect(zero.activeWorkout).toBeNull();expect(zero.todayAdaptation).toBeNull();
 });
 it('early finish preserves actual sets but does not falsely absorb source work',()=>{
  const s=combineFixture(),p=prepare(s),a=applyCombinedProposal(s,p.proposal,()=>true);
  a.activeWorkout=startWorkout(a,adaptedTemplateForToday(a));a.activeWorkout.exercises[0].sets[0].completed=true;
  expect(()=>cancelCombinedWorkout(a)).toThrow(/logged sets/);
  const ended=completeWorkout(a);expect(ended.workouts).toHaveLength(1);expect(ended.workouts[0].combinedSourcesResolved).toBe(false);
  expect(flexibleSessions(ended).filter(s=>['reserved','combined'].includes(s.status))).toHaveLength(0);
 });
 it('failed apply and stale proposals cannot orphan either reservation',()=>{
  const s=combineFixture(),p=prepare(s),before=serializeState(s);
  expect(()=>applyCombinedProposal(s,p.proposal,()=>false)).toThrow(/Could not save/);expect(serializeState(s)).toBe(before);
  s.program.version++;expect(()=>applyCombinedProposal(s,p.proposal,()=>true)).toThrow(/changed/);expect(s.todayAdaptation).toBeNull();
 });
 it('identical titles remain distinct occurrences and other dates remain intact',()=>{
  const s=combineFixture();s.program.days.forEach(d=>{d.name='Workout';});const p=prepare(s);expect(p.status,p.error).toBe('ready');
  const a=applyCombinedProposal(s,p.proposal,()=>true);const ids=new Set(p.proposal.sourceSessions.map(s=>s.logicalSessionId));
  expect(ids.size).toBe(2);for(const entry of flexibleSessions(a))expect(entry.status==='reserved').toBe(ids.has(entry.logicalSessionId));
 });
});

const exampleRequest=(s,minutes=60)=>({sourceIds:combineSources(s).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes});
describe('deterministic combine candidate and conversational intent',()=>{
 it.each([45,60,75,null])('condenses 33 source sets for %s minutes without catch-up debt',minutes=>{
  const s=combineExample(),before=serializeState(s),r=buildCombinedProposal(s,exampleRequest(s,minutes));expect(r.status,r.error).toBe('ready');
  const p=r.proposal,ex=p.workout.exercises;expect(p.originalSetCount).toBe(33);expect(ex.reduce((n,e)=>n+e.sets.length,0)).toBeLessThan(33);
  expect(p.estimatedMinutes).toBeLessThanOrEqual(minutes??90);expect(p.requiredCoverage).toEqual(expect.arrayContaining(['press','shoulder-press','row','vertical-pull']));
  expect(ex.some(e=>exerciseCatalog[e.exerciseId].kind==='isolation')).toBe(true);
  expect(Math.max(...Object.values(accumulateStimulus(ex,id=>exerciseCatalog[id])))).toBeLessThanOrEqual(8);
  expect(new Set(ex.flatMap(e=>e.sets.map(s=>s.id))).size).toBe(ex.flatMap(e=>e.sets).length);
  for(const e of ex){const original=s.program.days.flatMap(d=>d.exercises).find(row=>row.exerciseId===e.exerciseId);
    for(const key of ['repMin','repMax','targetRir','restSeconds'])expect(e[key]).toEqual(original[key]);
    expect(e.sets.map(({id,...s})=>s)).toEqual(original.sets.slice(0,e.sets.length).map(({id,...s})=>s));}
  expect(serializeState(s)).toBe(before);
 });
 it('review can remove secondary work but cannot remove required coverage or add work',()=>{
  const s=combineExample(),p=buildCombinedProposal(s,exampleRequest(s)).proposal;
  const ids=p.workout.exercises.map(e=>e.id),primary=p.workout.exercises.find(e=>exerciseCatalog[e.exerciseId].pattern==='vertical-pull');
  expect(reviewCombinedSelection(p,ids.filter(id=>id!==primary.id),s.profile)).toBeNull();
  const accessory=p.workout.exercises.find(e=>exerciseCatalog[e.exerciseId].kind==='isolation');
  const edited=reviewCombinedSelection(p,ids.filter(id=>id!==accessory.id),s.profile);expect(edited).not.toBeNull();
  const applied=applyCombinedProposal(s,edited,()=>true);expect(applied.todayAdaptation.workout.exercises).toHaveLength(ids.length-1);
  expect(applied.program).toEqual(s.program);
 });
 it.each(['I missed Push and Pull. Combine them into 60 minutes.','Combine the last two missed workouts into 60 min.','I missed both. Combine them into 60 minutes.','Združi Push in Pull v 60 minut.'])('resolves real occurrences: %s',async text=>{
  const s=combineExample(),reply=await coachCombineReply(s,text);expect(reply.action?.type,reply.text).toBe('combine-workouts');expect(reply.action.proposal.requestedMinutes).toBe(60);expect(s.todayAdaptation).toBeNull();
 });
 it('asks only for missing time and carries source IDs through quick choices',async()=>{
  const s=combineExample(),first=await coachCombineReply(s,'Combine Push and Pull');expect(first.combineRequest.step).toBe('time');
  s.activeCoachConversationId='a';s.conversations=[{conversationId:'a',reply:first}];
  const reply=await coachCombineReply(s,'45 min');expect(reply.action?.proposal.requestedMinutes,reply.text).toBe(45);
 });
 it('ambiguous last two / same names / more than two remain bounded choices',async()=>{
  const s=combineExample();expect((await coachCombineReply(s,'Combine my last two in 60 minutes')).combineRequest.step).toBe('sources');
  s.program.days.forEach(d=>d.name='Upper');s.program.days.push({...structuredClone(s.program.days[0]),id:'extra',weekday:'Fri'});
  expect((await coachCombineReply(s,'Combine Upper in 60 minutes')).combineRequest.step).toBe('sources');
  expect((await coachCombineReply(s,'Combine three workouts in 60 minutes')).combineRequest.step).toBe('sources');
 });
 it('AI may interpret language but cannot supply arbitrary prescriptions or invalid source IDs',async()=>{
  const s=combineExample(),ids=exampleRequest(s).sourceIds;
  const good=await coachCombineReply(s,'Condense the pair I couldn’t make this week; an hour is available',{interpret:async()=>({sourceIds:ids,minutes:60,unambiguous:true,exercises:['fake']})});
  expect(good.action?.type,good.text).toBe('combine-workouts');expect(good.action.proposal.workout.exercises.every(e=>exerciseCatalog[e.exerciseId])).toBe(true);
  const bad=await coachCombineReply(s,'Condense those sessions',{interpret:async()=>({sourceIds:['fake','other'],minutes:60,unambiguous:true})});expect(bad.action).toBeNull();
 });
 it('today + tomorrow and missed + today use occurrence dates, not names',async()=>{
  const s=combineExample();s.program.days[0].weekday='Sat';s.program.days[1].weekday='Sun';
  let r=await coachCombineReply(s,'Combine today and tomorrow into 75 minutes');expect(r.action?.proposal.sourceSessions.map(s=>s.scheduledDate),r.text).toEqual(['2026-09-12','2026-09-13']);
  s.program.days[0].weekday='Fri';s.program.days[1].weekday='Sat';r=await coachCombineReply(s,'Combine yesterday and today into 60 minutes');expect(r.action?.type,r.text).toBe('combine-workouts');
 });
 it('two upcoming occurrences can become today’s rest-day temporary workout',()=>{
  const s=combineExample(),ids=combineSources(s).filter(s=>s.scheduledDate>'2026-09-12').slice(0,2).map(s=>s.logicalSessionId);
  const r=buildCombinedProposal(s,{sourceIds:ids,minutes:75});expect(r.status,r.error).toBe('ready');
  const a=applyCombinedProposal(s,r.proposal,()=>true);expect(adaptedTemplateForToday(a).name).toBe('Combined workout');expect(a.program).toEqual(s.program);
 });
 it('completed / active / equipment conflicts never silently replace work',async()=>{
  const s=combineExample(),p=buildCombinedProposal(s,exampleRequest(s)).proposal;
  s.selectedDate='2026-09-07';s.activeWorkout=startWorkout(s,s.program.days[0]);expect(buildCombinedProposal(s,exampleRequest(s)).status).toBe('conflict');
  s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>set.completed=true));const completed=completeWorkout(s);
  expect((await coachCombineReply(completed,'Combine Push and Pull for 60 min')).action).toBeNull();
  const changed=combineExample();updateGymProfile(changed,changed.defaultGymProfileId,{name:'Home',equipment:['bodyweight only'],environment:'Home gym'});
  expect(buildCombinedProposal(changed,exampleRequest(changed)).status).toBe('conflict');
  expect(()=>applyCombinedProposal(changed,p,()=>true)).toThrow(/changed/);
 });
 it('short time, explicit exclusions, unresolved targets and custom warmups give honest conflicts',()=>{
  const s=combineExample();expect(buildCombinedProposal(s,exampleRequest(s,10)).status).toBe('conflict');
  s.program.days[0].exercises[0].partialPrescription={missing:['reps']};expect(buildCombinedProposal(s,exampleRequest(s)).status).toBe('conflict');
  delete s.program.days[0].exercises[0].partialPrescription;s.program.days[0].warmupPlan={mode:'custom',items:[{name:'Mobility'}]};expect(buildCombinedProposal(s,exampleRequest(s)).status).toBe('conflict');
 });
 it('pending owner prevents a second schedule mutation; cancelled and resolved sources behave correctly',()=>{
  const s=combineExample(),a=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true);
  expect(currentWeekSchedule(a)).toHaveLength(0);expect(proposeFlexibleWeek(a,{mode:'restore'}).status).toBe('conflict');
  expect(currentWeekSchedule(cancelCombinedWorkout(a))).toHaveLength(2);
 });
 it('start/cancel write failures retain complete prior state; malformed links fail closed',()=>{
  const s=combineExample(),a=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true),before=serializeState(a);
  const started={...a,activeWorkout:startWorkout(a,adaptedTemplateForToday(a))};
  expect(()=>persistCombinedState(a,started,()=>false)).toThrow();expect(serializeState(a)).toBe(before);
  expect(()=>persistCombinedState(a,cancelCombinedWorkout(a),()=>false)).toThrow();expect(serializeState(a)).toBe(before);
  a.todayAdaptation.sourceSessions[0].reservedBy='orphan';expect(()=>deserializeState(serializeState(a),{strict:true})).toThrow(/recovery/);
 });
});

describe('combine special prescriptions, recovery and profile constraints',()=>{
 it.each(['Build muscle','Get stronger','Athletic performance','General fitness'])('respects %s without a goal-specific catch-up algorithm',goal=>{
  const s=combineExample();s.profile.goal=goal;s.profile.priorities=['Shoulders'];
  const r=buildCombinedProposal(s,exampleRequest(s,60));expect(r.status,r.error).toBe('ready');
  expect(r.proposal.workout.exercises.some(e=>e.exerciseId==='lateral-raise')).toBe(true);
  expect(r.proposal.estimatedMinutes).toBeLessThanOrEqual(60);
 });
 it('Upper + Lower retains knee and posterior work alongside upper patterns in 60 minutes',()=>{
  const s=combineExample(),row=s.program.days[1].exercises[0];
  s.program.days[0].name='Upper';s.program.days[1].name='Lower';
  s.program.days[1].exercises=['back-squat','romanian-deadlift'].map((id,index)=>({...structuredClone(row),id:`lower-${index}`,exerciseId:id,sets:row.sets.slice(0,3).map((set,i)=>({...set,id:`lower-${index}-${i}`}))}));
  const r=buildCombinedProposal(s,exampleRequest(s,60));expect(r.status,r.error).toBe('ready');expect(r.proposal.requiredCoverage).toEqual(expect.arrayContaining(['knee','posterior','press']));
 });
 it.each(['per_side','amrap','timed'])('retains %s targets, no invented reps/load/rest/RIR',mode=>{
  const s=combineExample(),e=s.program.days[0].exercises[0];e.targetRir=null;e.restSeconds=null;e.loadRequirement='none';e.sets.forEach(s=>s.weight=null);
  if(mode==='per_side'){e.exerciseId='split-squat';e.loggingMode='per_side';}
  if(mode==='amrap'){e.failureTarget=true;e.repMin=null;e.repMax=null;e.sets.forEach(s=>{s.setType='amrap';s.reps=null;});}
  if(mode==='timed'){e.exerciseId='plank';e.programmingRole='main';e.repMin=30;e.repMax=45;e.sets.forEach(s=>s.reps=30);}
  // Imported open/rest-optional source stays executable, not a numeric fallback.
  const r=buildCombinedProposal(s,exampleRequest(s,75));expect(r.status,r.error).toBe('ready');
  const kept=r.proposal.workout.exercises.find(row=>row.id.endsWith(e.id));expect(kept).toBeDefined();
  for(const key of ['loggingMode','failureTarget','repMin','repMax','targetRir','restSeconds','importedExercise'])expect(kept[key]).toEqual(e[key]);
  expect(kept.sets.every(s=>s.weight===null)).toBe(true);
  const a=applyCombinedProposal(s,r.proposal,()=>true);a.activeWorkout=startWorkout(a,adaptedTemplateForToday(a));
  if(mode==='amrap')expect(a.activeWorkout.exercises.find(row=>row.id===kept.id).sets.every(s=>s.reps===null)).toBe(true);
 });
 it('valid A1/A2 pair stays adjacent/synchronized and uses the existing alternating sequence',()=>{
  const s=combineExample();s.program.days[0].exercises[0].sets.pop();s.program.days[0].exercises.slice(0,2).forEach(e=>e.supersetId='pair');
  const r=buildCombinedProposal(s,exampleRequest(s,75));expect(r.status,r.error).toBe('ready');
  const ex=r.proposal.workout.exercises,pair=ex.find(e=>e.supersetId);expect(pair).toBeDefined();expect(validateSupersetExercises(ex)).toEqual([]);
  expect(supersetSteps(ex,pair.supersetId).map(s=>s.role)).toEqual(pair.sets.flatMap(()=>['A1','A2']));
  expect(reviewCombinedSelection(r.proposal,ex.filter(e=>e.id!==pair.id).map(e=>e.id),s.profile)).toBeNull();
 });
 it('restriction conflicts stop without inventing replacement work',()=>{
  const s=combineExample();s.profile.avoid='Avoid overhead pressing';const before=serializeState(s),r=buildCombinedProposal(s,exampleRequest(s));
  expect(r.status).toBe('conflict');expect(serializeState(s)).toBe(before);
 });
 it('cancellation and restart keep both links coherent; plan replacement explicitly releases pending sources',()=>{
  const s=combineExample(),a=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true);
  a.activeWorkout=startWorkout(a,adaptedTemplateForToday(a));a.activeWorkout.exercises[0].sets[0].completed=true;
  const restarted=restartActiveWorkout(a);expect(restarted.activeWorkout.adjustment).toEqual(a.activeWorkout.adjustment);expect(restarted.program).toEqual(s.program);
  expect(flexibleSessions(cancelCombinedWorkout(restarted)).filter(s=>s.status==='reserved')).toHaveLength(0);
  const pending=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true);
  const changed=persistProgramReplacement(pending,buildProgram(s.profile),{},()=>true);expect(changed.todayAdaptation).toBeNull();expect(changed.workouts).toHaveLength(0);
 });
 it('completion counts one factual workout; deleting it reopens both obligations',()=>{
  const s=combineExample(),a=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true);
  expect(consistencyForCurrentWeek(a)).toEqual({completed:0,planned:2});
  a.activeWorkout=startWorkout(a,adaptedTemplateForToday(a));a.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>{s.completed=true;s.weight=20;s.reps=8;}));
  const completed=completeWorkout(a);expect(consistencyForCurrentWeek(completed)).toEqual({completed:1,planned:2});
  const text=buildWorkoutExport({workout:completed.workouts[0],completed:true}).text;expect(text).toContain('8 reps');
  completed.workouts=[];expect(flexibleSessions(completed).filter(s=>s.status==='combined')).toHaveLength(0);expect(completed.program).toEqual(s.program);
 });
 it('previous normal single-source records reload without a new source-array requirement',()=>{
  const s=combineFixture();s.todayAdaptation={schemaVersion:1,mode:'less-time',date:'2026-09-12',programDayId:s.program.days[0].id,workout:{...s.program.days[0]}};
  expect(readStartupState({getItem:()=>serializeState(s)}).status).toBe('ready');
 });
 it('equipment changed after Apply cannot start the obsolete combined proposal',()=>{
  const s=combineExample(),a=applyCombinedProposal(s,buildCombinedProposal(s,exampleRequest(s)).proposal,()=>true);
  updateGymProfile(a,a.defaultGymProfileId,{name:'Home',equipment:['bodyweight only'],environment:'Home gym'});
  expect(()=>startWorkout(a,adaptedTemplateForToday(a))).toThrow(/equipment or restrictions changed/);
  expect(flexibleSessions(a).filter(s=>s.status==='reserved')).toHaveLength(2);expect(cancelCombinedWorkout(a).todayAdaptation).toBeNull();
 });
 it('existing Coach AI can resolve non-keyword combine language, but the domain builds the workout',async()=>{
  const s=combineExample(),ids=exampleRequest(s).sourceIds;
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>({ok:true,json:async()=>String(url).endsWith('/status')?{available:true}:{data:{text:'I can prepare a joint session for review.',action:{type:'combine-workouts',sourceSessionIds:ids,minutes:60}}}})));
  const reply=await AIService.coach(s,'Can I do those two as one joint session?');
  expect(reply.action?.type,reply.text).toBe('combine-workouts');expect(reply.action.proposal.workout.exercises.every(e=>exerciseCatalog[e.exerciseId])).toBe(true);
  expect(s.todayAdaptation).toBeNull();
 });
});
