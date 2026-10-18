import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {exerciseCatalog,matchImportedExerciseName,serializeState,deserializeState,startWorkout,adaptedTemplateForToday} from './domain.js';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
import {combinedPrescriptionReview,combinedExerciseIssues} from './combineExerciseReview.js';
import {coachCombineReply,combineRecoveryForEntry} from './coachCombine.js';
import {customExerciseSnapshot,createCustomExerciseRecord,registerCustomExerciseRecord} from './customExercises.js';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {pendingCoachWorkflows,cancelCoachWorkflows} from './coachConversations.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const request=state=>({sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:75});
function imported(){const state=combineExample(),exercise=state.program.days[0].exercises[0];
 state.program.source='ai-import';exercise.exerciseId=matchImportedExerciseName('Lateral skater hops').exerciseId;
 exercise.originalImportedName='Lateral skater hops';exercise.importedName='Lateral skater hops';exercise.matchStatus='alias';
 exercise.loadRequirement='none';exercise.sets.forEach(s=>s.weight=null);return {state,exercise};
}
it('a known imported alias does not require optional name review',()=>{
 const {state,exercise}=imported(),before=structuredClone(state);
 expect(exercise.exerciseId).toBe('wg-skater-hop');expect(exerciseCatalog[exercise.exerciseId].equipment).toEqual(['bodyweight']);
 const result=buildCombinedProposal(state,request(state));expect(result.status,result.error).toBe('ready');expect(state).toEqual(before);
});
it('complete custom metadata supports combination without requiring a library match',()=>{
 let state=combineExample();const exercise=state.program.days[0].exercises[0];
 const record=createCustomExerciseRecord({id:'custom-combine-press',name:'My press',equipment:['dumbbells'],primaryMuscle:'Chest',pattern:'horizontal-push',loggingType:'weight_reps'});
 registerCustomExerciseRecord(state,record);const item=customExerciseSnapshot(record);
 Object.assign(exercise,{exerciseId:item.id,exerciseSource:'custom',importedExercise:item,importedName:item.name,programmingRole:'main',matchStatus:'confirmed-custom'});
 state=deserializeState(serializeState(state));
 const before=structuredClone(state),r=buildCombinedProposal(state,request(state));expect(r.status,r.error).toBe('ready');
 const kept=r.proposal.workout.exercises.find(e=>e.exerciseId===item.id);expect(kept.importedExercise).toEqual(item);
 const applied=applyCombinedProposal(state,r.proposal,()=>true);
 expect(startWorkout(applied,adaptedTemplateForToday(applied)).exercises.some(e=>e.exerciseId===item.id)).toBe(true);
 const restored=deserializeState(serializeState(applied));
 expect(restored.program.days).toEqual(applied.program.days);
 const active=startWorkout(restored,adaptedTemplateForToday(restored));expect(active.exercises.some(e=>e.exerciseId===item.id)).toBe(true);
 const restricted=structuredClone(restored);restricted.profile.avoid='Avoid chest exercises';
 expect(()=>startWorkout(restricted,adaptedTemplateForToday(restricted))).toThrow(/equipment or restrictions/);
 expect(state).toEqual(before);expect(applied.program).toEqual(state.program);expect(applied.workouts).toEqual(state.workouts);
});
it('unknown original names explain combination metadata needs, without making matching mandatory for training',()=>{
 const {state,exercise}=imported();Object.assign(exercise,{exerciseId:'imported-custom-hop',matchStatus:'original',importedExercise:{id:'imported-custom-hop',name:'Lateral skater hops',pattern:null,equipment:null,muscles:null}});
 const r=buildCombinedProposal(state,request(state));expect(r.status).toBe('conflict');expect(r.combineReviewRequired.issues[0]).toMatchObject({reason:'definition',exerciseEntryId:exercise.id,workoutId:state.program.days[0].id});
 expect(r.combineReviewRequired.issues[0].message).toContain('optional for using your original plan');
});
it('a partial imported prescription has a specific stable target and can be resolved without reviewing the whole plan',async()=>{
 const {state,exercise}=imported();exercise.partialPrescription={missing:['sets']};exercise.sets=[];
 const before=structuredClone(state),reply=await coachCombineReply(state,'Combine Push and Pull in 75 minutes');
 expect(reply.action).toBeNull();expect(reply.combineReviewRequired.issues).toEqual([expect.objectContaining({reason:'prescription',exerciseEntryId:exercise.id,workoutId:state.program.days[0].id})]);expect(state).toEqual(before);
 const review=combinedPrescriptionReview(state.program,[exercise.id]);expect(review.issues).toHaveLength(1);
 expect(resolvePartialPrescription(exercise,{sets:2})).toBe(true);
 expect(exercise.repMin).toBe(before.program.days[0].exercises[0].repMin);expect(exercise).not.toHaveProperty('partialPrescription');
 const retried=await coachCombineReply(state,'Prepare the combined workout again.',{selection:{sourceIds:reply.combineReviewRequired.sourceIds,minutes:75}});
 expect(retried.action?.type,retried.text).toBe('combine-workouts');expect(state.todayAdaptation).toBeNull();expect(state.workouts).toEqual(before.workouts);
});
it.each([
 ['equipment',s=>{s.profile.equipment=['bodyweight'];s.gymProfiles.forEach(g=>g.equipment=['bodyweight']);}],
 ['restriction',s=>{s.profile.avoid='Avoid incline dumbbell press';}],
])('retains the real %s guard with a specific reason', (reason,change)=>{
 const state=combineExample();change(state);const before=structuredClone(state),r=buildCombinedProposal(state,request(state));
 expect(r.status).toBe('conflict');expect(r.combineReviewRequired?.issues.map(i=>i.reason),r.error).toContain(reason);expect(state).toEqual(before);
});
it('keeps the explicit effort floor even when the imported target is unspecified',()=>{
 const state=combineExample(),exercise=state.program.days[0].exercises[0];exercise.targetRir=null;
 const issues=combinedExerciseIssues([exercise],state.profile,{status:'constraints_active',constraints:{minRirByExerciseId:{[exercise.exerciseId]:3}}});
 expect(issues[0]).toMatchObject({reason:'effort'});expect(issues[0].message).toContain('at least 3 RIR');
});
it('a forged imported snapshot never overrides a restricted library exercise',()=>{
 const state=combineExample(),exercise=state.program.days[0].exercises[0];state.profile.avoid='Avoid incline dumbbell press';
 exercise.importedExercise={...exerciseCatalog['barbell-curl'],id:exercise.exerciseId};
 expect(buildCombinedProposal(state,request(state)).combineReviewRequired.issues[0].reason).toBe('restriction');
});
it('does not turn optional matching or preserved source notes into prescription decisions',()=>{
 const {state,exercise}=imported();state.program.importMetadata={sourceNotes:[{text:'Keep this cue'}]};
 expect(combinedPrescriptionReview(state.program,[exercise.id])).toBeNull();
 expect(combinedPrescriptionReview(state.program,['deleted'])).toBeNull();
});
it.each([null,45])('retry preserves the explicitly chosen %s time target',async minutes=>{
 const state=combineExample(),r=await coachCombineReply(state,'Prepare the combined workout again.',{selection:{sourceIds:request(state).sourceIds,minutes}});
 expect(r.action?.proposal.requestedMinutes,r.text).toBe(minutes);
});
it('an already saved legacy dead-end gets a recovery link from its actual source/time question, without rewriting chat',()=>{
 const {state,exercise}=imported();exercise.partialPrescription={missing:['sets']};exercise.sets=[];
 const sourceIds=request(state).sourceIds,messages=[{id:'q',reply:{combineRequest:{step:'time',sourceIds}}},{id:'a',user:'No strict limit',reply:{text:'Review Lateral skater hops against your current equipment, restrictions or unresolved prescription first. No workout was changed.'}}];
 const before=structuredClone(messages),recovery=combineRecoveryForEntry(state,messages);
 expect(recovery).toMatchObject({sourceIds,minutes:null,planId:state.program.id,profileId:state.profile.id});expect(messages).toEqual(before);
 messages[0].reply.combineRequest.sourceIds=['obsolete','source'];expect(combineRecoveryForEntry(state,messages)).toBeNull();
});
it('the specific recovery replaces the old time question as workflow owner, supports typed retry, and can be cancelled',async()=>{
 const {state,exercise}=imported();exercise.partialPrescription={missing:['sets']};exercise.sets=[];
 state.activeCoachConversationId='current';const first=await coachCombineReply(state,'Combine Push and Pull');
 state.conversations=[{id:'time',conversationId:'current',reply:first}];
 const blocked=await coachCombineReply(state,'75 min');state.conversations.push({id:'blocked',conversationId:'current',reply:blocked});
 expect(pendingCoachWorkflows(state).map(e=>e.id)).toEqual(['blocked']);
 resolvePartialPrescription(exercise,{sets:2});const retry=await coachCombineReply(state,'60 min');expect(retry.action?.proposal.requestedMinutes,retry.text).toBe(60);
 const cancelled=cancelCoachWorkflows(state);expect(pendingCoachWorkflows(cancelled)).toEqual([]);expect(cancelled.conversations.at(-1)).toMatchObject({coachWorkflowStatus:'cancelled',combineReviewCancelled:true});expect(state.conversations.at(-1)).not.toHaveProperty('coachWorkflowStatus');
});
