import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {complexPreservationNotes} from './importPreservationFixture.js';
import {pendingImportIssues} from './planImportReview.js';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
const parse=text=>AIService.importTrainingPlan(blankState().profile,text,{review:true});
it('complex five-day source has only executable blockers and every source line preserved',async()=>{
 const result=await parse(complexPreservationNotes),review=result.sourceReview,exercises=result.program.days.flatMap(day=>day.exercises);
 expect(result.program.days).toHaveLength(5);expect(exercises.filter(exercise=>['original','needs-name-review'].includes(exercise.matchStatus)).length).toBeGreaterThanOrEqual(3);
 expect(pendingImportIssues(review).map(issue=>issue.field)).toEqual(['alternative']);
 expect(review.issues.filter(issue=>issue.category==='preserved')).toHaveLength(10);
 expect(exercises.some(exercise=>exercise.importedName==='Y Balance Reach')).toBe(true);
 expect(exercises.some(exercise=>/Kolo/.test(exercise.importedName))).toBe(false);
 const preserved=result.program.importMetadata.sourceNotes.map(note=>note.text).join('\n');
 for(const line of complexPreservationNotes.split('\n').filter(line=>line.trim()))expect(preserved).toContain(line);
 expect(review.issues.some(issue=>issue.category==='exclusion')).toBe(false);
 const rounds=exercises.filter(exercise=>exercise.importedRoundPrescription);
 expect(rounds.map(e=>e.sets.length)).toEqual([2,3]);
 for(const exercise of rounds){
   expect(exercise.repMin).toBeNull();expect(exercise.repMax).toBeNull();expect(exercise.sets.every(set=>set.reps===null)).toBe(true);
 }
 const options=review.issues.find(issue=>issue.field==='alternative').options;
 expect(options.map(option=>[option.sets,option.repMin,option.weight])).toEqual([[3,9,155],[3,8,173]]);
 expect(pendingImportIssues(review,Object.fromEntries(pendingImportIssues(review).map(issue=>[issue.id,true])))).toEqual([]);
});
it('clear shared per-side source maps automatically; an operated leg remains one-sided instruction',async()=>{
 const result=await parse('MONDAY\nLateral Skater Hops 3x12/stran\nForward Single-Leg Hops 2x6/operirana noga\nRear Delt Fly 2x7/stran 35kg');
 expect(result.program.days[0].exercises.map(exercise=>exercise.loggingMode)).toEqual(['per_side','normal','per_side']);
 expect(result.program.days[0].exercises[1].notes).toContain('operirana noga');
 expect(pendingImportIssues(result.sourceReview)).toEqual([]);
});
it('durable scoped source survives backup/restore without adding transient review state',async()=>{
 const result=await parse('MONDAY\nBench Press 3x8\nTechnique: keep the movement controlled.\nSUNDAY - REST\nWalk as desired.');
 const state=blankState();state.program=result.program;state.profile={...state.profile,...result.profile,onboardingComplete:true};
 const archive=await buildBackupArchive(state,[]);const restored=await parseBackupArchive(archive.bytes);
 expect(restored.state.program.importMetadata).toEqual(result.program.importMetadata);
 expect(JSON.stringify(restored.state)).not.toContain('parseReview');expect(JSON.stringify(restored.state)).not.toContain('sourceReview');
});
