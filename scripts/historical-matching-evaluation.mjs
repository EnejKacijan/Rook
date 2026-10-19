import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {parseHistoricalWorkoutCsv} from '../src/historicalWorkoutImport.js';
import {exerciseCatalog, matchImportedExerciseName} from '../src/domain.js';
import {normalizeExerciseAlias} from '../src/customExercises.js';
import {reviewedAutomaticMappings} from './historical-matching-reviewed-names.mjs';
const path=process.argv[2];if(!path)throw new Error('Pass the original Hevy CSV path.');
const original=await readFile(path),start=performance.now();
const p=parseHistoricalWorkoutCsv({text:original.toString('utf8')});
const elapsedMs=performance.now()-start;
assert.equal(p.summary.workouts,95);assert.equal(p.summary.sets,1139);assert.equal(p.exerciseMappings.length,127);
// Freeze the actual pre-change implementation for a reproducible before count.
const tokens=value=>normalizeExerciseAlias(value).split(/\s+/).filter(Boolean).sort().join(' ');
const oldIndex=new Map();for(const e of Object.values(exerciseCatalog).filter(e=>!e.id.startsWith('wg-')))for(const name of [e.name,...(e.aliases||[])]){const key=tokens(name),ids=oldIndex.get(key)||new Set();ids.add(e.id);oldIndex.set(key,ids);}
const oldMatch=name=>{const exact=matchImportedExerciseName(name);if(exact.exerciseId)return exact.exerciseId;if(/\((?:barbell|dumbbell|kettlebell|cable|machine|smith machine|bodyweight|weighted)\)$/i.test(name.trim())){const ids=oldIndex.get(tokens(name));if(ids?.size===1)return [...ids][0];}return null;};
const approved=new Map(reviewedAutomaticMappings);
const rows=p.exerciseMappings.map(m=>{
  if(m.exerciseId){assert.equal(m.exerciseId,approved.get(m.sourceName),`Unaudited or changed automatic match: ${m.sourceName}`);assert.equal(m.match.candidates[0].conflicts.length,0);}
  else assert.ok(!approved.has(m.sourceName),`Reviewed equivalent regressed: ${m.sourceName}`);
  return {sourceName:m.sourceName,previousId:oldMatch(m.sourceName),canonicalId:m.exerciseId,tier:m.match.tier,decision:m.exerciseId?'auto':m.match.tier==='B'?'suggest / review':'choice / custom',reason:m.match.reason,
    candidates:m.match.candidates.map(c=>({id:c.exerciseId,name:c.name,score:c.score,conflicts:c.conflicts,matchedLabel:c.matchedLabel})),features:m.match.sourceFeatures,
    audit:m.exerciseId?'Reviewed against catalog name/alias + equipment and side contract':'Not auto-approved; preserve source unless user confirms a variant'};
});
const report={source:'Hevy',sourceUnmodified:Buffer.compare(original,await readFile(path))===0,uniqueNames:rows.length,previousAuto:rows.filter(r=>r.previousId).length,
  auto:rows.filter(r=>r.tier==='A').length,suggest:rows.filter(r=>r.tier==='B').length,ambiguousOrCustom:rows.filter(r=>r.tier==='C').length,
  wrongAuditedAutomaticMatches:0,reviewedAutomaticPrecision:`${approved.size}/${approved.size} against catalog contracts (not physical movement observation)`,parseMs:elapsedMs,rows};
const out='artifacts/SMART-HISTORY-MATCHING';await mkdir(out,{recursive:true});await writeFile(`${out}/evaluation.json`,JSON.stringify(report,null,2));
await writeFile(`${out}/EVALUATION.md`,'# Historical exercise matching — original Hevy labels\n\nExercise labels only; no personal workout titles, dates, notes or results.\n\n'+`Before: ${report.previousAuto}/127 auto. After: A ${report.auto}, B ${report.suggest}, C ${report.ambiguousOrCustom}. Reviewed auto matches: ${report.reviewedAutomaticPrecision}.\n\n`+'| Source | Before | Best / second | Tier | Decision | Evidence / conflicts |\n|---|---|---|---|---|---|\n'+rows.map(r=>`| ${r.sourceName} | ${r.previousId||'review'} | ${r.candidates.slice(0,2).map(c=>c.name).join(' / ')} | ${r.tier} | ${r.decision} | ${r.reason}; ${r.candidates[0]?.conflicts.join(', ')||'no explicit contradiction'} |`).join('\n')+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));
