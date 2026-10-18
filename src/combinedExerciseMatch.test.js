import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal,prepareCombinedExerciseMatch,combineFingerprint} from './combineWorkouts.js';
import {exerciseCatalog,serializeState,deserializeState,estimateWorkoutMinutes} from './domain.js';
import {suggestedCombinedExerciseMatch} from './combineExerciseReview.js';
import {compileProfileTrainingSafety} from './trainingSafety.js';
import {effectiveGymContext} from './gymProfiles.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function matchFixture(){
 let state=combineExample();state.program.source='ai-import';
 const exercise=state.program.days[0].exercises[0];
 Object.assign(exercise,{exerciseId:'imported-custom-hop',exerciseSource:'imported-custom',matchStatus:'original',importMappingDecision:'original',originalImportedName:'Lateral skater hops',importedName:'Lateral skater hops',
   importedExercise:{id:'imported-custom-hop',name:'Lateral skater hops',source:'imported',pattern:null,equipment:null,muscles:null},loadRequirement:'none',repMin:10,repMax:10,
   sourceSpan:{text:'Lateral skater hops 2 × 10'},loggingMode:'normal',personalNote:'Keep my reminder',restSeconds:60});
 exercise.sets=exercise.sets.slice(0,2).map(set=>({...set,weight:null,reps:10}));
 state.program.days.forEach(day=>{day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile,state.program);});
 state=deserializeState(serializeState(state));
 const request={sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:75};
 const result=buildCombinedProposal(state,request),issue=result.combineReviewRequired.issues[0];
 return {state,request:result.combineReviewRequired,issue,target:{workoutId:issue.workoutId,exerciseEntryId:issue.exerciseEntryId,exerciseId:issue.exerciseId,matchExerciseId:'wg-skater-hop',fingerprint:combineFingerprint(state)}};
}
it('offers the proven Lateral skater hops alias directly, without saving or changing state',()=>{
 const {state,issue}=matchFixture(),before=structuredClone(state);
 expect(issue.suggestedMatch).toEqual({exerciseId:'wg-skater-hop',name:'Skater Hop'});expect(state).toEqual(before);
});
it('confirmation links only identity, retaining targets, loads, set IDs, source, notes and all history',()=>{
 const {state,request,target}=matchFixture(),before=structuredClone(state),next=prepareCombinedExerciseMatch(state,request,target);
 const old=state.program.days[0].exercises[0],linked=next.program.days[0].exercises[0];
 expect(linked).toMatchObject({exerciseId:'wg-skater-hop',matchStatus:'confirmed-match',importMappingDecision:'match',importMatchSource:{name:'Lateral skater hops'}});
 for(const key of ['sets','repMin','repMax','restSeconds','targetRir','loggingMode','loadRequirement','defaultIncrement','personalNote','sourceSpan'])expect(linked[key],key).toEqual(old[key]);
 expect(linked.id).toBe(old.id);expect(next.program.days[0].exercises.slice(1)).toEqual(before.program.days[0].exercises.slice(1));expect(next.program.days[1]).toEqual(before.program.days[1]);
 expect(next.workouts).toEqual(before.workouts);expect(next.profile).toEqual(before.profile);expect(next.exerciseAliases).toEqual(before.exerciseAliases);expect(next.activeWorkout).toBeNull();expect(next.todayAdaptation).toBeNull();
 expect(next.planVersions).toHaveLength(before.planVersions.length+1);expect(next.program.version).toBe(before.program.version+1);expect(state).toEqual(before);
 expect(buildCombinedProposal(next,{sourceIds:request.sourceIds,minutes:request.minutes}).status).toBe('ready');
 const loaded=deserializeState(serializeState(next));expect(loaded.program.days[0].exercises[0].exerciseId).toBe('wg-skater-hop');
});
it('a repeated confirmation is idempotent and creates no second plan version',()=>{
 const {state,request,target}=matchFixture(),next=prepareCombinedExerciseMatch(state,request,target),before=structuredClone(next);
 expect(prepareCombinedExerciseMatch(next,request,target)).toBe(next);expect(next).toEqual(before);
});
it('linking a weighted alias preserves real entered loads instead of clearing them like exercise replacement',()=>{
 const {state}=matchFixture(),exercise=state.program.days[0].exercises[0];
 Object.assign(exercise,{originalImportedName:'T-Bar Row',importedName:'T-Bar Row',loadRequirement:'required',sourceSpan:{text:'T-Bar Row 2 × 10 · 40 / 42.5 kg'}});
 delete exercise.importMatchSource;exercise.importedExercise.name='T-Bar Row';exercise.sets.forEach((set,index)=>set.weight=index?42.5:40);
 const result=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:75});
 const issue=result.combineReviewRequired.issues[0],before=structuredClone(exercise.sets);
 expect(issue.suggestedMatch).toEqual({exerciseId:'t-bar-row',name:'T-Bar Row'});
 const next=prepareCombinedExerciseMatch(state,result.combineReviewRequired,{workoutId:issue.workoutId,exerciseEntryId:issue.exerciseEntryId,exerciseId:issue.exerciseId,matchExerciseId:'t-bar-row',fingerprint:result.combineReviewRequired.fingerprint});
 expect(next.program.days[0].exercises[0].sets).toEqual(before);expect(state.program.days[0].exercises[0].sets).toEqual(before);
});
it.each(['profile','plan','entry','setup','prescription','target','active'])('rejects stale or incompatible %s confirmation without mutation',kind=>{
 const {state,request,target}=matchFixture();
 if(kind==='profile')state.profile.id='other';if(kind==='plan')state.program.id='other';if(kind==='entry')state.program.days[0].exercises[0].id='other';
 if(kind==='setup')state.profile.avoid='Avoid skater hops';if(kind==='prescription')state.program.days[0].exercises[0].sets[0].reps=12;
 if(kind==='target')target.matchExerciseId='leg-press';if(kind==='active')state.activeWorkout={id:'active'};
 const before=structuredClone(state);expect(()=>prepareCombinedExerciseMatch(state,request,target)).toThrow();expect(state).toEqual(before);
});
it.each(['uncertain name','duration mismatch','snapshot duration mismatch','load mismatch','recorded load','restriction','partial target','source choice'])('does not offer a quick confirmation for %s',kind=>{
 const {state}=matchFixture(),exercise=state.program.days[0].exercises[0];
 if(kind==='uncertain name')exercise.originalImportedName=exercise.importedName='mystery hopping movement';
 if(kind==='duration mismatch')exercise.measure='seconds';if(kind==='snapshot duration mismatch'){delete exercise.measure;exercise.importedExercise.measure='seconds';}if(kind==='load mismatch')exercise.loadRequirement='required';
 if(kind==='recorded load')exercise.sets[0].weight=10;if(kind==='restriction')state.profile.avoid='Avoid skater hops';
 if(kind==='partial target')exercise.partialPrescription={missing:['sets']};if(kind==='source choice')exercise.hybridSource={unresolved:true};
 const profile=effectiveGymContext(state,{}).profile,safety=compileProfileTrainingSafety(profile,Object.values(exerciseCatalog));
 expect(suggestedCombinedExerciseMatch(exercise,profile,safety)).toBeNull();
});
