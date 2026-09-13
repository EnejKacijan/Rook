import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {combineExample} from './combineWorkouts.fixture.js';
import {buildCombinedProposal,buildCombinedRevision,applyCombinedProposal,combineSources,reviewCombinedSelection} from './combineWorkouts.js';
import {coachCombineReply,combineRevisionTargets} from './coachCombine.js';
import {serializeState,deserializeState,startWorkout,adaptedTemplateForToday,completeWorkout,exerciseCatalog} from './domain.js';
import {flexibleSessions} from './flexibleWeek.js';
import {updateGymProfile} from './gymProfiles.js';
import {AIService} from './aiService.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const state=()=>{const s=combineExample();s.activeCoachConversationId='synthetic-combine';return s;};
const proposal=(s,minutes=60)=>{const r=buildCombinedProposal(s,{sourceIds:combineSources(s).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes});expect(r.status,r.error).toBe('ready');return r.proposal;};
const record=(s,reply)=>s.conversations.push({id:`q-${s.conversations.length}`,conversationId:s.activeCoachConversationId,user:'Synthetic request',reply});
const draft=(s,p)=>record(s,{action:{type:'combine-workouts',proposal:p}});
const revise=(s,base,minutes)=>{const r=buildCombinedRevision(s,{base,minutes});expect(r.status,r.error).toBe('ready');return r.proposal;};
const apply=(s,p)=>applyCombinedProposal(s,p,()=>true);
const loaded=s=>deserializeState(serializeState(s));

it('initial missing time is a bounded total-time question, not the profile default',async()=>{
 const s=state(),r=await coachCombineReply(s,'Združi Push in Pull, imam malo časa.');
 expect(r.action).toBeNull();expect(r.combineRequest).toMatchObject({step:'time'});expect(r.text).toBe('Koliko časa imaš danes za celoten trening?');
 record(s,r);const next=await coachCombineReply(loaded(s),'60 min');expect(next.action.proposal.requestedMinutes).toBe(60);expect(s.todayAdaptation).toBeNull();
});
it.each(['Combine Push and Pull in 60 minutes','Združi ponedeljkov in sredin trening v 60 minut.'])('explicit initial time is retained: %s',async text=>{
 const r=await coachCombineReply(state(),text);expect(r.action?.proposal.requestedMinutes,r.text).toBe(60);expect(r.combineRequest).toBeUndefined();
});
it('unapplied proposal can be revised and applied under the same identity',()=>{
 const s=state(),p=proposal(s);draft(s,p);const next=revise(s,p,75);draft(s,next);
 expect(next.id).toBe(p.id);expect(next.revision).toBe(1);expect(s.todayAdaptation).toBeNull();
 expect(()=>apply(s,p)).toThrow(/newer version/);const a=apply(s,next);expect(a.todayAdaptation.id).toBe(p.id);expect(a.todayAdaptation.requestedMinutes).toBe(75);
});
it('revising an applied workout is read-only until atomic Apply; own reservations survive',()=>{
 let s=state(),p=proposal(s);draft(s,p);s=apply(s,p);const before=serializeState(s),r=revise(s,s.todayAdaptation,75);
 expect(serializeState(s)).toBe(before);const persisted=vi.fn(()=>true),a=applyCombinedProposal(s,r,persisted);
 expect(persisted).toHaveBeenCalledOnce();expect(a.todayAdaptation.id).toBe(p.id);expect(a.todayAdaptation.revision).toBe(1);
 expect(a.todayAdaptation.sourceSessions).toEqual(s.todayAdaptation.sourceSessions);expect(flexibleSessions(a).filter(s=>s.status==='reserved')).toHaveLength(2);
 expect(a.program).toEqual(s.program);expect(a.workouts).toEqual(s.workouts);expect(a.optionalSessions).toEqual(s.optionalSessions);
 expect(()=>apply(a,r)).toThrow(/changed/);expect(loaded(a).todayAdaptation).toEqual(a.todayAdaptation);
});
it('60 → 75 → 45 → 75 always rebuilds from sources, without duplicate entries or sets',()=>{
 let s=state();s=apply(s,proposal(s));const id=s.todayAdaptation.id,sources=s.todayAdaptation.sourceSessions,full=revise(s,s.todayAdaptation,75).workout.exercises;
 for(const minutes of [75,45,75]){const r=revise(s,s.todayAdaptation,minutes);s=loaded(apply(s,r));expect(s.todayAdaptation.id).toBe(id);expect(s.todayAdaptation.sourceSessions).toEqual(sources);
   expect(new Set(s.todayAdaptation.workout.exercises.map(e=>e.id)).size).toBe(s.todayAdaptation.workout.exercises.length);
   const ids=s.todayAdaptation.workout.exercises.flatMap(e=>e.sets.map(s=>s.id));expect(new Set(ids).size).toBe(ids.length);
 }expect(s.todayAdaptation.workout.exercises).toEqual(full);
});
it('an explicit review exclusion stays excluded through longer/shorter revisions',()=>{
 let s=state(),p=proposal(s,75);const removable=p.workout.exercises.find(e=>reviewCombinedSelection(p,p.workout.exercises.filter(x=>x.id!==e.id).map(x=>x.id),s.profile));expect(removable).toBeDefined();
 const selected=reviewCombinedSelection(p,p.workout.exercises.filter(e=>e.id!==removable.id).map(e=>e.id),s.profile);
 draft(s,p);s.conversations.at(-1).combineReview=selected;s=loaded(s);expect(combineRevisionTargets(s)[0].workout.exercises.some(e=>e.id===removable.id)).toBe(false);
 s=apply(s,selected);for(const minutes of [90,45,75]){s=apply(s,revise(s,s.todayAdaptation,minutes));expect(s.todayAdaptation.workout.exercises.some(e=>e.exerciseId===removable.exerciseId)).toBe(false);}
});
it('manual set/load edits and ordering are locked, not replaced by generated defaults',()=>{
 let s=state();s=apply(s,proposal(s));const e=s.todayAdaptation.workout.exercises[0];e.sets=e.sets.slice(0,2);e.sets.forEach(set=>set.weight=42.5);e.notes='Explicit manual note';
 s.todayAdaptation.workout.exercises.reverse();const order=s.todayAdaptation.workout.exercises.map(e=>e.id);const r=revise(s,s.todayAdaptation,90);
 expect(r.workout.exercises.find(x=>x.id===e.id)).toEqual(e);expect(r.workout.exercises.filter(e=>order.includes(e.id)).map(e=>e.id)).toEqual(order);
 const a=apply(s,r);expect(a.todayAdaptation.workout.exercises.find(x=>x.id===e.id)).toEqual(e);
});
it('a genuinely missing prioritized accessory is canonical, bounded and labelled as a Coach recommendation',()=>{
 let s=state();s.profile.priorities=['Arms'];s.profile.prioritySources.manual=['Arms'];s.program.days[1].exercises=s.program.days[1].exercises.filter(e=>e.exerciseId!=='barbell-curl');s=loaded(s);
 s=apply(s,proposal(s,60));const r=revise(s,s.todayAdaptation,90),added=r.workout.exercises.filter(e=>e.combinedOrigin==='coach-added');
 expect(added).toHaveLength(1);expect(exerciseCatalog[added[0].exerciseId]).toBeDefined();expect(added[0].sets).toHaveLength(2);expect(added[0].combinedSourceIds).toEqual([]);
 expect(r.revisionSummary.added.some(e=>e.id===added[0].id&&e.origin==='coach-added')).toBe(true);expect(s.program.days.flatMap(d=>d.exercises).some(e=>e.exerciseId===added[0].exerciseId)).toBe(false);
 const applied=loaded(apply(s,r));expect(applied.todayAdaptation.workout.exercises.find(e=>e.id===added[0].id)).toEqual(added[0]);
 expect(revise(applied,applied.todayAdaptation,90).workout.exercises).toEqual(applied.todayAdaptation.workout.exercises);
});
it.each(['Podaljšaj ga, imam več časa.','kaj pa ce ga podaljsas ker mam vec casa','Make it longer please'])('applied follow-up asks only for total time: %s',async text=>{
 let s=state();s=apply(s,proposal(s));const before=serializeState(s),r=await coachCombineReply(s,text);expect(r.combineRequest).toMatchObject({kind:'revision',step:'time',targetId:s.todayAdaptation.id});expect(serializeState(s)).toBe(before);
 record(s,r);s=loaded(s);const next=await coachCombineReply(s,'75 min');expect(next.action?.proposal.requestedMinutes,next.text).toBe(75);expect(next.action.proposal.id).toBe(s.todayAdaptation.id);
});
it.each([['Zdaj imam 75 minut.',75],['Skrajšaj ga na 45 minut.',45],['+15 minut',75],['Shorten it by 15 minutes',45],['No strict limit',null]])('time follow-up %s → %s',async(text,minutes)=>{
 let s=state();s=apply(s,proposal(s));const r=await coachCombineReply(s,text);expect(r.action?.proposal.requestedMinutes,r.text).toBe(minutes);
});
it('+15 after No strict limit asks for TOTAL rather than adding to the estimate',async()=>{
 let s=state();s=apply(s,proposal(s,null));const r=await coachCombineReply(s,'+15 minut');expect(r.action).toBeNull();expect(r.combineRequest.step).toBe('time');
});
it('Cancel revision restores applied conversational target, including after reload and multiple cancelled revisions',async()=>{
 let s=state();s=apply(s,proposal(s));const base=structuredClone(s.todayAdaptation);
 const r=revise(s,s.todayAdaptation,75);draft(s,r);s.conversations.at(-1).combineReviewCancelled=true;
 const r2=revise(s,s.todayAdaptation,90);draft(s,r2);s.conversations.at(-1).combineReviewCancelled=true;s=loaded(s);
 const next=await coachCombineReply(s,'+15 minut');expect(next.action.proposal.requestedMinutes).toBe(75);expect(s.todayAdaptation).toEqual(base);
 expect(next.action.proposal.revision).toBeGreaterThan(r2.revision);draft(s,next.action.proposal);expect(apply(s,next.action.proposal).todayAdaptation.requestedMinutes).toBe(75);
});
it('two current unapplied proposals require an explicit identity choice',async()=>{
 const s=state(),a=proposal(s),b=proposal(s,75);draft(s,a);draft(s,b);const r=await coachCombineReply(s,'Skrajšaj ga na 45 minut');expect(r.combineRequest.step).toBe('target');record(s,r);
 const chosen=await coachCombineReply(s,'Choose first',{selection:{targetId:a.id}});expect(chosen.action?.proposal.id,chosen.text).toBe(a.id);expect(chosen.action.proposal.requestedMinutes).toBe(45);
});
it('stale question after manual edits is rejected rather than bound to changed base',async()=>{
 let s=state();s=apply(s,proposal(s));record(s,await coachCombineReply(s,'Make it longer'));s.todayAdaptation.workout.exercises[0].sets[0].weight=77;
 const r=await coachCombineReply(s,'75 min');expect(r.action).toBeNull();expect(r.text).toMatch(/changed since/);
});
it.each(['start','finish','source','equipment','restriction','owner','custom-warmup'])('%s change invalidates pending Apply safely',kind=>{
 let s=state();s=apply(s,proposal(s));const r=revise(s,s.todayAdaptation,75);
 if(kind==='start'||kind==='finish'){s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));if(kind==='finish'){s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>set.completed=true));s=completeWorkout(s);}}
 if(kind==='source')s.program.days[0].name='Changed source';
 if(kind==='equipment')updateGymProfile(s,s.defaultGymProfileId,{name:'Home',environment:'Home gym',equipment:['bodyweight only']});
 if(kind==='restriction')s.profile.restrictions='No pressing';
 if(kind==='owner')s.todayAdaptation.sourceSessions[0].reservedBy='foreign-owner';
 if(kind==='custom-warmup')s.program.days[0].warmupPlan={mode:'custom',items:[{name:'Source instruction'}]};
 const before=serializeState(s),persist=vi.fn(()=>true);expect(()=>applyCombinedProposal(s,r,persist)).toThrow();expect(serializeState(s)).toBe(before);expect(persist).not.toHaveBeenCalled();
});
it('write failure keeps the old snapshot and both reservations intact, retry succeeds',()=>{
 let s=state();s=apply(s,proposal(s));const r=revise(s,s.todayAdaptation,75),before=serializeState(s);
 expect(()=>applyCombinedProposal(s,r,()=>false)).toThrow(/save/);expect(serializeState(s)).toBe(before);expect(flexibleSessions(s).filter(s=>s.status==='reserved')).toHaveLength(2);expect(apply(s,r).todayAdaptation.revision).toBe(1);
});
it('start/completed conversational references give concrete reasons, not new workouts',async()=>{
 let s=state(),p=proposal(s);draft(s,p);s=apply(s,p);s.conversations[0].actionResult={status:'applied'};s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));
 expect((await coachCombineReply(s,'Make it longer')).text).toMatch(/in progress/);s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>set.completed=true));s=completeWorkout(s);
 expect((await coachCombineReply(s,'Make it longer')).text).toMatch(/finished/);expect(s.workouts).toHaveLength(1);
});
it('revised completion produces one real history record and two resolved occurrences',()=>{
 let s=state();s=apply(s,proposal(s));s=loaded(apply(s,revise(s,s.todayAdaptation,75)));const plan=structuredClone(s.program);s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));
 s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>{set.completed=true;set.reps=8;}));s=loaded(completeWorkout(s));expect(s.workouts).toHaveLength(1);expect(s.workouts[0].combinedSourcesResolved).toBe(true);expect(flexibleSessions(s).filter(s=>s.status==='combined')).toHaveLength(2);expect(s.program).toEqual(plan);
});
it('generic Add screenshot path is explained without fabricating source links',async()=>{
 const s=state();record(s,{action:{type:'add-today-workout'}});s.conversations[0].actionResult={status:'applied',targetDate:'2026-09-12'};s.optionalSessions=[{id:'synthetic-added',kind:'Strength',status:'planned',date:'2026-09-12',workout:{exercises:[]}}];const before=serializeState(s);
 const r=await coachCombineReply(s,'kaj pa ce ga podaljsas ker mam vec casa');expect(r.action).toBeNull();expect(r.text).toMatch(/samostojen trening, brez povezav/);expect(serializeState(s)).toBe(before);
});
it('older Combine uses its actual saved initial review, not guessed omission provenance',()=>{
 let s=state(),p=proposal(s,75);delete p.generatedExercises;delete p.userEdits;draft(s,p);s=apply(s,p);
 delete s.todayAdaptation.generatedExercises;delete s.todayAdaptation.userEdits;
 const removed=s.todayAdaptation.workout.exercises.find(e=>exerciseCatalog[e.exerciseId].kind==='isolation');s.todayAdaptation.workout.exercises=s.todayAdaptation.workout.exercises.filter(e=>e.id!==removed.id);
 const r=revise(s,s.todayAdaptation,90);expect(r.workout.exercises.some(e=>e.exerciseId===removed.exerciseId)).toBe(false);expect(apply(s,r).todayAdaptation.id).toBe(p.id);
 s.conversations=[];expect(buildCombinedRevision(s,{base:s.todayAdaptation,minutes:90}).error).toMatch(/no saved original review/);
});
it('non-keyword provider revision is routed by exact current ID and never applies',async()=>{
 let s=state();s=apply(s,proposal(s));const before=serializeState(s);
 vi.stubGlobal('fetch',vi.fn(async(url,options)=>({ok:true,json:async()=>String(url).endsWith('/status')?{available:true}:{data:{text:'I can review that change.',action:{type:'revise-combined-workout',targetWorkoutId:s.todayAdaptation.id,timeMode:'total',minutes:75}}}})));
 const r=await AIService.coach(s,'Please make use of the extra quarter hour I have for that joint session.');expect(r.action?.proposal.requestedMinutes,r.text).toBe(75);expect(serializeState(s)).toBe(before);
 const payload=JSON.parse(fetch.mock.calls.find(([url])=>!String(url).endsWith('/status'))[1].body).payload;expect(payload.context.combineRevisionContext[0].id).toBe(s.todayAdaptation.id);
});
