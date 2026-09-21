import { describe, it, expect, vi } from 'vitest';
import { blankState, buildProgram, deserializeState, serializeState, isoDay, coachContext } from './domain.js';
import {combineSources,buildCombinedProposal,applyCombinedProposal,buildCombinedRevision} from './combineWorkouts.js';
import {flexibleSessions} from './flexibleWeek.js';
import { enterCoachConversation, normalizeCoachConversations, pendingCoachWorkflows, persistCoachEntry, cancelCoachWorkflows } from './coachConversations.js';

const day = value => new Date(`2026-09-${value}T12:00:00`);
const enter = (state, date = day(18), options = {}) => enterCoachConversation(state, {now:date,...options});
const entry = (id, reply = {text:'A complete answer.'}, extra = {}) => ({id,conversationId:'old',createdAt:day(18).getTime(),user:'Training question',reply,...extra});
function fixture(messages = [entry('one')]) { return {...blankState(),conversations:messages,activeCoachConversationId:'old',coachDraft:'Draft answer'}; }
const request = {text:'How much time?',combineRequest:{step:'time',sourceIds:['upper','lower']}};
const proposal = {text:'Review this',action:{type:'combine-workouts',proposal:{id:'combined',mode:'combine'}}};

it('plain HTTP LAN previews can create distinct stable IDs without secure-context crypto',()=>{
  vi.stubGlobal('crypto',undefined);
  try {const a=enter(blankState()),b=enter(a,day(18),{manual:true});expect(a.activeCoachConversationId).not.toBe(b.activeCoachConversationId);expect(enter(deserializeState(serializeState(b))).activeCoachConversationId).toBe(b.activeCoachConversationId);}
  finally{vi.unstubAllGlobals();}
});

it('A/E/F same-day entry, tab return and persisted restart preserve stable identity and draft',()=>{
  const first=enter(fixture());
  for(const state of [first,deserializeState(serializeState(first)),structuredClone(first)]) {
    expect(enter(state).activeCoachConversationId).toBe('old');expect(enter(state).coachDraft).toBe('Draft answer');
  }
});
it('B a new local day retains all messages and workout state, clearing only the current draft',()=>{
  const before=fixture();before.activeWorkout={id:'live',startedAt:123,exercises:[]};before.todayAdaptation={id:'applied'};
  const next=enter(before,day(19));expect(next.activeCoachConversationId).not.toBe('old');expect(next.coachDraft).toBe('');
  expect(next.conversations).toEqual(before.conversations);expect(next.activeWorkout).toEqual(before.activeWorkout);expect(next.todayAdaptation).toEqual(before.todayAdaptation);
  expect(next.coachConversationMeta.old.localDateStarted).toBe('2026-09-18');
});
it.each([request,proposal,{text:'Adjust today',action:{type:'adapt-today'}},null])('C pending structured workflow survives reload and next day: %j',reply=>{
  const before=enter(fixture([entry('pending',reply,{combineSelection:['upper'],combineReview:{id:'candidate'}})]));
  const next=enter(deserializeState(serializeState(before)),day(19));expect(next.activeCoachConversationId).toBe('old');expect(next.coachDraft).toBe('Draft answer');expect(next.conversations).toEqual(before.conversations);
});
it('D resolving next-day pending work only rolls over on the next entry',()=>{
  const state=enter(fixture([entry('question',request),entry('review',proposal)]),day(19));
  state.conversations[1].actionResult={status:'applied'};
  expect(pendingCoachWorkflows(state)).toEqual([]);expect(state.activeCoachConversationId).toBe('old');
  expect(enter(state,day(19)).activeCoachConversationId).not.toBe('old');
});
it('plain questions never block rollover; conflict is pending, undo-conflict already applied',()=>{
  expect(enter(fixture([entry('q',{text:'How was your training?'})]),day(19)).activeCoachConversationId).not.toBe('old');
  expect(pendingCoachWorkflows(fixture([entry('q',proposal,{actionResult:{status:'conflict'}})]))).toHaveLength(1);
  expect(pendingCoachWorkflows(fixture([entry('q',proposal,{actionResult:{status:'undo-conflict'}})]))).toHaveLength(0);
});
it('G multiple same-day manual chats have distinct identities and retain all old messages',()=>{
  const a=enter(fixture()),b=enter(a,day(18),{manual:true}),c=enter(b,day(18),{manual:true});
  expect(new Set([a.activeCoachConversationId,b.activeCoachConversationId,c.activeCoachConversationId]).size).toBe(3);
  expect(c.conversations).toEqual(a.conversations);expect(c.coachDraft).toBe('');expect(Object.keys(c.coachConversationMeta)).toHaveLength(2);
});
it('H explicit pending cancellation is required and keeps applied reservations/provenance intact',()=>{
  const before=fixture([entry('applied',proposal,{actionResult:{status:'applied'}}),entry('revision',proposal)]);
  before.todayAdaptation={id:'combined',mode:'combine',sourceSessions:[{logicalSessionId:'upper'},{logicalSessionId:'lower'}]};
  expect(()=>enter(before,day(19),{manual:true})).toThrow('still in progress');
  const next=enter(before,day(19),{manual:true,cancelPending:true});
  expect(next.todayAdaptation).toEqual(before.todayAdaptation);expect(next.conversations[0]).toEqual(before.conversations[0]);
  expect(next.conversations[1].coachWorkflowStatus).toBe('cancelled');expect(pendingCoachWorkflows(next,'old')).toEqual([]);expect(before.conversations[1].coachWorkflowStatus).toBeUndefined();
});
it('I legacy migration is stable, non-destructive and does not invent daily boundaries',()=>{
  const before=fixture([{id:'a',user:'first',reply:{text:'ok'}},{id:'b',user:'second',reply:{text:'ok'}}]);delete before.activeCoachConversationId;
  const once=normalizeCoachConversations(before),twice=normalizeCoachConversations(once);
  expect(twice).toEqual(once);expect(once.conversations.map(e=>e.conversationId)).toEqual(['legacy','legacy']);expect(once.coachConversationMeta.legacy.localDateStarted).toBeNull();
  expect(enter(once).conversations.map(e=>e.user)).toEqual(['first','second']);
});
it('legacy spanning dated messages stays one conversation; resolver uses timestamps not array order',()=>{
  const before=fixture([entry('newest',undefined,{conversationId:'new',createdAt:day(19).getTime()}),entry('oldest')]);before.activeCoachConversationId=null;
  expect(enter(before,day(19)).activeCoachConversationId).toBe('new');
  const legacy=normalizeCoachConversations(fixture([entry('a',undefined,{conversationId:null}),entry('b',undefined,{conversationId:null,createdAt:day(19).getTime()})]));
  expect(Object.keys(legacy.coachConversationMeta)).toEqual(['legacy']);
});
it('J local midnight creates exactly one new conversation, regardless of UTC date',()=>{
  const start=new Date(2026,8,18,23,50),end=new Date(2026,8,19,0,10);
  const first=enter(blankState(),start),next=enter(first,end);
  expect(first.coachConversationMeta[first.activeCoachConversationId].localDateStarted).toBe(isoDay(start));
  expect(next.activeCoachConversationId).not.toBe(first.activeCoachConversationId);expect(enter(next,end).activeCoachConversationId).toBe(next.activeCoachConversationId);
});
describe('K DST uses calendar days, never elapsed hours',()=>{
  it.each([[2026,2,29],[2026,9,25]])('same day around clock changes %j', (year,month,date)=>{
    const start=new Date(year,month,date,0,30),late=new Date(year,month,date,23,30),tomorrow=new Date(year,month,date+1,0,5);
    const first=enter(blankState(),start);expect(enter(first,late).activeCoachConversationId).toBe(first.activeCoachConversationId);
    const next=enter(first,tomorrow);expect(next.activeCoachConversationId).not.toBe(first.activeCoachConversationId);expect(enter(next,tomorrow).activeCoachConversationId).toBe(next.activeCoachConversationId);
  });
});
it('L no eager conversations during five days without Coach; empty visits do not fill History',()=>{
  let state=blankState();for(let i=18;i<=23;i++)state=deserializeState(serializeState(state));
  expect(state.conversations).toEqual([]);expect(state.coachConversationMeta).toEqual({});
  for(let i=18;i<=23;i++)state=enter(state,day(i));expect(state.conversations).toEqual([]);expect(Object.keys(state.coachConversationMeta)).toHaveLength(1);
});
it('N cancellation and next-day creation fail atomically without losing draft/history',()=>{
  for(const pending of [false,true]) {
    const state=fixture([entry('one',pending?request:undefined)]),before=structuredClone(state);
    expect(()=>persistCoachEntry(state,{now:day(19),manual:true,cancelPending:true},()=>false)).toThrow('unchanged');expect(state).toEqual(before);
  }
});
it('Combine clarification advances once, revisions supersede same candidate, and cancellation stays terminal after a late reply',()=>{
  const state=fixture([entry('a',request),entry('b',request),entry('c',proposal),entry('d',proposal)]);
  expect(pendingCoachWorkflows(state).map(e=>e.id)).toEqual(['d']);
  const pending=fixture([entry('late',null)]),cancelled=cancelCoachWorkflows(pending);cancelled.conversations[0].reply=proposal;
  expect(pendingCoachWorkflows(cancelled)).toEqual([]);
});
it('declining a Combine revision retains the original unaccepted proposal; New chat cancels the whole chain',()=>{
  const state=fixture([entry('base',proposal),entry('revision',proposal,{combineReviewCancelled:true})]);
  expect(pendingCoachWorkflows(state).map(e=>e.id)).toEqual(['base']);
  state.conversations[1].combineReviewCancelled=false;
  expect(pendingCoachWorkflows(cancelCoachWorkflows(state))).toEqual([]);
});
it('fresh transcript context retains app context but does not send old history',()=>{
  const before=fixture(),next=enter(before,day(19));const a=coachContext(before),b=coachContext(next);
  expect(b.conversationHistory).toEqual([]);expect({...b,conversationHistory:[]}).toEqual({...a,conversationHistory:[]});
});
it('real applied Combine reservations remain owned after cancelling its pending revision in New chat',()=>{
  vi.useFakeTimers();vi.setSystemTime(day(19));
  try {
    let state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});
    state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-09-07';
    const result=buildCombinedProposal(state,{sourceIds:combineSources(state).slice(0,2).map(s=>s.logicalSessionId),minutes:60});expect(result.status,result.error).toBe('ready');
    state=applyCombinedProposal(state,result.proposal,()=>true);
    const revision=buildCombinedRevision(state,{base:state.todayAdaptation,minutes:75});expect(revision.status,revision.error).toBe('ready');
    state.activeCoachConversationId='old';state.conversations=[entry('applied',{text:'Applied',action:{type:'combine-workouts',proposal:result.proposal}},{actionResult:{status:'applied'}}),entry('revision',{text:'Review',action:{type:'combine-workouts',proposal:revision.proposal}})];
    const reservations=s=>flexibleSessions(s).filter(s=>s.status==='reserved').map(s=>s.logicalSessionId);
    expect(reservations(state)).toHaveLength(2);
    const next=enter(state,day(18),{manual:true,cancelPending:true});expect(next.todayAdaptation).toEqual(state.todayAdaptation);expect(reservations(next)).toEqual(reservations(state));expect(pendingCoachWorkflows(next,'old')).toEqual([]);
  }finally{vi.useRealTimers();}
});
