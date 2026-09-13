import {it,expect,vi} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout,completeWorkout,workingSetCanComplete,targetLabel,validateProgram} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
import {importExerciseReviewGroups} from './importResolution.js';
import {buildWeeklyPlanExport,buildWorkoutExport} from './workoutExport.js';
import {loggingUnit} from './advancedLogging.js';

const parse=source=>AIService.importTrainingPlan(blankState().profile,`Monday: Functional\n${source}`,{review:true});
const reload=state=>deserializeState(JSON.parse(JSON.stringify(state)));

it.each(['Y Balance Reach – 2 kroga','Push Up 2 rounds','Cable Row 2 round','Monster Walk 2 krogi','Bench Press 2 runden'])('directly accepts single-exercise inline rounds without invented targets: %s',async source=>{
 const result=await parse(source),e=result.program.days[0].exercises[0];
 expect(e.importedRoundPrescription).toEqual({count:2});expect(loggingUnit(e)).toBe('round');
 expect(e.partialPrescription).toBeUndefined();expect(e.importPrescriptionCorrections).toBeUndefined();
 expect(e.sets).toHaveLength(2);expect(e.repMin).toBeNull();expect(e.repMax).toBeNull();
 expect(e.sets.every(s=>s.reps===null&&s.weight===null&&!s.completed)).toBe(true);
 expect(e.targetRir).toBeNull();expect(e.restSeconds).toBeNull();
 expect(e.notes||'').not.toMatch(/^(?:a|i|ov)$/);
 expect(result.sourceReview.issues.filter(i=>i.field==='prescription')).toEqual([]);
 expect(targetLabel(e)).toBe('2 rounds · Reps not specified');
 const text=buildWorkoutExport({workout:result.program.days[0]}).text;
 expect(text).toContain('2 rounds');expect(text).toContain('Round 1. Reps not specified');expect(text).not.toContain('independent sets');
});

it('needs no acknowledgement or AI; applies, reloads and logs actual reps without mutating the source',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');
 try{
  const result=await parse('Y Balance Reach – 2 kroga');expect(importExerciseReviewGroups(result.sourceReview,result.program)).toEqual([]);
  let state=reload(preparePlanImport(blankState(),result.program,result.profile,{date:'2026-09-14',weekday:'Mon'}));
  const source=JSON.stringify(state.program);
  state.activeWorkout=startWorkout(state,state.program.days[0]);const e=state.activeWorkout.exercises[0];
  expect(e.importedRoundPrescription).toEqual({count:2});expect(e.sets).toHaveLength(2);
  expect(workingSetCanComplete(e,e.sets[0])).toBe(false);expect(completeWorkout(state).workouts).toHaveLength(0);
  Object.assign(e.sets[0],{reps:7,weight:null});expect(workingSetCanComplete(e,e.sets[0])).toBe(true);e.sets[0].completed=true;
  // The existing Add row operation is session-local; provenance remains original.
  e.sets.push({...e.sets[1],id:'extra-round',added:true,planned:false});
  state=reload(state);expect(state.activeWorkout.exercises[0].sets).toHaveLength(3);
  expect(state.activeWorkout.exercises[0].importedRoundPrescription.count).toBe(2);
  state=reload(completeWorkout(state));expect(JSON.stringify(state.program)).toBe(source);
  expect(buildWorkoutExport({workout:state.workouts.at(-1),completed:true}).text).toContain('Round 1. ✓ 7 reps');
  for(const includeNotes of [false,true])expect(buildWeeklyPlanExport({state,includeNotes}).text).toContain('Round 1. Reps not specified');
  expect(fetch).not.toHaveBeenCalled();
 }finally{fetch.mockRestore();}
});

it.each([['Push Up 2 rounds x 10',10,'2 rounds · 10 reps'],['Plank 2 rounds x 30 sec',30,'2 rounds · 30 sec']])('preserves explicit rep/duration values: %s',async(source,reps,label)=>{
 const result=await parse(source),e=result.program.days[0].exercises[0];
 expect(e.importedRoundPrescription).toEqual({count:2});expect(e.sets.map(s=>s.reps)).toEqual([reps,reps]);
 expect(e.repMin).toBe(reps);expect(e.repMax).toBe(reps);expect(targetLabel(e)).toBe(label);
 expect(e.restSeconds).toBeNull();expect(result.sourceReview.issues.filter(i=>i.field==='prescription')).toEqual([]);
 const restored=reload(preparePlanImport(blankState(),result.program,result.profile,{}));
 expect(restored.program.days[0].exercises[0].restSeconds).toBeNull();
});

it('rounds never supply a missing timer or side result, and ordinary sets retain their unit',async()=>{
 const r=await parse('Plank 2 rounds'),e=r.program.days[0].exercises[0];
 expect(e.repMin).toBeNull();expect(e.repMax).toBeNull();expect(e.partialPrescription.missing).toContain('reps');
 expect(()=>preparePlanImport(blankState(),r.program,r.profile,{})).toThrow();
 const p=await parse('Y Balance Reach 2 rounds'),side=p.program.days[0].exercises[0];side.loggingMode='per_side';
 const active=startWorkout({...blankState(),program:p.program},p.program.days[0]).exercises[0];
 expect(active.sets.every(s=>s.sides?.left?.reps==null&&s.sides?.right?.reps==null)).toBe(true);
 const ordinary=await parse('Cable Row 2 sets');expect(loggingUnit(ordinary.program.days[0].exercises[0])).toBe('set');
 expect(validateProgram(ordinary.program,null,{allowImportedExercises:true,preserveSchedule:true,ignoreTrainingSafety:true}).valid).toBe(true);
});

it('standalone multi-exercise rounds keep the existing circuit blocker',async()=>{
 const r=await parse('3 rounds\nPush Up 10 reps\nBodyweight Squat 15 reps\nThursday: Strength\nBench Press 3x8');
 expect(r.sourceReview.issues.filter(i=>i.field==='roundGroup')).toHaveLength(1);
 expect(r.program.importMetadata.unresolvedRoundGroups).toHaveLength(1);
 expect(()=>buildWeeklyPlanExport({state:{...blankState(),program:r.program}})).toThrow();
});
