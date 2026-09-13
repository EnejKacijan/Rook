import { describe,it,expect } from 'vitest';
import { matchHistoricalExercise, historicalNameFeatures } from './historicalExerciseMatching.js';
import { blankState, exerciseCatalog, serializeState, deserializeState } from './domain.js';
import { normalizeExerciseAlias, rememberHistoricalExerciseAlias, createCustomExercise, deleteCustomExercise, resolveRememberedExercise } from './customExercises.js';
import { parseHistoricalWorkoutCsv, resolveHistoricalExercise, compactHistoricalPreview, applyHistoricalWorkoutImport, historicalExerciseChoices } from './historicalWorkoutImport.js';
import { HistoryImportBatch } from './historyImportBatch.js';
import { reviewedAutomaticMappings } from '../scripts/historical-matching-reviewed-names.mjs';

export const equivalents=[
  ['Lateral Raise (Machine)','machine-lateral-raise'],['Machine Lateral Raises','machine-lateral-raise'],
  ['Incline Bench Press (Dumbbell)','incline-dumbbell-press'],['DB Incline Press','incline-dumbbell-press'],
  ['Bicep Curl (Cable)','cable-curl'],['Cable Biceps Curl','cable-curl'],['Biceps Curls (Dumbbells)','dumbbell-curl'],
  ['Triceps Pressdown','cable-triceps-pressdown'],['Triceps Rope Pushdown','cable-triceps-pressdown'],
  ['Pull Up','pull-up'],['Pull Up (Weighted)','wg-weighted-pull-up'],['Chin Up (Weighted)','wg-weighted-chin-up'],
  ['Seated Leg Curl (Machine)','seated-leg-curl'],['Single Leg Extensions','single-leg-leg-extension'],
  ['Single Leg Press (Machine)','single-leg-leg-press'],['Single Arm Cable Row','single-arm-cable-row'],
  ['Single Leg Romanian Deadlift (Dumbbell)','single-leg-romanian-deadlift'],['Split Squat (Dumbbell)','split-squat'],
  ['Incline Bench Press (Smith Machine)','incline-smith-machine-press'],['Deadlift (Barbell)','deadlift'],
  ['Lat Pulldown (Cable)','lat-pulldown'],['Lat Pulldown (Band)','band-lat-pulldown'],
  ['Hammer Curl (Dumbbell)','hammer-curl'],['Spider Curl (Dumbbell)','wg-spider-curl'],
  ['Bent Over Row (Dumbbell)','wg-dumbbell-bent-over-row'],['Hanging Knee Raise','wg-hanging-knee-raise'],
  ['Low Cable Fly Crossovers','low-to-high-cable-fly'],['Hip Adduction (Machine)','hip-adduction-machine'],
  ['Hip Abduction (Machine)','hip-abduction-machine'],['Overhead Press (Dumbbell)','dumbbell-shoulder-press'],
  ['Rear Delt Reverse Fly (Dumbbell)','dumbbell-rear-delt-fly'],['Rear Delt Reverse Fly (Machine)','reverse-pec-deck'],
  ['Sissy Squat (Weighted)','wg-sissy-squat'],['Sklece','push-up'],
];
describe('deterministic historical matcher',()=>{
  it.each(reviewedAutomaticMappings)('reviewed real-export equivalent: %s', (name,id)=>expect(matchHistoricalExercise(name).exerciseId).toBe(id));
  it.each(equivalents)('%s safely maps to %s',(name,id)=>{
    const result=matchHistoricalExercise(name);
    expect(result,{name,result}).toMatchObject({exerciseId:id,tier:'A'});
    expect(result.candidates[0].conflicts).toEqual([]);
  });
  it.each(['  LATERAL   RAISE (MACHINE) ','Lateral-Raise: Machine','machine lateral raises'])('case / punctuation / equipment order: %s',name=>{
    expect(matchHistoricalExercise(name).exerciseId).toBe('machine-lateral-raise');
  });
  it.each(['Recumbent Bike','Ring Dips','Bicep Curl (Suspension)','Single Arm Triceps Pushdown (Cable)',
    'Kettlebell Goblet Squat','Overhead Press (Smith Machine)','Incline Chest Fly (Dumbbell)',
    'Triceps Extension (Cable)','Dumbbell Row','Seated Cable Row - Bar Wide Grip','Warm Up','Stretching'])('does not auto-approve unsupported/ambiguous %s',name=>{
    expect(matchHistoricalExercise(name).exerciseId).toBeNull();
  });
  const catalog = definitions => Object.fromEntries(definitions.map(([id,name,equipment,unilateral=false])=>[id,{id,name,equipment,unilateral}]));
  it.each([
    ['Adductor Machine','Hip Abduction Machine',['machines']],
    ['Step-up','Step-down',['bodyweight']],
    ['Dumbbell Press','Smith Machine Press',['machines']],
    ['Single Leg Extension','Leg Extension',['machines']],
    ['Chest Supported Row','Bent Over Row',['barbell']],
    ['Seated Curl','Standing Curl',['dumbbells']],
    ['Low-to-High Cable Fly','High-to-Low Cable Fly',['cables']],
    ['Pull Up (Weighted)','Assisted Pull-up',['machines']],
  ])('negative protection: %s is not %s',(source,target,equipment)=>{
    expect(matchHistoricalExercise(source,{},catalog([['target',target,equipment]])).exerciseId).toBeNull();
  });
  it('equal semantic candidates remain C, not a highest-score-only auto-match',()=>{
    const result=matchHistoricalExercise('Curl (Machine)',{},catalog([['one','Machine Curl',['machines']],['two','Curl Machine',['machines']]]));
    expect(result).toMatchObject({tier:'C',exerciseId:null});
  });
  it('canonical/library precedence cannot hide a real equipment ambiguity',()=>{
    expect(matchHistoricalExercise('Preacher Curl')).toMatchObject({tier:'C',exerciseId:null});
    expect(matchHistoricalExercise('Preacher Curl (Machine)').exerciseId).toBe('machine-preacher-curl');
    expect(matchHistoricalExercise('Preacher Curl (Barbell)').exerciseId).toBe('preacher-curl');
  });
  it('one safe likely candidate is B, not auto; missing equipment is not silently supplied',()=>{
    expect(matchHistoricalExercise('Side Bend')).toMatchObject({tier:'C',exerciseId:null,suggestedExerciseId:null});
    expect(matchHistoricalExercise('Side Bend',{},exerciseCatalog,'generic',{advanced:true})).toMatchObject({tier:'B',exerciseId:null,suggestedExerciseId:'wg-dumbbell-side-bend'});
  });
  it('optional added load uses the existing identity only when no distinct weighted identity wins',()=>{
    expect(matchHistoricalExercise('Weighted Pull-up').exerciseId).toBe('wg-weighted-pull-up');
    expect(matchHistoricalExercise('Weighted Sissy Squat').exerciseId).toBe('wg-sissy-squat');
    expect(matchHistoricalExercise('Chest Dip (Weighted)').exerciseId).toBeNull();
  });
  it('retains named equipment and unilateral features rather than flattening them',()=>{
    expect(historicalNameFeatures('Single Leg Romanian Deadlift (Dumbbell)')).toMatchObject({equipment:['dumbbell'],side:'leg',unilateral:true});
  });
  it('makes all library-only exercises available for manual mapping too',()=>{
    expect(historicalExerciseChoices({},'Hanging Knee Raise').map(e=>e.id)).toContain('wg-hanging-knee-raise');
  });
});

const csv=(names)=>'workout_date,workout_name,exercise_name,set_order,weight,weight_unit,reps,set_type\n'+names.map((name,i)=>`2025-01-${String(i+1).padStart(2,'0')} 12:00:00,QA,${name},1,20,kg,8,normal`).join('\n');
describe('mapping identity, persistence and override protection',()=>{
  it('resolves casing/punctuation variants once across workouts and preserves fingerprints / results',async()=>{
    const state=blankState();
    let preview=await compactHistoricalPreview(parseHistoricalWorkoutCsv({text:csv(['Unknown Curl','UNKNOWN-CURL']),state}),state);
    expect(preview.exerciseMappings).toHaveLength(1);
    const fingerprints=preview.workouts.map(w=>w.fingerprint),sets=preview.workouts.map(w=>w.exercises[0].sets);
    preview=resolveHistoricalExercise(preview,state,'unknown curl',{type:'match',exerciseId:'cable-curl'});
    expect(preview.workouts.map(w=>w.fingerprint)).toEqual(fingerprints);
    expect(preview.workouts.map(w=>w.exercises[0].sets)).toEqual(sets);
    const saved=deserializeState(serializeState(applyHistoricalWorkoutImport(state,preview).state));
    expect(saved.workouts).toHaveLength(2);
    expect(matchHistoricalExercise('Unknown Curl',saved)).toMatchObject({exerciseId:'cable-curl',reason:'Your saved match'});
    saved.workouts[0].sessionNote='Local edit';
    const repeated=await compactHistoricalPreview(parseHistoricalWorkoutCsv({text:csv(['Unknown Curl','UNKNOWN-CURL']),state:saved}),saved);
    expect(repeated.summary.exactDuplicates).toBe(2);
    expect(applyHistoricalWorkoutImport(saved,repeated).state.workouts[0].sessionNote).toBe('Local edit');
  });
  it('explicit changed mapping overrides prior choice and even canonical aliases, history-only',()=>{
    const state=blankState();
    rememberHistoricalExerciseAlias(state,'Cable Curl','barbell-curl',{builtInCatalog:exerciseCatalog});
    rememberHistoricalExerciseAlias(state,'Cable Curl','dumbbell-curl',{builtInCatalog:exerciseCatalog});
    const loaded=deserializeState(serializeState(state));
    expect(matchHistoricalExercise('CABLE CURL',loaded).exerciseId).toBe('dumbbell-curl');
    expect(loaded.exerciseAliases.filter(a=>a.scope==='historical-import')).toHaveLength(1);
    expect(resolveRememberedExercise(loaded,'Cable Curl',exerciseCatalog)).toBeNull();
  });
  it('unavailable saved ID requires review, not fallback to a similar canonical',()=>{
    const state={exerciseAliases:[{id:'old',scope:'historical-import',alias:'Cable Curl',normalizedAlias:'cable curl',exerciseId:'removed-id'}]};
    expect(matchHistoricalExercise('Cable Curl',state)).toMatchObject({exerciseId:null,tier:'C',reason:'Saved exercise is unavailable'});
  });
  it('deleting a custom override cannot quietly reactivate the canonical auto-match',()=>{
    const state=blankState();createCustomExercise(state,{name:'QA custom'});
    const id=state.customExercises[0].id;
    rememberHistoricalExerciseAlias(state,'Cable Curl',id,{builtInCatalog:exerciseCatalog});
    deleteCustomExercise(state,id);
    expect(matchHistoricalExercise('Cable Curl',deserializeState(serializeState(state)))).toMatchObject({tier:'C',exerciseId:null});
  });
  it('custom choice persists and applies to all source occurrences, without invented results',()=>{
    const state=blankState();let p=parseHistoricalWorkoutCsv({text:csv(['Unique source','UNIQUE SOURCE']),state});
    p=resolveHistoricalExercise(p,state,'Unique source',{type:'custom'});
    p=resolveHistoricalExercise(p,state,'Unique source',{type:'load',loadKind:'unknown'});
    const loaded=deserializeState(serializeState(applyHistoricalWorkoutImport(state,p).state));
    expect(loaded.customExercises).toHaveLength(1);
    expect(new Set(loaded.workouts.flatMap(w=>w.exercises.map(e=>e.exerciseId))).size).toBe(1);
    expect(matchHistoricalExercise('Unique source',loaded).exerciseId).toBe(loaded.customExercises[0].id);
    expect(loaded.workouts[0].exercises[0].sets[0]).toMatchObject({weight:20,reps:8,rir:null});
  });
  it('one normalized mapping across multiple files; source fingerprints stay file-content based',async()=>{
    const batch=new HistoryImportBatch(),state=blankState();
    const files=['Odd Curl','ODD-CURL'].map((name,i)=>({name:`qa-${i}.csv`,buffer:new TextEncoder().encode(csv([name])).buffer}));
    const setup=await batch.read(files);
    const p=await batch.parse(setup.files.map(f=>({sheetIndex:f.sheetIndex,options:{}})),state);
    expect(p.exerciseMappings).toHaveLength(1);
    const resolved=batch.resolve(state,'Odd Curl',{type:'match',exerciseId:'cable-curl'});
    expect(resolved.summary.reviewExercises).toBe(0);
    expect(resolved.workouts.every(w=>w.exercises[0].exerciseId==='cable-curl')).toBe(true);
  });
});
