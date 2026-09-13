import { it,expect,vi } from 'vitest';
import { AIService } from './aiService.js';
import { blankState,exerciseCatalog,matchImportedExerciseName,serializeState,deserializeState,startWorkout,workingSetCanComplete,completeWorkout } from './domain.js';
import { importExerciseReviewGroups } from './importResolution.js';
import { HistoryImportBatch } from './historyImportBatch.js';
import { matchHistoricalExercise } from './historicalExerciseMatching.js';
import { applySavedPlanImportMatch,keepPlanImportOriginal,planImportSafetyIssues } from './planImportMatching.js';
import { preparePlanImport } from './planImportTransaction.js';
import { buildWeeklyPlanExport } from './workoutExport.js';
import { hevyCsv,hevyRow } from '../scripts/history-import-fixtures.mjs';
const parse=text=>AIService.importTrainingPlan(blankState().profile,`Monday: Upper\n${text}`,{review:true});
const reload=state=>deserializeState(serializeState(state));
it.each(['Bench Press','Cable Biceps Curl','Single Leg Standing Calf Raise','Smith Machine Squat','Side Bend','Chest flys'])('History and Notes share cheap identity proofs for %s',name=>{
 expect(matchImportedExerciseName(name).exerciseId).toBe(matchHistoricalExercise(name).exerciseId);
});
it('job caches unique matches across files, defers advanced work, hashes/dedupes once, and optional review leaves results intact',async()=>{
 const batch=new HistoryImportBatch(),state=blankState();
 const file=day=>({name:`${day}.csv`,buffer:new TextEncoder().encode(hevyCsv(['Bench Press','Side Bend','Side Bend'].map((exercise_title,i)=>hevyRow({exercise_title,start_time:`${day} Mar 2025, 17:00`,set_index:String(i)})))).buffer});
 await batch.read([file(1),file(2)]);
 const preview=await batch.parse([{sheetIndex:0},{sheetIndex:0}],state);
 expect(preview.timing.stages.matching.calls).toBe(2);
 expect(preview.timing.stages['optional advanced matching']).toBeUndefined();
 expect(preview.timing.stages['duplicate detection'].calls).toBe(1);
 expect(preview.timing.stages.hashes.inputs).toBe(2);
 expect(preview.summary.suggestedExercises).toBe(0);
 const before=JSON.stringify(batch.preview.workouts);
 batch.reviewMatches(state);const reviewed=batch.reviewMatches(state);
 expect(reviewed.timing.stages['optional advanced matching'].calls).toBe(1);
 expect(JSON.stringify(batch.preview.workouts)).toBe(before);
 expect(batch.apply(state).state.workouts).toHaveLength(2);
});
it('Chest flys retains four sets and empty targets, with no mandatory identity question or catalogue writes',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');try{
 const r=await parse('Chest flys - 4 seti');const e=r.program.days[0].exercises[0];
 expect(e.matchStatus).toBe('original');expect(importExerciseReviewGroups(r.sourceReview,r.program)).toEqual([]);
 expect(e.sets).toHaveLength(4);expect([e.repMin,e.repMax,e.sets[0].weight]).toEqual([null,null,null]);
 const state=blankState(),before=serializeState(state);applySavedPlanImportMatch(e,state);
 expect(serializeState(state)).toBe(before);expect(fetch).not.toHaveBeenCalled();
 let saved=reload(preparePlanImport(state,r.program,r.profile,{date:'2026-09-14',weekday:'Mon'}));
 expect(saved.customExercises).toHaveLength(0); // identity is scoped in the plan, not an invented rich catalogue record
 saved.activeWorkout=startWorkout(saved,saved.program.days[0]);const active=saved.activeWorkout.exercises[0],set=active.sets[0];
 expect(workingSetCanComplete(active,set)).toBe(false);Object.assign(set,{reps:9,weight:12,completed:true});
 saved=reload(completeWorkout(saved));expect(saved.workouts[0].exercises[0].sets[0].reps).toBe(9);
 expect(saved.program.days[0].exercises[0].repMin).toBeNull();
 expect(buildWeeklyPlanExport({state:saved}).text).toContain('Reps not specified');
 }finally{fetch.mockRestore();}
});
it('explicit Keep original overrides later canonical/alias lookup after atomic save/reload',async()=>{
 const r=await parse('Bench Press 3x8'),e=r.program.days[0].exercises[0];keepPlanImportOriginal(e);
 const saved=reload(preparePlanImport(blankState(),r.program,r.profile,{date:'2026-09-14',weekday:'Mon'}));
 const next=await parse('Bench Press 3x10');applySavedPlanImportMatch(next.program.days[0].exercises[0],saved);
 expect(next.program.days[0].exercises[0]).toMatchObject({matchStatus:'original',repMin:10,importedName:'Bench Press'});
});
it('original fallback cannot bypass saved restrictions, while historical facts remain importable',async()=>{
 const r=await parse('Chest flys 4 sets'),state=blankState();state.profile.avoid='no chest exercises';
 expect(planImportSafetyIssues(r.program,state.profile).length).toBeGreaterThan(0);
 expect(()=>preparePlanImport(state,r.program,r.profile)).toThrow();
});
it.each(['Cable Row 3–4 sets','Bench Press 60kg','3 rounds\nPush Up 10 reps\nSquat 15 reps'])('real structural ambiguity stays required: %s',async text=>{
 const r=await parse(text);expect(importExerciseReviewGroups(r.sourceReview,r.program).length).toBeGreaterThan(0);
});
