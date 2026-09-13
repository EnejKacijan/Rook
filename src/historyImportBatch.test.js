import { describe,it,expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { HistoryImportBatch } from './historyImportBatch.js';
import { parseMeasurementTable, inspectMeasurementTable, isHevyMeasurementTable, applyMeasurementRecords } from './historicalMeasurements.js';
import { readHistoryCsv } from './historyImportTable.js';
import { blankState,serializeState,deserializeState,upsertWeightCheckin } from './domain.js';
import { buildBackupArchive,parseBackupArchive } from './backup.js';
import { createWorkoutHistoryExport } from './workoutHistoryExport.js';
import { importedSetComparable } from './historicalSetSemantics.js';
import { hevyCsv,hevyRow,strongCsv,xlsxFixture } from '../scripts/history-import-fixtures.mjs';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const measurement=(rows=['2025-01-02,80,18,,,,'],unit='kg',length='cm')=>`date,weight_${unit},fat_percent,neck_${length},waist_${length},left_bicep_${length},right_bicep_${length}\n${rows.join('\n')}`;
const file=(name,text)=>({name,buffer:new TextEncoder().encode(text).buffer});
const run=async(files,state=blankState(),options={})=>{
  const batch=new HistoryImportBatch(),setup=await batch.read(files,options);
  const settings=setup.files.map(f=>({sheetIndex:f.sheetIndex,options}));
  return {batch,setup,settings,preview:await batch.parse(settings,state)};
};
const textOf=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});

describe('Measurement source preservation, not a second analytics model',()=>{
  it('detects renamed Hevy measurements by schema separately from workouts',async()=>{
    expect(isHevyMeasurementTable(readHistoryCsv(measurement()))).toBe(true);
    expect(isHevyMeasurementTable(readHistoryCsv(hevyCsv()))).toBe(false);
    const {preview}=await run([file('renamed.csv',measurement())]);
    expect(preview.summary).toMatchObject({workouts:0,sets:0,measurements:1,measurementWeights:1});
  });
  it('keeps empty values null, explicit zero fat distinct, and both sides independently',async()=>{
    const p=await parseMeasurementTable(readHistoryCsv(measurement(['2025-01-02,80,0,,,30,31','2025-01-03,,18,,,,'])));
    expect(p.invalidRows).toEqual([]);
    expect(p.records[0].values).toMatchObject({fat_percent:{value:0},neck:{value:null},left_bicep:{value:30,unit:'cm'},right_bicep:{value:31,unit:'cm'}});
    const r=applyMeasurementRecords(blankState(),p.records);
    expect(r.state.weightCheckins).toHaveLength(1);expect(r.state.importedMeasurementSources).toHaveLength(2);
    expect(r.state.importedMeasurementSources[1].weightKg).toBeNull();
  });
  it('preserves pounds/inches and exact original facts without averaging',async()=>{
    const p=await parseMeasurementTable(readHistoryCsv(measurement(['2025-01-02,176.37,18,,,12,13'],'lbs','in')));
    expect(p.invalidRows).toEqual([]);expect(p.records[0].weightKg).toBeCloseTo(80,2);
    expect(p.records[0].values.weight).toEqual({value:176.37,unit:'lb'});
    expect(p.records[0].values.right_bicep).toEqual({value:13,unit:'in'});
  });
  it.each(['2025-02-30,80,18,,,,','2025-01-02,0,18,,,,','2025-01-02,,101,,,,','2025-01-02,80,18,,,-1,'])('blocks invalid measurement row %s',async row=>{
    const p=await parseMeasurementTable(readHistoryCsv(measurement([row])));expect(p.invalidRows).toHaveLength(1);expect(p.records).toHaveLength(0);
  });
  it('blocks a file with no recorded measurement values',async()=>{
    await expect(parseMeasurementTable(readHistoryCsv(measurement(['2025-01-02,,,,,,'])))).rejects.toThrow(/recorded values/);
  });
  it('generic measurement mapping requires units; stores unmapped source columns',async()=>{
    const table=readHistoryCsv('When,Scale,Left,Right,Comment\n2025-01-02,80,30,31,"č, š, ž"');
    const options={category:'measurements',mapping:{date:0,weight:1,left_bicep:2,right_bicep:3}};
    expect(inspectMeasurementTable(table,options)).toMatchObject({needsWeightUnit:true,needsLengthUnit:true});
    await expect(parseMeasurementTable(table,options)).rejects.toThrow(/units/);
    const p=await parseMeasurementTable(table,{...options,weightUnit:'kg',lengthUnit:'cm'});
    expect(p.records[0].sourceValues.Comment).toBe('č, š, ž');expect(p.records[0].values.right_bicep.value).toBe(31);
  });
  it('rejects conflicting explicit units instead of using chosen defaults',async()=>{
    const p=await parseMeasurementTable(readHistoryCsv(measurement(['2025-01-02,80lb,18,,,,'])),{weightUnit:'kg'});
    expect(p.invalidRows[0].reason).toMatch(/Conflicting/);
  });
  it('dedupes by canonical source content across filenames, rows and column order',async()=>{
    const {batch}=await run([file('a.csv',measurement(['2025-01-02,80,18,,,,','2025-01-03,81,,,,,']))]);
    const state=batch.apply(blankState(),{}).state;
    const t=readHistoryCsv(measurement(['2025-01-03,81,,,,,','2025-01-02,80,18,,,,']));
    t.rows=t.rows.map(row=>row.toReversed());
    const p=await parseMeasurementTable(t);
    const r=applyMeasurementRecords(state,p.records);
    expect(r.result).toMatchObject({measurements:0,mappedWeights:0,measurementDuplicates:2});
    expect(r.state).toEqual(state);
  });
  it('never overwrites local edits; new conflicting source requires review then provenance-only',async()=>{
    const {batch}=await run([file('a.csv',measurement())]);
    let state=batch.apply(blankState(),{}).state;
    state.weightCheckins=upsertWeightCheckin(state.weightCheckins,{localDate:'2025-01-02',weightKg:82});
    const same=await run([file('a.csv',measurement())],state);
    expect(same.batch.apply(state,{}).state.weightCheckins[0].weightKg).toBe(82);
    const changed=await run([file('a.csv',measurement(['2025-01-02,81,18,,,,']))],state);
    expect(changed.preview.summary.measurementConflicts).toBe(1);
    expect(()=>changed.batch.apply(state,{})).toThrow(/conflicting/);
    const resolved=changed.batch.apply(state,{keepExistingMeasurements:true});
    expect(resolved.state.weightCheckins[0].weightKg).toBe(82);
    expect(resolved.state.importedMeasurementSources.at(-1).weightKg).toBe(81);
  });
});

describe('Batch transaction and data ownership',()=>{
  it.each(['workouts','measurements','both'])('imports %s without changing input state',async kind=>{
    const state=blankState(),before=serializeState(state);
    const files=[...(kind!=='measurements'?[file('w.csv',hevyCsv())]:[]),...(kind!=='workouts'?[file('m.csv',measurement())]:[])];
    const {batch}=await run(files,state,{source:'hevy'}),r=batch.apply(state,{});
    expect(serializeState(state)).toBe(before);
    expect(r.result.imported).toBe(kind==='measurements'?0:1);expect(r.result.measurements).toBe(kind==='workouts'?0:1);
    expect(deserializeState(serializeState(r.state)).importedMeasurementSources).toEqual(r.state.importedMeasurementSources);
  });
  it('valid first file plus invalid second cannot persist either',async()=>{
    const state=blankState();
    const {batch,preview}=await run([file('w.csv',hevyCsv()),file('m.csv',measurement(['2025-01-02,,200,,,,']))]);
    expect(preview.summary.invalidRows).toBe(1);expect(()=>batch.apply(state,{})).toThrow(/invalid rows/);expect(state.workouts).toEqual([]);
    await expect(batch.read([file('w.csv',hevyCsv()),file('broken.csv','a,b\n"unclosed')])).rejects.toThrow(/unclosed/);
    expect(()=>batch.apply(state,{})).toThrow(/Review all/);
  });
  it('selects XLSX worksheets independently for different files',async()=>{
    const rows=readHistoryCsv(measurement()).rows;
    const {preview}=await run([{name:'m.xlsx',buffer:xlsxFixture([{name:'Measures',rows}]).buffer},file('w.csv',hevyCsv())]);
    expect(preview.summary).toMatchObject({measurements:1,workouts:1});
  });
  it('dedupes duplicates within a batch and on repeat without extra sets/check-ins',async()=>{
    const files=[file('a.csv',hevyCsv()),file('b.csv',hevyCsv()),file('c.csv',measurement()),file('d.csv',measurement())];
    const first=await run(files),state=first.batch.apply(blankState(),{}).state;
    expect(state.workouts).toHaveLength(1);expect(state.weightCheckins).toHaveLength(1);
    const second=await run(files,state);const result=second.batch.apply(state,{});
    expect(result.result).toMatchObject({imported:0,sets:0,measurements:0,measurementDuplicates:2});expect(result.state).toEqual(state);
  });
  it('retains an explicitly unclassified source load without turning it into a PR',async()=>{
    const data=hevyCsv([hevyRow({exercise_title:'Unclassified equipment movement'})]);
    const {batch}=await run([file('w.csv',data)]);
    batch.resolve(blankState(),'Unclassified equipment movement',{type:'custom'});
    batch.resolve(blankState(),'Unclassified equipment movement',{type:'load',loadKind:'unknown'});
    const state=batch.apply(blankState(),{}).state,set=state.workouts[0].exercises[0].sets[0];
    expect(set.weight).toBe(60);expect(set.rawImport.loadKind).toBe('unknown');expect(importedSetComparable(set)).toBe(false);
    const repeated=await run([file('renamed.csv',data)],state);
    expect(repeated.preview.summary).toMatchObject({exactDuplicates:1,reviewExercises:0,loadDecisions:0});
    expect(repeated.batch.apply(state,{}).result.imported).toBe(0);
  });
  it('retains body-weight/provenance through ZIP backup, restore and JSON export',async()=>{
    const {batch}=await run([file('w.csv',hevyCsv()),file('m.csv',measurement())]);
    const state=batch.apply(blankState(),{}).state;
    const backup=await buildBackupArchive(state,[]);
    const restored=await parseBackupArchive(backup.bytes);
    expect(restored.state.importedMeasurementSources).toEqual(state.importedMeasurementSources);
    expect(restored.state.weightCheckins).toEqual(state.weightCheckins);
    const exported=JSON.parse(await textOf(await createWorkoutHistoryExport(restored.state,{format:'json',yieldWork:async()=>{}})));
    expect(exported.imported_measurement_sources).toEqual(state.importedMeasurementSources);
    expect(exported.body_weight_checkins).toEqual(state.weightCheckins);
  });
  it('keeps Strong first-class for reordered Android unit columns and optional RPE',async()=>{
    const csv='Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration\n2025-01-02 12:00:00;Upper;Bench Press;1;100;lbs;8;8;;;;Local note;Session note;1h 2m';
    const {preview,batch}=await run([file('android.csv',csv)],blankState(),{source:'strong'});
    expect(preview.summary.invalidRows).toBe(0);expect(preview.source).toBe('strong');
    const set=batch.apply(blankState(),{}).state.workouts[0].exercises[0].sets[0];
    expect(set.rawImport.weightUnit).toBe('lb');expect(set.rpe).toBe(8);expect(set.rir).toBeNull();
  });
  it('Strong missing units still block and work after explicit confirmation',async()=>{
    const b=new HistoryImportBatch();const setup=await b.read([file('s.csv',strongCsv())]);
    expect(setup.files[0].info.needsWeightUnit).toBe(true);
    await expect(b.parse([{sheetIndex:0,options:{}}],blankState())).rejects.toThrow(/weight unit/);
    const p=await b.parse([{sheetIndex:0,options:{weightUnit:'kg',distanceUnit:'km'}}],blankState());expect(p.source).toBe('strong');
  });
});

describe('Real-shape Hevy boundaries',()=>{
  it('retains 0,0,1,2 as two passes without discarding or inferring sides',async()=>{
    const data=hevyCsv([0,0,1,2].map(set_index=>hevyRow({set_index})));
    const {preview}=await run([file('w.csv',data)]);
    expect(preview.summary).toMatchObject({invalidRows:0,sets:4});
    expect(preview.workouts[0].exercises.map(e=>e.sets.length)).toEqual([1,3]);
    expect(preview.workouts[0].exercises.every(e=>!e.loggingMode)).toBe(true);
  });
  it('does not reinterpret arbitrary repeated nonzero indices',async()=>{
    const {preview}=await run([file('w.csv',hevyCsv([1,1].map(set_index=>hevyRow({set_index}))))]);expect(preview.summary.invalidRows).toBe(1);
  });
  it('scopes identical numeric superset ID 0 independently per workout',async()=>{
    const rows=['2025-01-02 12:00:00','2025-01-03 12:00:00'].flatMap(start_time=>['Cable Fly','Cable Row'].map(exercise_title=>hevyRow({start_time,end_time:'',exercise_title,superset_id:0})));
    const {preview}=await run([file('w.csv',hevyCsv(rows))]);const [a,b]=preview.workouts;
    expect(a.exercises[0].supersetId).toBe(a.exercises[1].supersetId);
    expect(b.exercises[0].supersetId).toBe(b.exercises[1].supersetId);
    expect(a.exercises[0].supersetId).not.toBe(b.exercises[0].supersetId);
  });
  it('matches only all-word canonical equipment aliases, never drops modifiers',async()=>{
    const {preview}=await run([file('w.csv',hevyCsv(['Incline Bench Press (Dumbbell)','Romanian Deadlift (Dumbbell)','Totally Different Incline Bench Press (Dumbbell)'].map(exercise_title=>hevyRow({exercise_title}))))]);
    expect(preview.exerciseMappings.map(m=>!!m.exerciseId)).toEqual([true,true,true]);
    expect(preview.exerciseMappings[2].exerciseId).toMatch(/^custom-import-/);
  });
});
