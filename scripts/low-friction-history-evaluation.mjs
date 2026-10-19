import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {blankState,deserializeState,serializeState} from '../src/domain.js';
import {parseHistoricalWorkoutCsv as parse,applyHistoricalWorkoutImport as apply,compactHistoricalPreview} from '../src/historicalWorkoutImport.js';

const path=process.argv[2];if(!path)throw new Error('Provide the original untouched CSV path');
const bytes=await readFile(path),text=bytes.toString('utf8'),start=performance.now();
const state=blankState(),p=await compactHistoricalPreview(parse({text,state}),state),parseMs=performance.now()-start;
const before=JSON.parse(await readFile('artifacts/SMART-HISTORY-MATCHING/evaluation.json','utf8'));
const reasons={
 'Triceps Dip (Weighted)':'Keep B: source emphasis / dip setup is not established by generic Weighted Dip.',
 'Shoulder Press (Machine Plates)':'Keep B: plate-loaded machine variant is not established by generic Machine Shoulder Press.',
 'Hammer Curl (Cable)':'Keep B: rope attachment is not specified; do not invent it.',
 'Back Extension (Machine)':'Keep B: machine and 45-degree bench angle are not equivalent proof.',
 'Single Leg Standing Calf Raise':'A: standing single-leg bodyweight/optional-load movement matches the catalog definition and illustration; shared alias.',
 'Standing Military Press (Barbell)':'A: standing barbell military press is the existing Overhead Press movement; shared alias.',
 'Seated Lateral Raise (Dumbbell)':'Keep B: seated posture is not established by the general lateral raise identity.',
 'Leg Press Horizontal (Machine)':'Keep B: horizontal sled geometry must not become the generic/45-degree Leg Press.',
 'Chest Dip (Weighted)':'Keep B: chest emphasis / setup is not established by generic Weighted Dip.',
 'Seated Incline Curl (Dumbbell)':'A: incline bench seated dumbbell curl is the existing Incline Dumbbell Curl; shared alias.',
 'Side Bend':'Keep B: unspecified equipment must not become an asserted dumbbell.',
 'Seated Shoulder Press (Machine)':'A: seated machine vertical press matches the existing machine definition and illustration; shared alias.',
};
const byName=new Map(p.exerciseMappings.map(m=>[m.sourceName,m]));
for(const row of before.rows.filter(r=>r.tier==='A'))assert.equal(byName.get(row.sourceName).exerciseId,row.canonicalId,'previous audited A retained');
const formerSuggestions=before.rows.filter(r=>r.tier==='B').map(r=>{
 const current=byName.get(r.sourceName);assert.ok(reasons[r.sourceName]);
 return {sourceName:r.sourceName,previousTier:r.tier,tier:current.match.tier,canonicalId:current.match.exerciseId,
  suggestedId:current.match.suggestedExerciseId,reason:reasons[r.sourceName]};
});
assert.equal(formerSuggestions.filter(r=>r.tier==='A').length,4);
assert.equal(before.rows.filter(r=>r.tier==='C').filter(r=>byName.get(r.sourceName).matchStatus==='custom-auto').length,39);
assert.deepEqual([p.summary.workouts,p.summary.sets,p.summary.autoMatchedExercises,p.summary.suggestedExercises,p.summary.customExercises,p.summary.reviewExercises,p.summary.loadDecisions],[95,1139,80,8,39,0,0]);
const saved=deserializeState(serializeState(apply(state,p).state)),repeat=await compactHistoricalPreview(parse({text,state:saved}),saved);
assert.equal(saved.customExercises.length,47);assert.equal(repeat.summary.exactDuplicates,95);assert.equal(apply(saved,repeat).result.imported,0);
assert.equal(Buffer.compare(bytes,await readFile(path)),0);
const out='artifacts/LOW-FRICTION-HISTORY';await mkdir(out,{recursive:true});
await writeFile(`${out}/evaluation.json`,JSON.stringify({source:'Hevy',originalUnmodified:true,sha256:createHash('sha256').update(bytes).digest('hex'),
 before:{unique:127,auto:76,suggest:12,unknown:39,mandatoryExerciseReview:51},after:p.summary,unique:p.exerciseMappings.length,
 parseMs,formerSuggestions,rows:p.exerciseMappings.map(m=>({sourceName:m.sourceName,tier:m.match.tier,exerciseId:m.exerciseId,
 reason:m.match.reason,sourceKey:m.sourceKey})),skipReview:{custom:47,canonical:80,workouts:saved.workouts.length,
 sets:saved.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,reimported:0}},null,2));
console.log(JSON.stringify({unique:127,canonical:80,optional:8,autoCustom:39,mandatory:0,promoted:4,skipCustom:47,parseMs,originalUnmodified:true}));
