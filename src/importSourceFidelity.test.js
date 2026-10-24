import {afterEach,expect,it,vi} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,startWorkout,serializeState,deserializeState,targetLabel} from './domain.js';
import {notesCases} from '../scripts/fixtures/notes-fidelity-corpus.mjs';
import {importConsistencyCorpus} from '../scripts/fixtures/import-consistency-corpus.mjs';
import {pendingImportIssues} from './planImportReview.js';
import {sourceEffort,setSourceDecisionPending} from './importSourceFidelity.js';
import {preparePlanImport} from './planImportTransaction.js';
import {keepPlanImportOriginal} from './planImportMatching.js';
import {removeImportedExercise,undoImportedExerciseRemoval} from './importRemoval.js';
import {warmupPrescriptionLabel} from './warmupPrescription.js';
import {supersetMeta} from './supersets.js';
import {exerciseNotePresentation} from './exerciseNotePresentation.js';

const parse=source=>AIService.importTrainingPlan(blankState().profile,source,{review:true});
const fixture=id=>notesCases.find(c=>c.id===id).source;
const control=id=>importConsistencyCorpus.find(c=>c.id===id).source;
const from=id=>parse(fixture(id));
const exercises=result=>result.program.days.flatMap(d=>d.exercises);
const options={date:'2026-10-19',weekday:'Mon',initial:true};
afterEach(()=>vi.unstubAllGlobals());

it.each(notesCases)('$id preserves source and never imports execution credit',async c=>{
  const fetch=vi.fn(()=>{throw Error('No network fallback allowed');});vi.stubGlobal('fetch',fetch);
  if(['N43','N47'].includes(c.id)){await expect(parse(c.source)).rejects.toThrow(/multiple program weeks|Line 3: Cable Row 0x10/);}
  else {
    const result=await parse(c.source);
    expect(result.sourceReview.lines.map(l=>l.text).join('\n')).toBe(c.source.replace(/\r\n/g,'\n'));
    expect(exercises(result).flatMap(e=>e.sets).every(s=>!s.completed)).toBe(true);
    expect(result.program.importMetadata.sourceNotes.map(n=>n.text).join('\n')).toBe(c.source.replace(/\r\n/g,'\n'));
  }
  expect(fetch).not.toHaveBeenCalled();
});

it('reads lb and rest units from TSV column headers, including execution',async()=>{
  const result=await from('N05'),[bench,row]=exercises(result);
  expect(bench.sets.map(s=>s.weight)).toEqual([61.23,61.23,61.23]);
  expect(row.sets.map(s=>s.weight)).toEqual([40.82,40.82,40.82]);
  expect([bench.restSeconds,row.restSeconds]).toEqual([120,90]);
  expect(pendingImportIssues(result.sourceReview)).toEqual([]);
  const state=preparePlanImport(blankState(),result.program,result.profile,options);
  const active=startWorkout(state,state.program.days[0]);
  expect(active.exercises.map(e=>e.sets.map(s=>s.weight))).toEqual([[61.23,61.23,61.23],[40.82,40.82,40.82]]);
});
it('reads localized semicolon decimals and quoted CSV cues',async()=>{
  const semicolon=exercises(await from('N07'));
  expect(semicolon.map(e=>e.sets[0].weight)).toEqual([12.5,120]);
  const csv=exercises(await from('N06'));
  expect(csv.map(e=>e.sets[0].weight)).toEqual([45,60]);
  expect(csv[0].notes).toContain('Pause, then control the return');
  expect(csv[1].notes).toContain('Use a full, comfortable range');
});
it('retains mixed seconds and strength table rows',async()=>{
  const [plank,bench]=exercises(await from('N08'));
  expect([plank.sets.length,plank.repMin,plank.repMax,plank.measure]).toEqual([3,30,30,'seconds']);
  expect([bench.sets.length,bench.repMin,bench.sets[0].weight]).toEqual([3,8,60]);
});
it.each(['RPE','RIR'])('retains the header as evidence when a table %s value requires review',async effort=>{
  const result=await parse(`Monday\nExercise;Sets;Reps;${effort}\nBench Press;3;8;${effort==='RPE'?'7.5':'2-3'}`);
  expect(exercises(result)[0].targetRir).toBeNull();
  const issue=pendingImportIssues(result.sourceReview).find(i=>i.field==='rir');
  expect(issue.source).toContain(effort);expect(issue.source).toContain('Bench Press;3;8;');
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
});
it('reads explicitly timed minute columns and fractional minutes',async()=>{
  const result=await parse('Monday\nExercise;Sets;Reps (min)\nPlank;3;2');
  expect(exercises(result)[0]).toMatchObject({measure:'seconds',repMin:120,repMax:120});
  expect(exercises(await parse('Monday\nPlank 3x1.5 min'))[0]).toMatchObject({measure:'seconds',repMin:90,repMax:90});
});
it('does not invent a binary pair from A1/A2/A3',async()=>{
  const result=await from('N17');
  expect(exercises(result).every(e=>!e.supersetId)).toBe(true);
  const issue=pendingImportIssues(result.sourceReview)[0];
  expect(issue.field).toBe('grouping');
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
  setSourceDecisionPending(result.program,issue,false); // Explicit Keep as separate exercises.
  expect(preparePlanImport(blankState(),result.program,result.profile,options).program.days[0].exercises).toHaveLength(3);
});
it('executes the explicit rest after a pair instead of a larger catalogue default',async()=>{
  const result=await from('N14'),state=preparePlanImport(blankState(),result.program,result.profile,options);
  const active=startWorkout(state,state.program.days[0]);
  expect(supersetMeta(active.exercises,0).restSeconds).toBe(90);
});
it('preserves the stated last-set drop without asking which set it means',async()=>{
  const result=await from('N18');
  expect(exercises(result)[0].sets.map(s=>s.setType||'standard')).toEqual(['standard','standard','drop']);
  expect(pendingImportIssues(result.sourceReview)).toEqual([]);
});
it('keeps distinct repeated exercise targets separate when prefilling from history',async()=>{
  const result=await parse('Monday\nBench Press 1x12 50kg\nBench Press 1x10 55kg\nBench Press 1x8 60kg');
  const state=preparePlanImport(blankState(),result.program,result.profile,options),first=startWorkout(state,state.program.days[0]);
  const pairs=active=>active.exercises.map(e=>e.sets.map(s=>[s.reps,s.weight]));
  expect(pairs(first)).toEqual([[[12,50]],[[10,55]],[[8,60]]]);
  state.workouts=[{...first,completedAt:'2026-10-19T12:00:00Z',exercises:first.exercises.map(e=>({...e,sets:e.sets.map(s=>({...s,completed:true}))}))}];
  expect(pairs(startWorkout(state,state.program.days[0]))).toEqual(pairs(first));
});
it('preserves top and back-off reps/loads through start, reload and distinct history',async()=>{
  const result=await from('N19'),[top,backoff]=exercises(result);
  expect(top).toMatchObject({repMin:5,repMax:5,importRole:'Top set'});
  expect(backoff).toMatchObject({repMin:8,repMax:8,importRole:'Back-off sets'});
  expect(top.sets.map(s=>s.weight)).toEqual([100]);expect(backoff.sets.map(s=>s.weight)).toEqual([80,80]);
  const state=preparePlanImport(blankState(),result.program,result.profile,options);
  const first=startWorkout(state,state.program.days[0]);
  expect(first.exercises.map(e=>e.sets.map(s=>[s.reps,s.weight]))).toEqual([[[5,100]],[[8,80],[8,80]]]);
  // Each role must read its own previous work, never borrow the first match.
  state.workouts=[{...first,completedAt:'2026-10-19T12:00:00Z',exercises:first.exercises.map(e=>({...e,sets:e.sets.map(s=>({...s,completed:true}))}))}];
  const reloaded=deserializeState(serializeState(state));
  expect(startWorkout(reloaded,reloaded.program.days[0]).exercises.map(e=>e.sets.map(s=>[s.reps,s.weight]))).toEqual([[[5,100]],[[8,80],[8,80]]]);
});
it.each(['N20','N21','N31','N32','N37','N40','N50'])('%s requires a source edit for unsupported execution semantics',async id=>{
  const result=await from(id),issue=pendingImportIssues(result.sourceReview).find(i=>i.requiresSourceEdit);
  expect(issue).toBeTruthy();
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
  setSourceDecisionPending(result.program,issue,false);
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
});
it('distance and pyramids do not display fabricated rep/load targets',async()=>{
  const distance=exercises(await from('N37'))[0],pyramid=exercises(await from('N20'))[0];
  expect(distance.sets.map(s=>s.reps)).toEqual([null,null,null]);
  expect(pyramid.sets.map(s=>[s.reps,s.weight])).toEqual([[null,null],[null,null],[null,null]]);
});
it.each(['Mon and Thu: Upper','Mon/Thu: Upper','Pon in Čet: Zgornji del'])('does not discard a second abbreviated weekday: %s',async heading=>{
  const result=await parse(`${heading}\nBench Press 3x8`);
  expect(pendingImportIssues(result.sourceReview).some(i=>i.field==='schedule'&&i.requiresSourceEdit)).toBe(true);
});
it.each(['N22','N23','N24'])('%s retains effort semantics without a guessed numeric RIR',async id=>{
  const result=await from(id);
  expect(exercises(result).every(e=>e.targetRir===null)).toBe(true);
  expect(pendingImportIssues(result.sourceReview).every(i=>i.field==='rir')).toBe(true);
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
  for(const issue of pendingImportIssues(result.sourceReview)){
    exercises(result).find(e=>e.id===issue.exerciseId).targetRir=2;
    setSourceDecisionPending(result.program,issue,false);
  }
  expect(preparePlanImport(blankState(),result.program,result.profile,options).program).toBeTruthy();
});
it.each([['3x6-8 RIR 2',[[2,2]]],['3x8 RIR 2-3',[[2,3]]],['3x8 2 RIR',[[2,2]]],['3x8 RIR 1 RIR 3',[[1,1],[3,3]]]])('scopes effort without reading reps as RIR: %s',(source,expected)=>expect(sourceEffort(source)).toEqual(expected));
it('keeps rest range separate from the chosen timer and invalidates a changed answer',async()=>{
  const result=await from('N25'),issue=pendingImportIssues(result.sourceReview)[0],bench=exercises(result)[0];
  expect(bench.restSeconds).toBeNull();expect(bench.importedRestRangeSeconds).toEqual([120,180]);
  bench.restSeconds=150;setSourceDecisionPending(result.program,issue,false);
  expect(preparePlanImport(blankState(),result.program,result.profile,options).program.days[0].exercises[0].restSeconds).toBe(150);
  setSourceDecisionPending(result.program,issue,true);
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
});
it('retains pending source edits across remove, undo, serialization and a draft copy',async()=>{
  const result=await from('N20'),day=result.program.days[0],id=day.exercises[0].id;
  const removed=removeImportedExercise(result.program,day.id,id,{issues:result.sourceReview.issues});
  expect(removed.importMetadata.pendingSourceDecisions).toEqual([]);
  const restored=undoImportedExerciseRemoval(JSON.parse(JSON.stringify(removed)),id);
  expect(restored.importMetadata.pendingSourceDecisions).toEqual(result.program.importMetadata.pendingSourceDecisions);
});
it('reads prime rest units, per-hand loads and percentages without extra decisions',async()=>{
  const rests=exercises(await from('N26'));expect(rests.map(e=>e.restSeconds)).toEqual([120,90]);
  const perHand=await from('N27');expect(exercises(perHand)[0].sets.map(s=>s.weight)).toEqual([20,20,20]);expect(pendingImportIssues(perHand.sourceReview)).toEqual([]);
  expect(pendingImportIssues((await from('N29')).sourceReview)).toEqual([]);
});
it('keeps assisted load distinct from the rep range',async()=>{
  const result=await from('N28'),ex=exercises(result)[0];
  expect([ex.repMin,ex.repMax]).toEqual([8,8]);expect(ex.sets.every(s=>s.weight===null)).toBe(true);
  expect(pendingImportIssues(result.sourceReview)[0].field).toBe('load');
  const state=blankState(),before=structuredClone(state);
  expect(()=>preparePlanImport(state,result.program,result.profile,options)).toThrow(/source details/);
  expect(state).toEqual(before);
  const issue=pendingImportIssues(result.sourceReview)[0];setSourceDecisionPending(result.program,issue,false);
  const accepted=preparePlanImport(state,result.program,result.profile,options);
  expect(accepted.program.days[0].exercises[0].sets.every(s=>s.weight===null)).toBe(true);
  expect(accepted.program.importMetadata.sourceNotes.map(n=>n.text).join('\n')).toContain('-25 kg');
});
it('retains six warm-up steps, a separate intensity instruction, and prescribed warm-up loads',async()=>{
  const result=await parse(control('20'));
  expect(result.program.days[0].warmupPlan.items).toHaveLength(6);
  expect(result.program.days[0].warmupPlan.instructions).toEqual(['60–70 % hitrosti']);
  const ramp=await from('N38'),state=preparePlanImport(blankState(),ramp.program,ramp.profile,options);
  const labels=startWorkout(state,state.program.days[0]).warmup.general.map(warmupPrescriptionLabel);
  expect(labels).toEqual(['5 min','20kg x10','40kg x5']);
});
it('does not infer standing posture from an unqualified unilateral curl alias',async()=>{
  const ex=exercises(await parse(control('10'))).at(-1);
  expect(ex.exerciseId).not.toBe('standing-leg-curl');expect(ex.exerciseSource).toBe('imported-custom');
});
it.each(['Step Down 2x6 operirana noga','Single-Leg Leg Press 2x8 left','Single-Leg Leg Press 3x10 right'])('never accepts an unsupported single-side dose as both sides: %s',async source=>{
  const result=await parse(`Monday\n${source}`);
  expect(pendingImportIssues(result.sourceReview).some(i=>i.requiresSourceEdit)).toBe(true);
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
});
it.each(['N13','N16','C15','C19'])('%s blocks direct confirmation before its material source decision',async id=>{
  const result=await parse(id.startsWith('C')?control(id.slice(1)):fixture(id));
  expect(pendingImportIssues(result.sourceReview).length).toBeGreaterThan(0);
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source details/);
});
it('removes and restores one-side guards, and executes a supported source correction',async()=>{
  const result=await parse(control('11')),day=result.program.days[0],ex=day.exercises[0];
  const removed=removeImportedExercise(result.program,day.id,ex.id,{issues:result.sourceReview.issues});
  expect(removed.importMetadata.pendingSourceDecisions).toHaveLength(1);
  const undo=undoImportedExerciseRemoval(JSON.parse(JSON.stringify(removed)),ex.id);
  expect(undo.importMetadata.pendingSourceDecisions).toHaveLength(2);
  const corrected=await parse('Monday\nSingle-Leg Leg Press 2x8 per side');
  const state=preparePlanImport(blankState(),corrected.program,corrected.profile,options);
  expect(startWorkout(state,state.program.days[0]).exercises[0].loggingMode).toBe('per_side');
});
it('blocks unresolved identity at apply, then accepts an explicit original identity',async()=>{
  const result=await parse(control('24'));
  expect(()=>preparePlanImport(blankState(),result.program,result.profile,options)).toThrow(/source exercise choices/);
  for(const ex of exercises(result))if(['unresolved','needs-name-review'].includes(ex.matchStatus))keepPlanImportOriginal(ex);
  expect(preparePlanImport(blankState(),result.program,result.profile,options).program.days).toHaveLength(2);
});
it('preserves rounds, side logging and ordinary ready controls',async()=>{
  const rounds=exercises(await parse(control('14')))[0];expect(targetLabel(rounds)).toBe('2 rounds · Reps not specified');
  const side=exercises(await parse(control('30'))).at(-1);expect(side.loggingMode).toBe('per_side');
  const source=await from('N49');expect(exercises(source)).toHaveLength(2);expect(exercises(source).map(e=>e.sets[0].weight)).toEqual([60,45]);
  expect(pendingImportIssues((await from('N04')).sourceReview)).toEqual([]);
});
it('keeps useful tempo and progression instructions in the working draft',async()=>{
  expect(exercises(await from('N34'))[0].notes).toContain('tempo 3-1-1');
  expect(exercises(await from('N48'))[0].notes).toContain('Progression: add weight once all reps are clean.');
  for(const [source,expected] of [[fixture('N48'),'stop if painful'],[control('25'),'Napredovanje: povečaj težo']]){
    const result=await parse(source),state=preparePlanImport(blankState(),result.program,result.profile,options);
    state.activeWorkout=startWorkout(state,state.program.days[0]);
    const reloaded=deserializeState(serializeState(state));
    expect(exerciseNotePresentation(reloaded.activeWorkout.exercises[0],reloaded.program).cue).toContain(expected);
  }
});
