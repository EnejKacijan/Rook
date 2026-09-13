import {it,expect,vi} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout,completeWorkout,workingSetCanComplete,targetLabel,validateProgram} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {buildWeeklyPlanExport,buildWorkoutExport} from './workoutExport.js';
import {hasUnspecifiedRepTarget,prComparableSet} from './advancedLogging.js';
import {estimatedOneRepMax} from './performanceInsights.js';
import {importExerciseReviewGroups} from './importResolution.js';
import {hybridOwnerNotes} from './hybridImportFixture.js';
import {importResolutionNotes} from './importResolutionFixture.js';
import {combineExample} from './combineWorkouts.fixture.js';
import {buildCombinedProposal,combineSources} from './combineWorkouts.js';
import {buildTodayAdjustment} from './adjustToday.js';
const parse=source=>AIService.importTrainingPlan(blankState().profile,`Monday: Upper\n${source}`,{review:true});
const reload=s=>deserializeState(JSON.parse(JSON.stringify(s)));
it.each(['Bench Press 4 sets','Bench Press - 4 seti','Chest flys - 4 seti','Cable Row 4 sets RIR 2'])('accepts missing rep/load targets without numeric review: %s',async source=>{
 const r=await parse(source),e=r.program.days[0].exercises[0];
 expect(r.sourceReview.issues.filter(i=>i.field==='prescription')).toEqual([]);expect(e.partialPrescription).toBeUndefined();
 expect(e.sets).toHaveLength(4);expect([e.repMin,e.repMax]).toEqual([null,null]);expect(e.failureTarget).toBe(false);expect(hasUnspecifiedRepTarget(e)).toBe(true);
 expect(e.sets.every(s=>s.reps===null&&s.weight===null&&!s.completed)).toBe(true);
 expect(targetLabel(e)).toContain('4 sets · Reps not specified');
});
it.each([['Bench Press 3x8',8,8,null],['Squat 4x6–8 60kg',6,8,60],['Pull Up 3xAMRAP',null,null,null],['Pull Up 3xfailure',null,null,null]])('retains known targets and explicit open intent: %s',async(source,min,max,load)=>{
 const r=await parse(source),e=r.program.days[0].exercises[0];expect([e.repMin,e.repMax,e.sets[0].weight]).toEqual([min,max,load]);expect(e.repTarget).toBeUndefined();expect(r.sourceReview.issues.filter(i=>i.field==='prescription')).toEqual([]);
 if(min===null)expect(e.failureTarget).toBe(true);
});
it('Apply/reload/weekly prescription/active/history/export keep targets distinct from actual results',async()=>{
 const r=await parse('Bench Press 4 sets');
 let s=preparePlanImport(blankState(),r.program,r.profile,{date:'2026-09-14',weekday:'Mon'});
 const plan=JSON.stringify(s.program);s=reload(s);const template=s.program.days[0];
 expect(validateProgram(template? s.program:null,{...s.profile,sessionMinutes:null},{allowImportedExercises:true,preserveSchedule:true,ignoreTrainingSafety:true}).valid).toBe(true);
 expect(buildWeeklyPlanExport({state:s}).text).toContain('Reps not specified - Load not specified');
 s.activeWorkout=startWorkout(s,template);let e=s.activeWorkout.exercises[0];
 expect(e.repMin).toBeNull();expect(e.sets.every(set=>set.reps===null&&set.weight===null&&!set.completed)).toBe(true);
 expect(workingSetCanComplete(e,e.sets[0])).toBe(false);expect(prComparableSet(e,e.sets[0])).toBe(false);
 const empty=completeWorkout(s);expect(empty.workouts).toHaveLength(0);expect(empty.activeWorkout).toBeNull();
 Object.assign(e.sets[0],{reps:7,weight:40});expect(workingSetCanComplete(e,e.sets[0])).toBe(true);e.sets[0].completed=true;
 const done=reload(completeWorkout(s)),actual=done.workouts.at(-1);expect(actual.exercises[0].sets[0]).toMatchObject({reps:7,weight:40,completed:true});
 expect(buildWorkoutExport({workout:actual,completed:true}).text).toContain('7 reps - 40 kg');
 expect(buildWeeklyPlanExport({state:done}).text).toContain('Reps not specified - Load not specified');
 expect(done.program.days[0].exercises[0].sets.every(set=>set.reps===null&&set.weight===null&&!set.completed)).toBe(true);
 expect(estimatedOneRepMax(40,7)).toBeGreaterThan(40);
 const next=startWorkout(done,done.program.days[0]).exercises[0];expect(next.sets.every(set=>set.reps===null&&set.weight===null)).toBe(true);
 expect(JSON.parse(plan).days[0].exercises[0]).toEqual(done.program.days[0].exercises[0]);
});
it('a set-count range still needs an explicit choice',async()=>{
 const r=await parse('Cable Row - 3–4 seti'),e=r.program.days[0].exercises[0];expect(e.sets).toHaveLength(0);expect(e.partialPrescription).toMatchObject({missing:['sets'],setRange:[3,4]});
 expect(resolvePartialPrescription(e,{sets:2})).toBe(false);expect(resolvePartialPrescription(e,{sets:4})).toBe(true);expect(e.repMin).toBeNull();expect(e.sets).toHaveLength(4);
});
it('minimum is not relabelled as unspecified, exact reps, or a guessed range',async()=>{
 const r=await parse('Bench Press - 3 seti vsaj 3 repi'),e=r.program.days[0].exercises[0];expect([e.repMin,e.repMax]).toEqual([3,null]);expect(hasUnspecifiedRepTarget(e)).toBe(false);expect(e.partialPrescription.repFloor).toBe(3);expect(r.sourceReview.issues.some(i=>i.field==='prescription')).toBe(true);
});
it('dated table with an empty rep/load cell preserves the known count and weekday',async()=>{
 const r=await AIService.importTrainingPlan(blankState().profile,'Day\tExercise\tSets\tReps\tLoad\nMonday\tBench Press\t3\t\t',{review:true});
 expect(r.program.days[0].weekday).toBe('Mon');expect(r.program.days[0].exercises[0]).toMatchObject({repMin:null,repMax:null,repTarget:'unspecified'});expect(r.program.days[0].exercises[0].sets).toHaveLength(3);expect(importExerciseReviewGroups(r.sourceReview,r.program)).toHaveLength(0);
});
it('reps-only/load-only/missing sets still require only the missing structure',async()=>{
 for(const source of ['Bench Press 60kg','Cable Row 10 reps','Pull Up AMRAP','Cable Row']){
  const r=await parse(source),e=r.program.days[0].exercises[0];expect(e.partialPrescription.missing).toEqual(['sets']);expect(e.sets).toHaveLength(0);
  expect(resolvePartialPrescription(e,{sets:3})).toBe(true);expect(e.sets).toHaveLength(3);expect(e.repMin).toBe(source.includes('10 reps')?10:null);
 }
});
it('bodyweight and per-side use actual-result validation, not missing target guesses',async()=>{
 const r=await parse('Push Up 3 sets'),s={...blankState(),program:r.program};const e=startWorkout(s,s.program.days[0]).exercises[0];
 expect(workingSetCanComplete(e,e.sets[0])).toBe(false);e.sets[0].reps=12;expect(workingSetCanComplete(e,e.sets[0])).toBe(true);expect(e.sets[0].weight).toBeNull();
 e.loggingMode='per_side';e.sets[0].reps=null;e.sets[0].sides={left:{reps:8},right:{reps:7}};expect(workingSetCanComplete(e,e.sets[0])).toBe(true);
});
it('owner fixtures retain only genuine remaining groups, with no network for absence',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');try{
  const r=await AIService.importTrainingPlan(blankState().profile,hybridOwnerNotes,{review:true});expect(importExerciseReviewGroups(r.sourceReview,r.program)).toHaveLength(6);
  expect(r.sourceReview.issues.filter(i=>i.field==='prescription').map(i=>i.partialPrescription.missing)).toEqual([['reps'],['sets'],['sets']]);
  const older=await AIService.importTrainingPlan(blankState().profile,importResolutionNotes,{review:true});expect(older.program.days.flatMap(d=>d.exercises).filter(e=>e.importedRoundPrescription)).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
 }finally{fetch.mockRestore();}
});
it('absence alone also needs neither AI nor a review-only API entry',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');try{
  const r=await AIService.importTrainingPlan(blankState().profile,'Monday: Upper\nBench Press 4 sets');
  expect(r.program.days[0].exercises[0]).toMatchObject({repTarget:'unspecified',repMin:null,repMax:null});expect(fetch).not.toHaveBeenCalled();
 }finally{fetch.mockRestore();}
});
it('an unspecified reps marker cannot authorize an unresolved timed contract',async()=>{
 const r=await parse('Bench Press 3 sets'),e=r.program.days[0].exercises[0];e.exerciseId='plank';e.measure='seconds';
 expect(validateProgram(r.program,null,{allowImportedExercises:true,preserveSchedule:true,ignoreTrainingSafety:true}).valid).toBe(false);
});
it('optional match source retains its full bounded excerpt including known numeric values',async()=>{
 const r=await parse('Chest flys - 4 seti'),groups=importExerciseReviewGroups(r.sourceReview,r.program);
 expect(groups).toHaveLength(0);
 expect(r.program.days[0].exercises[0].hybridSource.sourceSpan.text).toBe('Chest flys - 4 seti');
});
it('Adjust and Combine estimates/proposals preserve open targets without writing assumptions',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));
 try{
  const s=combineExample();s.program.source='imported';
  for(const e of s.program.days.flatMap(d=>d.exercises)){e.repMin=null;e.repMax=null;e.repTarget='unspecified';e.sets.forEach(set=>{set.reps=null;set.weight=null;});}
  const before=JSON.stringify(s.program),p=buildCombinedProposal(s,{sourceIds:combineSources(s).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:60});
  expect(p.status,p.error).toBe('ready');expect(p.proposal.workout.exercises.every(e=>hasUnspecifiedRepTarget(e)&&e.sets.every(set=>set.reps===null&&set.weight===null))).toBe(true);
  expect(JSON.stringify(s.program)).toBe(before);
  vi.setSystemTime(new Date('2026-09-14T12:00:00'));s.selectedDate='2026-09-14';
  const a=buildTodayAdjustment(s,{mode:'less-time',minutes:15});expect(a.status,a.reason).toBe('ready');
  expect(a.proposal.workout.exercises.every(e=>hasUnspecifiedRepTarget(e)&&e.sets.every(set=>set.reps===null&&set.weight===null))).toBe(true);
  expect(JSON.stringify(s.program)).toBe(before);
 }finally{vi.useRealTimers();}
});
