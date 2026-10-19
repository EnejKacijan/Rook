// Evidence packaging only: deliberately does not parse further cases after a blocker.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {blankState,startWorkout,deserializeState} from '../src/domain.js';
import {buildWeeklyPlanExport} from '../src/workoutExport.js';
import {importMatchEntries,importResolutionGroups} from '../src/importResolution.js';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${out}/LEDGER.json`,'utf8'));
for(const id of ['01','02','03','04']){
 const evidence=JSON.parse(await readFile(`${out}/${id}-result.json`,'utf8')),r=evidence.firstResult,e=ledger.find(x=>x.id===id);
 e.status=id==='04'?'STOP — confirmed E invented prescription':'PARTIAL — source prescription spot-check; no end-to-end certification';
 e.preserved=['Explicit workout weekdays/counts','Explicit set counts, finite reps and ranges','Explicit loads; absent loads remain null','Original notes retained in importMetadata'];
 e.normalized=id==='01'?['RPE 8 → estimated RIR 2, gated by explicit effort review','× / x / en-dash normalized']:['Exercise aliases and × / x notation normalized'];
 e.blockerCreated={sourceIssues:r.sourceReview.issues,exerciseMatches:importMatchEntries(r.program),groups:importResolutionGroups(r.sourceReview,r.program)};
 e.dropped=id==='04'?['Open-ended AMRAP is still flagged but numeric prescription now contains unsupported 1 rep']:[];
 e.invented=id==='04'?[{class:'E',source:'Pull Up 3xAMRAP',fact:'repMin=1; repMax=1; all three planned sets reps=1; exported as AMRAP · 1 reps'}]:[];
 e.caveats=['Only the inspected core source claims are reviewed; absence of other defects is not certified. Catalog rest/increment/profile defaults are visible but provenance/product approval was not fully audited before the stop.'];
}
const raw=JSON.parse(await readFile(`${out}/04-result.json`,'utf8')).firstResult;
let state=blankState();state.program=raw.program;
const restored=deserializeState(JSON.parse(JSON.stringify(state)));
const day=restored.program.days.find(d=>d.exercises.some(e=>e.failureTarget));
const active=startWorkout(restored,day),exercise=active.exercises.find(e=>e.failureTarget);
const exported=buildWeeklyPlanExport({state:restored,date:new Date('2026-09-07T12:00:00'),includeNotes:true}).text;
assert.deepEqual(exercise.sets.map(s=>s.reps),[1,1,1]);assert.match(exported,/AMRAP · 1 reps/);
const proof={caseId:'04',source:ledger.find(x=>x.id==='04').source,sourceIssues:raw.sourceReview.issues,parsedExercise:raw.program.days[3].exercises[0],restoredExercise:day.exercises[0],activeExercise:exercise,weeklyPlanExport:exported,confirmation:'Confirmed defect; these assertions detect current wrong behavior, not a passing fidelity gate.',scope:'In-memory serialization/normalization and domain workout/export probe only. Browser Review → Apply → Edit Plan flow was not executed because the audit stopped.'};
await writeFile(`${out}/AMRAP-DEFECT-PROOF.json`,JSON.stringify(proof,null,2));
await writeFile(`${out}/LEDGER.json`,JSON.stringify(ledger,null,2));
console.log(JSON.stringify({corpus:ledger.length,parsedCases:4,repeatsPerCase:10,stableCases:4,unrun:26,confirmedDefect:'E — AMRAP gains 1-rep prescription',activeReps:exercise.sets.map(s=>s.reps),exportLines:exported.split('\n').filter(x=>x.includes('AMRAP')),groups:ledger.slice(0,4).map(x=>({id:x.id,sourceIssues:x.blockerCreated.sourceIssues.length,matches:x.blockerCreated.exerciseMatches.length}))},null,2));
