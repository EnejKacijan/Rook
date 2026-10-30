import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./aiAuthorization.js',()=>({aiAuthorizationHeaders:async()=>({authorization:'Bearer synthetic'})}));
import {AIService,preferredCoachLanguage} from './aiService.js';
import {coachQualityFixture} from './coachQuality.fixture.js';
import {coachCombineReply,combineTime} from './coachCombine.js';
import {createCoachDayContext,coachDayStarter} from './coachDayContext.js';
import {applyCoachRequestResult} from './coachRequestResult.js';
import {combineSources,applyCombinedProposal} from './combineWorkouts.js';
import {serializeState,coachContext} from './domain.js';
let fetcher;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));fetcher=vi.fn().mockRejectedValue(Error('Unexpected provider request'));vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const addReply=(state,user,reply)=>{state.conversations.push({id:`entry-${state.conversations.length}`,conversationId:state.activeCoachConversationId,user,reply,createdAt:Date.now()});};
it.each(['združi mi moj Push in Pull, imam 60 min','daj oba missana treninga skupaj, imam eno uro','spravi Push in Pull skupi, 1h','Combine Push and Pull for 60 minutes','Combine 2026-09-07 and 2026-09-09 for 60 minutes','Combine 7 September 2026 and 9 September 2026 for an hour'])('combines the real pair without reuse, a weekly review, or a provider call: %s',async message=>{
  const state=coachQualityFixture(),before=serializeState(state),reply=await AIService.coach(state,message,{requireRemoteSuccess:true});
  expect(reply.action?.type,reply.text).toBe('combine-workouts');expect(reply.action.proposal.sourceSessions.map(source=>source.logicalSessionId)).toEqual(['push-source:2026-09-07','pull-source:2026-09-09']);
  expect(reply.action.proposal.requestedMinutes).toBe(60);expect(fetcher).not.toHaveBeenCalled();expect(serializeState(state)).toBe(before);
});
it.each([['mam eno uro',60],['eno uro in pol',90],['1 hour 15 minutes',75],['1h30',90],['1,5 ure',90],['pol ure',30],['brez časovne omejitve',null]])('understands the bounded time answer %s',async(message,minutes)=>{
  expect(combineTime(message)).toBe(minutes);const state=coachQualityFixture(),first=await coachCombineReply(state,'Združi oba zamujena treninga');addReply(state,'Združi oba zamujena treninga',first);
  const reply=await AIService.coach(state,message,{requireRemoteSuccess:true});if(minutes===30)expect(reply.action).toBeNull();else expect(reply.action.proposal.requestedMinutes).toBe(minutes);
  expect(reply.text).not.toMatch(/Which two|Pripravil sem spremembo.*termin/);expect(fetcher).not.toHaveBeenCalled();
});
it('retains the selected occurrence when combining from Ask Coach, including the generated date prefix',async()=>{
  const state=coachQualityFixture(),requestContext=createCoachDayContext(state,'2026-09-07');
  const reply=await AIService.coach(state,`${coachDayStarter(requestContext)}Combine this workout with Pull for 60 minutes.`,{requestContext,requireRemoteSuccess:true});
  expect(reply.action?.type,reply.text).toBe('combine-workouts');expect(reply.action.proposal.sourceSessions.map(source=>source.logicalSessionId)).toContain(requestContext.occurrenceId);expect(fetcher).not.toHaveBeenCalled();
});
it('a single named source asks for its partner without a model inventing the second source',async()=>{
  const state=coachQualityFixture(),reply=await AIService.coach(state,'Combine my Push workout for 60 min',{requireRemoteSuccess:true});
  expect(reply.action).toBeNull();expect(reply.combineRequest).toMatchObject({step:'sources',sourceIds:['push-source:2026-09-07'],minutes:60});expect(fetcher).not.toHaveBeenCalled();
});
it('corrects a source by name while retaining the other exact selected occurrence',async()=>{
  const state=coachQualityFixture({todayThird:true}),first=await coachCombineReply(state,'Combine Push and Lower');addReply(state,'Combine Push and Lower',first);
  const corrected=await coachCombineReply(state,'Pull instead of Lower');expect(corrected.combineRequest.sourceIds).toEqual(['push-source:2026-09-07','pull-source:2026-09-09']);expect(corrected.combineRequest.step).toBe('time');
});
it('two missed workouts with another session today open only the focused combination review',async()=>{
  const state=coachQualityFixture({todayThird:true}),reply=await AIService.coach(state,'združi oba missana treninga, 60 minut',{requireRemoteSuccess:true});
  expect(reply.action).toBeNull();expect(reply.combineRequest).toMatchObject({step:'review',sourceIds:['push-source:2026-09-07','pull-source:2026-09-09'],minutes:60});expect(reply.text).toContain('Push (7. sep.)');expect(reply.text).toContain('Pull (9. sep.)');expect(reply.text).toContain('s ciljem 60 minut');expect(fetcher).not.toHaveBeenCalled();
});
it('a time revision explicitly naming the combined workout uses the existing candidate',async()=>{
  let state=coachQualityFixture(),reply=await coachCombineReply(state,'Combine Push and Pull for 45 min');addReply(state,'Combine Push and Pull for 45 min',reply);
  state=applyCombinedProposal(state,reply.action.proposal,()=>true);state.conversations[0].actionResult={status:'applied'};
  reply=await coachCombineReply(state,'Podaljšaj združen trening na 75 minut');expect(reply.action?.type,reply.text).toBe('combine-workouts');expect(reply.action.proposal.revisionOf.id).toBe(state.todayAdaptation.id);expect(reply.action.proposal.requestedMinutes).toBe(75);
});
it('an unrelated question does not let an old combination consume a new numeric message',async()=>{
  const state=coachQualityFixture(),reply=await coachCombineReply(state,'Combine Push and Pull for 60 min');addReply(state,'Combine Push and Pull',reply);addReply(state,'How do I track rest?',{text:'Use the rest timer.',action:null,source:'ai'});
  expect(await coachCombineReply(state,'45 min')).toBeNull();
});
it('declining a proposal cancels only its pending controls, never the saved workouts or an applied action',async()=>{
  const state=coachQualityFixture(),proposal=await coachCombineReply(state,'Combine Push and Pull for 60 min');addReply(state,'Combine Push and Pull',proposal);
  addReply(state,'Previous request',{text:'Done',action:{type:'week-schedule-change'} });state.conversations[1].actionResult={status:'applied'};
  state.conversations.push({id:'pending',conversationId:state.activeCoachConversationId,coachRequestId:'request',reply:null});
  const before=structuredClone(state.program),reply=await coachCombineReply(state,'Ne združi teh treningov');
  const next=applyCoachRequestResult(state,{profileId:state.profile.id,entryId:'pending',conversationId:state.activeCoachConversationId,requestId:'request'},{reply});
  expect(next.conversations[0].coachWorkflowStatus).toBe('cancelled');expect(next.conversations[1].actionResult.status).toBe('applied');expect(next.program).toEqual(before);expect(next.todayAdaptation).toBeNull();
});
it.each(['Združi oba','prestavim treninga','povej mi','60 min'])('retains useful conversation language for %s',message=>expect(preferredCoachLanguage(message,[{user:'Združi oba zamujena treninga.'}])).toBe('Slovenian'));
it('a negated source is replaced instead of accidentally being included',async()=>{
  const state=coachQualityFixture({todayThird:true}),first=await coachCombineReply(state,'Združi Push in Pull');addReply(state,'Združi Push in Pull',first);
  const reply=await coachCombineReply(state,'ne Pull, raje Lower');expect(reply.combineRequest.sourceIds).toEqual(['push-source:2026-09-07','lower-source:2026-09-12']);
});
it('a duplicated workout name needs dated choices rather than a guessed pair',async()=>{
  const state=coachQualityFixture();state.program.days.forEach(day=>{day.name='Upper';day.workoutName='Upper';});
  const reply=await AIService.coach(state,'Combine my Upper for 60 minutes',{requireRemoteSuccess:true});expect(reply.action).toBeNull();expect(reply.combineRequest.step).toBe('sources');expect(fetcher).not.toHaveBeenCalled();
});
it('a corrected combination retires the incorrect weekly draft in both UI state and model history',async()=>{
  const state=coachQualityFixture();addReply(state,'Combine my workouts',{text:'Review your week.',action:{type:'week-schedule-change',changes:[]}});
  const reply=await AIService.coach(state,'Ne prestavljaj tedna, samo združi Push in Pull za 60 min',{requireRemoteSuccess:true});
  state.conversations.push({id:'pending',conversationId:state.activeCoachConversationId,coachRequestId:'r',reply:null});
  const next=applyCoachRequestResult(state,{profileId:state.profile.id,entryId:'pending',conversationId:state.activeCoachConversationId,requestId:'r'},{reply});
  expect(next.conversations[0].coachWorkflowStatus).toBe('cancelled');expect(next.conversations[0].supersededBy).toBe('pending');
  expect(coachContext(next).conversationHistory[0]).toMatchObject({action:null,actionResult:{status:'cancelled'}});expect(next.conversations.at(-1).reply.action.type).toBe('combine-workouts');
});
it.each(['ja daj','yes','pokaži te'])('an acknowledgement %s keeps one existing preview instead of generating a weekly action',async message=>{
  const state=coachQualityFixture(),reply=await coachCombineReply(state,'Combine Push and Pull for 60 min');addReply(state,'Combine Push and Pull',reply);
  const next=await AIService.coach(state,message,{requireRemoteSuccess:true});expect(next.action).toBeNull();expect(next.text).toMatch(/review|pregled/i);expect(fetcher).not.toHaveBeenCalled();
});
it('cancel that withdraws a pending weekly draft without making a schedule change',async()=>{
  const state=coachQualityFixture();addReply(state,'Move my workout',{text:'Review this.',action:{type:'week-schedule-change',changes:[]}});
  const reply=await AIService.coach(state,'cancel that',{requireRemoteSuccess:true});expect(reply.action).toBeNull();expect(reply.supersededEntryIds).toEqual(['entry-0']);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['Povej mi o mojem Push treningu','Can you review my Push workout?','Bi bilo smiselno združit Push in Pull?'])('advice stays read-only even if the provider proposes a change: %s',async message=>{
  const state=coachQualityFixture();fetcher.mockResolvedValue({ok:true,json:async()=>({data:{text:'I moved Push to Sunday.',action:{type:'week-schedule-change',changes:[{workoutId:'push-source',fromDate:'2026-09-07',toDate:'2026-09-13'}]}}})});
  const before=serializeState(state),reply=await AIService.coach(state,message,{requireRemoteSuccess:true});expect(reply.action).toBeNull();expect(reply.text).not.toMatch(/I moved/);expect(serializeState(state)).toBe(before);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).payload.requestIntent.readOnly).toBe(true);
});
it('the time answer today does not silently replace one of the two sources with today’s third workout',async()=>{
  const state=coachQualityFixture({todayThird:true}),first=await coachCombineReply(state,'Združi oba zamujena treninga');addReply(state,'Združi oba zamujena treninga',first);
  const reply=await AIService.coach(state,'mam 60 minut danes',{requireRemoteSuccess:true});expect(reply.combineRequest.step).toBe('review');expect(reply.combineRequest.sourceIds).toEqual(['push-source:2026-09-07','pull-source:2026-09-09']);
});
it.each(['I slept 6 hours and feel tired','My rest was 5 minutes','45 minutes is too short'])('an unrelated duration is not a silent answer to the combination budget: %s',async message=>{
  const state=coachQualityFixture(),first=await coachCombineReply(state,'Combine Push and Pull');addReply(state,'Combine Push and Pull',first);
  expect(await coachCombineReply(state,message)).toBeNull();
});
it('an explicit language switch overrides an earlier Slovenian combination question',async()=>{
  const state=coachQualityFixture(),first=await coachCombineReply(state,'Združi oba zamujena treninga');addReply(state,'Združi oba zamujena treninga',first);
  const reply=await AIService.coach(state,'Please answer in English. 60 min',{requireRemoteSuccess:true});expect(reply.action.type).toBe('combine-workouts');expect(reply.text).toMatch(/^A combined workout/);
});
