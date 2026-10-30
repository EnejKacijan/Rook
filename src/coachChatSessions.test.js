import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {blankState,coachContext,serializeState,deserializeState,startWorkout} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {createCoachVisitTracker,enterCoachConversation,continueCoachConversation,persistCoachEntry,persistCoachContinuation,pendingCoachWorkflows,coachConversationDayContext} from './coachConversations.js';
import {applyCoachRequestResult} from './coachRequestResult.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const message=(id='old-message',reply={text:'Previous training advice.'})=>({id,conversationId:'old',createdAt:Date.now(),user:'My previous question',reply});
const state=()=>({...blankState(),activeCoachConversationId:'old',coachDraft:'',conversations:[message()]});
const cold=(s,options={})=>enterCoachConversation(s,{coldStart:true,createId:()=> 'fresh',...options});

it('the app-scoped visit tracker distinguishes cold launch, warm remount and profile switch',()=>{
  const tracker=createCoachVisitTracker();expect(tracker.isColdStart('a')).toBe(true);
  tracker.entered('a');expect(tracker.isColdStart('a')).toBe(false);expect(tracker.isColdStart('b')).toBe(true);
  expect(createCoachVisitTracker().isColdStart('a')).toBe(true);
});
it('a clean cold launch starts blank even on the same day, retaining earlier transcript and training context',()=>{
  const before=state(),next=cold(before);
  expect(next.activeCoachConversationId).toBe('fresh');expect(next.conversations).toEqual(before.conversations);expect(next.coachDraft).toBe('');
  expect(coachContext(next).conversationHistory).toEqual([]);
  expect({...coachContext(next),conversationHistory:[]}).toEqual({...coachContext(before),conversationHistory:[]});
});
it.each(['activeWorkout','activeOptionalSession'])('an unrelated %s does not keep an old clean chat on cold launch',key=>{
  const before=state();before[key]={id:'training-owner',status:'active',sets:[{weight:30,completed:true}]};
  const next=cold(before);expect(next.activeCoachConversationId).toBe('fresh');expect(next[key]).toEqual(before[key]);
});
it.each([null,{text:'Choose one',combineRequest:{step:'sources'}},{text:'Review',action:{type:'adapt-today'}},{text:'Original workout',action:{type:'reuse-existing-workout',choices:[]}}])('unfinished Coach work survives cold launch (%j)',reply=>{
  const before=state();before.conversations=[message('pending',reply)];
  const next=cold(before);expect(next.activeCoachConversationId).toBe('old');expect(next.conversations).toEqual(before.conversations);expect(pendingCoachWorkflows(next)).toHaveLength(1);
});
it('a cold launch preserves a draft verbatim and an orphaned draft gains a safe identity',()=>{
  const before={...state(),coachDraft:'  Keep this\nquestion  '};expect(cold(before).coachDraft).toBe(before.coachDraft);expect(cold(before).activeCoachConversationId).toBe('old');
  const orphan={...blankState(),coachDraft:before.coachDraft};const next=cold(orphan);expect(next.activeCoachConversationId).toBe('fresh');expect(next.coachDraft).toBe(before.coachDraft);
});
it('warm returns preserve exact chat across midnight, year changes and persisted state',()=>{
  const first=cold(state());first.conversations.push({...message('new'),conversationId:'fresh'});
  vi.setSystemTime(new Date('2027-01-01T12:00:00'));
  const next=enterCoachConversation(deserializeState(serializeState(first)));expect(next.activeCoachConversationId).toBe('fresh');expect(next.conversations).toEqual(first.conversations);
});
it('empty cold visits reuse one identity instead of filling history with empty chats',()=>{
  let current=cold(blankState());const id=current.activeCoachConversationId;
  for(let i=0;i<5;i++)current=cold(deserializeState(serializeState(current)),{createId:()=>`unneeded-${i}`});
  expect(current.activeCoachConversationId).toBe(id);expect(current.conversations).toEqual([]);expect(Object.keys(current.coachConversationMeta)).toEqual([id]);
});
it('manual/contextual entry atomically saves starter and day context, including empty-chat reuse',()=>{
  const empty=cold(blankState()),context={kind:'ask',profileId:empty.profile.id,date:'2026-10-29',workoutName:'Upper A'};
  const next=persistCoachEntry(empty,{manual:true,initialDraft:'Help with Thursday: ',dayContext:context},()=>true);
  expect(next.activeCoachConversationId).toBe(empty.activeCoachConversationId);expect(next.coachDraft).toBe('Help with Thursday: ');
  const restored=deserializeState(serializeState(next));expect(coachConversationDayContext(restored)).toEqual(context);
  expect(coachConversationDayContext(cold(restored))).toEqual(context);
  expect(()=>persistCoachEntry(empty,{manual:true,initialDraft:'Help',dayContext:context},()=>false)).toThrow('unchanged');expect(empty.coachDraft).toBe('');
  const blank=enterCoachConversation({...next,coachDraft:''},{manual:true});expect(coachConversationDayContext(blank)).toBeNull();
});
it('continuing a historical chat retains text and freezes all earlier actions without touching applied workouts',()=>{
  const original=state();original.activeCoachConversationId='current';original.coachConversationMeta={current:{id:'current',createdAt:Date.now()}};
  original.conversations=[message('proposal',{text:'Old proposal',action:{type:'add-today-workout'}}),{...message('applied',{text:'Applied before',action:{type:'week-schedule-change'}}),actionResult:{status:'applied',undoSnapshot:{private:'old snapshot'}}}];
  const training=createReturningUserFixture(0);original.activeWorkout=startWorkout(training,training.program.days[0]);original.todayAdaptation={id:'accepted-owner'};
  const before=structuredClone(original),next=continueCoachConversation(original,'old');
  expect(original).toEqual(before);expect(next.activeCoachConversationId).toBe('old');
  expect(next.conversations.map(e=>[e.user,e.reply])).toEqual(before.conversations.map(e=>[e.user,e.reply]));
  expect(next.conversations.every(e=>e.coachActionsArchived)).toBe(true);expect(next.conversations[0].coachWorkflowStatus).toBe('cancelled');expect(next.conversations[1].actionResult).toEqual(before.conversations[1].actionResult);
  expect(next.activeWorkout).toEqual(before.activeWorkout);expect(next.todayAdaptation).toEqual(before.todayAdaptation);expect(pendingCoachWorkflows(next)).toEqual([]);
  const context=coachContext(next).conversationHistory;expect(context.map(e=>e.action)).toEqual([null,null]);expect(context[1].actionResult).toEqual({status:'applied',historical:true});
  expect(Object.keys(next.coachConversationMeta)).not.toContain('current');
  next.conversations.push({id:'new-action',conversationId:'old',user:'Update that advice',reply:{text:'New proposal',action:{type:'adapt-today'}}});
  expect(pendingCoachWorkflows(next).map(e=>e.id)).toEqual(['new-action']);expect(coachContext(next).conversationHistory.at(-1).action).toEqual({type:'adapt-today'});
});
it('continuation never revives an old pending reply, including late provider completion',()=>{
  const original=state();original.activeCoachConversationId='current';original.conversations=[{...message('late',null),coachRequestId:'request'}];
  const next=continueCoachConversation(original,'old'),identity={profileId:original.profile.id,conversationId:'old',entryId:'late',requestId:'request'};
  expect(applyCoachRequestResult(next,identity,{reply:{text:'Late',action:{type:'adapt-today'}}})).toBe(next);expect(pendingCoachWorkflows(next)).toEqual([]);
});
it('continuation protects a current draft and pending review until explicit confirmation',()=>{
  const before=state();before.activeCoachConversationId='current';before.coachDraft='Keep me';before.conversations.push({...message('current-pending',null),conversationId:'current'});
  const original=structuredClone(before);expect(()=>continueCoachConversation(before,'old')).toThrow('still in progress');
  expect(()=>continueCoachConversation(before,'old',{cancelPending:true})).toThrow('unsent draft');expect(before).toEqual(original);
  const next=continueCoachConversation(before,'old',{cancelPending:true,discardDraft:true});expect(next.coachDraft).toBe('');expect(next.conversations.find(e=>e.id==='current-pending').coachWorkflowStatus).toBe('cancelled');
  expect(()=>persistCoachContinuation(before,'old',{cancelPending:true,discardDraft:true},()=>false)).toThrow('unchanged');expect(before).toEqual(original);
});
it('continuing the already active conversation preserves its draft and live actions',()=>{
  const before={...state(),coachDraft:'Current draft'};before.conversations=[message('pending',null)];
  const next=continueCoachConversation(before,'old');expect(next.coachDraft).toBe('Current draft');expect(next.conversations[0].coachActionsArchived).toBeUndefined();expect(pendingCoachWorkflows(next)).toHaveLength(1);
});
it('continuation rejects missing conversations and an ownership change',()=>{
  const before=state();expect(()=>continueCoachConversation(before,'missing')).toThrow('no longer available');expect(()=>continueCoachConversation(before,'old',{profileId:'other-profile'})).toThrow('another profile');
});
