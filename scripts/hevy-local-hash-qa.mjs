// Local-only regression against the owner's ORIGINAL files. No raw CSV rows,
// fingerprints, dates, names, loads or body measurements are printed or saved.
// Usage: node scripts/hevy-local-hash-qa.mjs <workout.csv> <measurement.csv>
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { HistoryImportBatch } from '../src/historyImportBatch.js';
import { blankState, serializeState, deserializeState } from '../src/domain.js';
import { readHistoryCsv, historyDate } from '../src/historyImportTable.js';
import { buildBackupArchive, parseBackupArchive } from '../src/backup.js';

const paths = process.argv.slice(2);
assert.ok(paths.length === 2, 'Supply the original workout and measurement files.');
const originals = await Promise.all(paths.map(path => readFile(path)));
const files = originals.map((buffer, i) => ({ name: paths[i].split(/[\\/]/).at(-1), buffer: Uint8Array.from(buffer).buffer }));
const tables = originals.map(buffer => readHistoryCsv(buffer.toString('utf8')));
const rows = table => table.rows.slice(1).map(row => Object.fromEntries(table.rows[0].map((header, i) => [header, row[i]])));
const source = rows(tables[0]), measurements = rows(tables[1]);
const sourceWorkoutCount = new Set(source.map(row=>JSON.stringify([row.title,row.start_time,row.end_time]))).size;
const number = text => text === '' || text == null ? null : Number(text);
const check = (condition, label) => assert.ok(condition, label);
const equal = (a, b, label) => check(JSON.stringify(a) === JSON.stringify(b), label);
const setCount = state => state.workouts.reduce((n, w) => n + w.exercises.reduce((n, e) => n + e.sets.length, 0), 0);
const facts = state => ({
  workouts: state.workouts.map(w => ({ id:w.id, name:w.name, sourceFingerprint:w.sourceFingerprint,
    startedAt:w.startedAt, endedAt:w.endedAt, sessionNote:w.sessionNote, sourceDate:w.sourceDate, sourceEnd:w.sourceEnd,
    exercises:w.exercises.map(e => ({ id:e.id, exerciseId:e.exerciseId, sourceName:e.sourceName, notes:e.notes,
      sourceSupersetId:e.sourceSupersetId, supersetId:e.supersetId, supersetOrder:e.supersetOrder,
      sets:e.sets.map(s => Object.fromEntries(['id','weight','reps','durationSeconds','distance','distanceUnit','rpe','rir','rawImport','importSetType','completed'].map(k => [k,s[k]]))) })) })),
  measurements:state.importedMeasurementSources, weights:state.weightCheckins,
});
async function run(selected, state = blankState()) {
  const batch = new HistoryImportBatch(), setup = await batch.read(selected);
  check(setup.files.every(f => f.info.source === 'hevy' && !f.info.needsMapping && !f.info.needsWeightUnit && !f.info.needsDistanceUnit && !f.info.needsLengthUnit), 'Hevy recognized without manual mapping');
  let preview = await batch.parse(setup.files.map(f => ({sheetIndex:f.sheetIndex,options:{}})), state);
  const {timing,...identityPreview} = structuredClone(preview);
  // Original identities now exist before Apply. Their creation audit timestamp
  // is wall-clock metadata, not CSV dates, hashes, set IDs or measurement facts.
  for(const workout of identityPreview.workouts)for(const exercise of workout.exercises){
    if(exercise.customRecord){delete exercise.customRecord.createdAt;delete exercise.customRecord.updatedAt;}
  }
  for(const mapping of identityPreview.exerciseMappings){if(mapping.customRecord){delete mapping.customRecord.createdAt;delete mapping.customRecord.updatedAt;}}
  check(!timing.stages['optional advanced matching'],'No advanced matching in default path');
  check(preview.summary.reviewExercises===0,'No mandatory identity decisions');
  const matched = preview.summary.matchedExercises-preview.summary.customExercises;
  const custom = preview.summary.customExercises;
  return {batch, preview, identityPreview, matched, custom};
}
function reconcile(state) {
  check(state.workouts.length === sourceWorkoutCount,'Source workout grouping preserved');
  const byRow = new Map();
  for (const workout of state.workouts) for (const exercise of workout.exercises) for (const set of exercise.sets) {
    check(!byRow.has(set.rawImport.sourceIndex), 'No duplicated source set row');
    byRow.set(set.rawImport.sourceIndex, {workout,exercise,set});
  }
  check(byRow.size === source.length, 'Every source result retained exactly once');
  for (const [index,row] of source.entries()) {
    const found = byRow.get(index); check(Boolean(found), 'Source row retained');
    const {workout,exercise,set} = found;
    equal(workout.name,row.title,'Workout title preserved'); equal(exercise.sourceName,row.exercise_title,'Exercise name preserved');
    equal(workout.startedAt,historyDate(row.start_time).value,'Start date/time preserved');
    equal(workout.endedAt,historyDate(row.end_time).value,'End date/time preserved');
    for (const [field,column] of Object.entries({weight:'weight_kg',reps:'reps',durationSeconds:'duration_seconds',distance:'distance_km',rpe:'rpe'})) equal(set[field],number(row[column]),'Source numeric result / absence preserved');
    equal(set.rir,null,'No invented RIR'); equal(set.rawImport.setOrder,Number(row.set_index),'Set order preserved');
    equal(set.importSetType,row.set_type,'Set type preserved'); equal(exercise.sourceSupersetId,row.superset_id||null,'Source superset preserved');
    if (number(row.weight_kg) != null) equal(set.rawImport.weightUnit,'kg','Load unit preserved');
    if (number(row.distance_km) != null) equal(set.distanceUnit,'km','Distance unit preserved');
    check(!row.description || workout.sessionNote?.includes(row.description),'Workout guidance preserved');
    check(!row.exercise_notes || exercise.notes?.includes(row.exercise_notes),'Exercise guidance preserved');
  }
  const pairOwners = new Map();
  for (const workout of state.workouts) {
    const indices = workout.exercises.map(e => e.sets[0].rawImport.sourceIndex);
    equal(indices,[...indices].sort((a,b) => a-b),'Exercise order preserved');
    for (const e of workout.exercises) if (e.supersetId) {
      check(!pairOwners.has(e.supersetId) || pairOwners.get(e.supersetId) === workout.id,'Pair identity scoped to workout');
      pairOwners.set(e.supersetId,workout.id);
    }
  }
  check(state.importedMeasurementSources.length === measurements.length,'Measurement count preserved');
  const sites = ['neck','shoulder','chest','left_bicep','right_bicep','left_forearm','right_forearm','abdomen','waist','hips','left_thigh','right_thigh','left_calf','right_calf'];
  for (const row of measurements) {
    const record = state.importedMeasurementSources.find(r => r.localDate === historyDate(row.date).day);
    check(Boolean(record),'Measurement local date preserved'); equal(record.weightKg,number(row.weight_kg),'Bodyweight preserved');
    equal(record.values.fat_percent.value,number(row.fat_percent),'Bodyfat / absence preserved');
    for (const site of sites) equal(record.values[site].value,number(row[site+'_cm']),'Circumference / absence preserved');
  }
}
const report = {source:'hevy',unitMode:'kg / km / cm',workouts:{sourceRows:source.length,sourceWorkouts:sourceWorkoutCount},measurements:{sourceRows:measurements.length},capabilities:[],independentFiles:[],privacy:'Only aggregate counts and pass/fail evidence; original files remain external to repository.'};
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis,'crypto');
let canonicalPreview, appliedFallback;
try {
  for (const [mode,crypto] of Object.entries({native:webcrypto,withoutSubtle:{},withoutCrypto:undefined})) {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:crypto});
    const {batch,preview,identityPreview,matched,custom} = await run(files);
    check(preview.summary.invalidRows === 0,'Real files have no invalid rows');
    if (canonicalPreview) equal(identityPreview,canonicalPreview,'Canonical previews identical across hash implementations');
    else canonicalPreview = identityPreview;
    const state = batch.apply(blankState(),{now:'2026-09-12T00:00:00Z'}).state;
    reconcile(state);
    const reloaded = deserializeState(serializeState(state));
    equal(facts(reloaded),facts(state),'Save/reload preserves all factual data');
    const duplicate = await run(files,reloaded);
    const repeated = duplicate.batch.apply(reloaded,{});
    check(repeated.result.imported === 0 && repeated.result.sets === 0 && repeated.result.measurements === 0,'No duplicate workouts, sets or measurements');
    equal(facts(repeated.state),facts(reloaded),'Reimport leaves existing results unchanged');
    Object.assign(report.workouts,{parsedRows:setCount(state),workouts:state.workouts.length,sets:setCount(state),matchedExercises:matched,customExercises:custom,invalidRows:0,duplicateRows:0,droppedValidRows:0,inventedValues:0,unitErrors:0,dateTimeErrors:0});
    Object.assign(report.measurements,{parsedRows:state.importedMeasurementSources.length,invalidRows:0,duplicatesOnFirstImport:0,persistedEntries:state.importedMeasurementSources.length,reimportDuplicates:duplicate.preview.summary.measurementDuplicates});
    report.capabilities.push({mode,identicalIdentity:true,reconciled:true,reload:true,reimport:true});
    appliedFallback = state;
  }
  for (const [index,category] of ['workouts','measurements'].entries()) {
    const {batch,preview} = await run([files[index]]);
    const result = batch.apply(blankState(),{});
    check(preview.summary.invalidRows === 0,'Independent file valid');
    report.independentFiles.push({category,workouts:result.result.imported,sets:result.result.sets,measurements:result.result.measurements});
  }
  const fallbackBackup = await buildBackupArchive(appliedFallback,[]);
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
  const restored = (await parseBackupArchive(fallbackBackup.bytes)).state;
  equal(facts(restored),facts(appliedFallback),'Fallback import survives backup/native restore');
  const crossMode = await run(files,restored);
  const crossResult = crossMode.batch.apply(restored,{});
  check(crossResult.result.imported === 0 && crossResult.result.measurements === 0 && crossResult.result.sets === 0,'Native reimport dedupes fallback identities');
  const edited = structuredClone(restored);
  edited.workouts[0].name = 'Local QA edit';
  edited.workouts[0].exercises[0].sets[0].reps = 11;
  edited.weightCheckins[0].weightKg = 83;
  const localEdit = await run(files,edited);
  equal(facts(localEdit.batch.apply(edited,{}).state),facts(edited),'Local edits not overwritten');
  report.backupRestore=true; report.crossModeReimport=true; report.localEditProtection=true;
  const current = await Promise.all(paths.map(path => readFile(path)));
  check(current.every((buffer,i) => buffer.equals(originals[i])),'Original files untouched');
  report.originalFilesUnmodified=true;
  await mkdir('artifacts/HEVY-LAN-HASH-RETEST',{recursive:true});
  await writeFile('artifacts/HEVY-LAN-HASH-RETEST/real-file-reconciliation.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  // Assertion labels above are structural. Do not print internal data or stacks.
  console.error(error.code === 'ERR_ASSERTION' ? error.message : 'Real-file QA failed; inspect locally without exporting private rows.');
  process.exitCode=1;
} finally {
  if(originalCrypto)Object.defineProperty(globalThis,'crypto',originalCrypto);else delete globalThis.crypto;
}
