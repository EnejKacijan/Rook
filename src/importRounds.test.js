import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {pendingImportIssues} from './planImportReview.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
const parse=source=>AIService.importTrainingPlan(blankState().profile,source,{review:true});
it.each(['3 rounds','3 round','3 rounds:','3 krogi','3 kroge','Circuit 3 rounds'])('blocks %s once at group scope',async directive=>{
 const source=`Monday: Circuit\n${directive}\nPush Up 10 reps\nBodyweight Squat 15 reps\nThursday: Strength\nBench Press 3x8`;
 const r=await parse(source);const issues=pendingImportIssues(r.sourceReview);expect(issues).toHaveLength(1);expect(issues[0].field).toBe('roundGroup');expect(issues[0].source).toBe(`${directive}\nPush Up 10 reps\nBodyweight Squat 15 reps`);expect(issues[0].requiresSourceEdit).toBe(true);expect(r.program.days.map(d=>d.weekday)).toEqual(['Thu']);expect(r.program.days[0].exercises[0].sets).toHaveLength(3);
 expect(r.program.importMetadata.unresolvedRoundGroups).toHaveLength(1);
 const restored=JSON.parse(JSON.stringify(r));expect(pendingImportIssues(restored.sourceReview)).toHaveLength(1);const s=blankState();s.program=restored.program;expect(()=>buildWeeklyPlanExport({state:s})).toThrow(/circuit structure/);
});
it.each(['Push Up 10\nSquat 15','Plank 30 sec\nPush Up 10 reps','Farmer Carry 20 m\nBodyweight Squat 12 reps','Pull Up AMRAP\nPush Up 10'])('preserves unsupported members without fabricated executable values: %s',async members=>{const r=await parse(`Monday: Circuit\n3 rounds:\n${members}`);expect(r.program.days).toEqual([]);expect(pendingImportIssues(r.sourceReview)).toHaveLength(1);expect(r.sourceReview.issues[0].source).toBe(`3 rounds:\n${members}`);expect(r.program.importMetadata.unresolvedRoundGroups[0].source).toContain(members);});
it('keeps two groups distinct and stops at workout section',async()=>{const r=await parse('Monday: Circuit\n3 rounds\nPush Up 10\nSquat 15\n2 rounds\nPlank 30 sec\nFarmer Carry 20 m\nWorkout\nBench Press 3x8');expect(pendingImportIssues(r.sourceReview)).toHaveLength(2);expect(r.sourceReview.issues[0].source).not.toContain('Plank');expect(r.sourceReview.issues[1].source).not.toContain('Bench Press');expect(r.program.days[0].exercises[0].sets[0].reps).toBe(8);});
it('does not change ordinary independent sets',async()=>{const r=await parse('Monday: Circuit\nPush Up 3x10\nSquat 3x15');expect(pendingImportIssues(r.sourceReview)).toEqual([]);expect(r.program.days[0].exercises.map(e=>e.sets.length)).toEqual([3,3]);expect(r.program.days[0].exercises.every(e=>!e.supersetId)).toBe(true);});
it('cannot bypass the blocker via the non-review import path',async()=>{await expect(AIService.importTrainingPlan(blankState().profile,'Monday: Circuit\n3 rounds\nPush Up 10 reps\nSquat 15 reps')).rejects.toThrow(/require source review/);});
