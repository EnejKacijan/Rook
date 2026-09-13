import { readHistoricalFile, HISTORY_FILE_LIMITS } from './historyImportFile.js';
import { inspectHistoryTable } from './historySourceAdapters.js';
import { parseHistoricalWorkoutTable, resolveHistoricalExercise, applyHistoricalWorkoutImport, compactHistoricalPreview, summarizePreview } from './historicalWorkoutImport.js';
import { isHevyMeasurementTable, inspectMeasurementTable, parseMeasurementTable, reviewMeasurementRecords, applyMeasurementRecords } from './historicalMeasurements.js';
import { createImportTiming } from './importTiming.js';
import { matchHistoricalExercise } from './historicalExerciseMatching.js';
import { exerciseCatalog } from './domain.js';

export function inspectImportTable(table, options={}) {
  const measurements=isHevyMeasurementTable(table)||options.category==='measurements';
  if(measurements) {
    const info=inspectMeasurementTable(table,options);
    if(options.source&&options.source!=='generic'&&options.source!==info.source)throw new Error('Measurement schema does not match the selected source. Choose Generic CSV / XLSX to map it.');
    return info;
  }
  return {...inspectHistoryTable(table,options),category:'workouts'};
}

// One worker-owned migration draft. No persistence or network authority here.
export class HistoryImportBatch {
  constructor(onProgress){this.onProgress=onProgress;this.timing=createImportTiming(onProgress);}
  files=[];
  preview=null;
  measurementRecords=[];
  async read(files,options={}) {
    this.timing=createImportTiming(this.onProgress);
    this.preview=null;this.files=[];this.measurementRecords=[];
    if(!files.length||files.length>10)throw new Error('Choose between 1 and 10 history files.');
    if(files.reduce((n,f)=>n+f.buffer.byteLength,0)>HISTORY_FILE_LIMITS.bytes)throw new Error('Selected files exceed the 25 MB combined local import limit.');
    const read=[];let rows=0;
    for(const file of files) {
      const finish=this.timing.begin('CSV / XLSX parse',file.buffer.byteLength);
      const sheets=await readHistoricalFile(file.name,file.buffer);
      finish();
      rows+=sheets.reduce((n,s)=>n+s.rows.length,0);
      if(rows>HISTORY_FILE_LIMITS.rows)throw new Error('Selected worksheets exceed the 150,000-row combined safety limit. Export a smaller date range.');
      const sheetIndex=sheets.findIndex(s=>s.rows.length>1);
      if(sheetIndex<0)throw new Error(`${file.name}: no data rows found.`);
      read.push({name:file.name,sheets,sheetIndex});
    }
    this.files=read;
    return {files:read.map((f,fileIndex)=>({...this.inspect(fileIndex,f.sheetIndex,options),name:f.name,sheetIndex:f.sheetIndex,
      sheets:f.sheets.map(s=>({name:s.name,rowCount:Math.max(0,s.rows.length-1)}))}))};
  }
  inspect(fileIndex,sheetIndex,options={}) {
    const table=this.files[fileIndex]?.sheets[sheetIndex];
    if(!table)throw new Error('Choose an available worksheet.');
    return {info:inspectImportTable(table,options),sample:table.rows.slice(1,4)};
  }
  async parse(settings,state) {
    this.preview=null;this.measurementRecords=[];
    if(settings.length!==this.files.length)throw new Error('Review settings for every selected file.');
    const previews=[],measurementErrors=[],measurementWarnings=new Set(),matchCache=new Map();
    for(const [index,file] of this.files.entries()) {
      const {sheetIndex,options={}}=settings[index],table=file.sheets[sheetIndex];
      const info=this.inspect(index,sheetIndex,options).info;
      if(info.category==='measurements') {
        const finish=this.timing.begin('measurement validation / hashes',table.rows.length-1);
        const parsed=await parseMeasurementTable(table,options);
        finish();
        this.measurementRecords.push(...parsed.records);measurementErrors.push(...parsed.invalidRows);
        if(info.unmappedColumns.length)measurementWarnings.add('Unmapped measurement columns are retained as source metadata.');
      } else previews.push(parseHistoricalWorkoutTable({...options,table,state,fileName:file.name,timing:this.timing,matchCache,deferDuplicates:true}));
    }
    const sources=[...new Set(previews.map(p=>p.source))];
    const mappings=new Map();
    for(const p of previews)for(const m of p.exerciseMappings) {
      const key=m.sourceKey, existing=mappings.get(key);
      if(existing){existing.needsLoadKind ||= m.needsLoadKind;existing.loadKind ||= m.loadKind;}
      else mappings.set(key,{...m});
    }
    const unique=field=>[...new Set(previews.flatMap(p=>p.fileInfo[field]))];
    const dates=[...previews.flatMap(p=>p.dateRange),...this.measurementRecords.map(r=>r.localDate)].sort();
    const base={id:'history-batch',source:sources.length===1?sources[0]:sources.length?'generic':this.measurementRecords[0]?.source||'generic',
      sourceLabel:[...new Set([...previews.map(p=>p.sourceLabel),...this.measurementRecords.map(r=>r.source==='hevy'?'Hevy':'Generic measurements')])].join(' + '),
      fileName:this.files.map(f=>f.name).join(' + '),workouts:previews.flatMap(p=>p.workouts.map(w=>({...w,importSource:p.source,importSourceLabel:p.sourceLabel}))),
      invalidRows:[...previews.flatMap(p=>p.invalidRows),...measurementErrors],exerciseMappings:[...mappings.values()],
      warnings:[...new Set([...previews.flatMap(p=>p.warnings),...measurementWarnings])],
      fileInfo:{weightUnits:unique('weightUnits'),distanceUnits:unique('distanceUnits')},dateRange:dates.length?[dates[0],dates.at(-1)]:[]};
    this.preview=await compactHistoricalPreview(base,state,this.timing);
    return this.review(state);
  }
  review(state) {
    const measurements=reviewMeasurementRecords(this.measurementRecords,state);
    const preservedFields=[...new Set(measurements.flatMap(r=>Object.entries(r.values).filter(([k,v])=>k!=='weight'&&v.value!=null).map(([k])=>k)))];
    const p=summarizePreview(this.preview);
    return {...p,timing:this.timing.snapshot(),measurements,preservedMeasurementFields:preservedFields,summary:{...p.summary,
      measurements:measurements.length,measurementDuplicates:measurements.filter(r=>r.duplicate).length,
      measurementConflicts:measurements.filter(r=>r.conflict).length,measurementWeights:measurements.filter(r=>r.weightKg!=null).length}};
  }
  reviewMatches(state) {
    if(!this.preview)throw new Error('Review files before matching exercises.');
    for(const mapping of this.preview.exerciseMappings){
      if(mapping.ignored||mapping.optionalReviewed||mapping.rememberMatch||mapping.matchStatus!=='custom-auto')continue;
      if(mapping.optionalSearched)continue;
      const finish=this.timing.begin('optional advanced matching',1);
      mapping.match=matchHistoricalExercise(mapping.sourceName,state,exerciseCatalog,mapping.source,{advanced:true});
      mapping.optionalSearched=true;
      finish();
    }
    return this.review(state);
  }
  resolve(state,name,resolution) {
    if(!this.preview)throw new Error('Review files before resolving exercises.');
    this.preview=resolveHistoricalExercise(this.preview,state,name,resolution);
    return this.review(state);
  }
  apply(state,options) {
    if(!this.preview)throw new Error('Review all selected files before importing.');
    const workout=applyHistoricalWorkoutImport(state,this.preview,options);
    const measurement=applyMeasurementRecords(workout.state,this.measurementRecords,options);
    return {state:measurement.state,result:{...workout.result,...measurement.result}};
  }
}
