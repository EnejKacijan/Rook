import { hashCanonicalImportData } from './historyImportHash.js';
import {
  exerciseCatalog,
  exerciseName,
  exerciseLoadRequirement,
  rankExerciseSearch,
  storedWeight,
  workoutPlanDate,
} from "./domain.js";
import {
  customExerciseSnapshot,
  normalizeExerciseAlias,
  registerCustomExerciseRecord,
  rememberHistoricalExerciseAlias,
  historicalSourceKey,
  importedHistoricalExercise,
} from "./customExercises.js";
import { matchHistoricalExercise } from './historicalExerciseMatching.js';

import { readHistoryCsv, cleanHistoryCell, historyDate } from './historyImportTable.js';
import { inspectHistoryTable, readHistoryRows } from './historySourceAdapters.js';
export { detectHistoricalImportSource } from './historyImportTable.js';
export { inspectHistoryTable } from './historySourceAdapters.js';

export const HISTORICAL_IMPORT_SOURCES = {
  hevy: { label: 'Hevy', detail: 'Workout and measurement CSVs · select one or both' },
  strong: { label: 'Strong', detail: 'Workout CSV · confirm units when absent' },
  generic: { label: 'Generic CSV / XLSX', detail: 'Other spreadsheets · map columns when needed' },
};
export const GENERIC_HISTORY_CSV_HEADER = 'workout_date,workout_name,exercise_name,set_order,weight,weight_unit,reps,duration_seconds,notes,workout_notes';
export const parseCsv = text => readHistoryCsv(text).rows;
function hash(value) {
  let result=2166136261;
  for(const character of String(value)){result^=character.charCodeAt(0);result=Math.imul(result,16777619);}
  return (result>>>0).toString(36);
}
const clean = cleanHistoryCell;
const notesOf = rows => [...new Set(rows.filter(Boolean))].join('\n') || null;

// Keep the canonical source content as the duplicate key, not a short hash:
// a hash collision must never cause a performed workout to be skipped.
function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
export function historicalWorkoutFingerprint(workout) {
  if (workout.sourceFingerprint) return workout.sourceFingerprint;
  return JSON.stringify(stableValue({
    date:workout.startedAt || workout.completedAt, name:workout.name,
    exercises:(workout.exercises||[]).map(ex=>({
      name:ex.exerciseId||ex.sourceName,sets:(ex.sets||[]).map(s=>({
        weight:s.weight??null,reps:s.reps??null,duration:s.durationSeconds??s.seconds??null,
        distance:s.distance??null,type:s.importSetType||s.setType||null,
      })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })).sort((a,b)=>String(a.name).localeCompare(String(b.name))),
  }));
}
function identityOf(workout) {
  return workout.historicalImport?.sourceIdentity || workout.sourceIdentity ||
    JSON.stringify([workoutPlanDate(workout),normalizeExerciseAlias(workout.name)]);
}
function classifyDuplicates(workouts, existingWorkouts) {
  const fingerprints=new Set(), identities=new Set(), legacyDates=new Set();
  for(const workout of existingWorkouts||[]) {
    if(!workout.historicalImport?.partial)fingerprints.add(workout.historicalImport?.fingerprint || historicalWorkoutFingerprint(workout));
    identities.add(identityOf(workout));
    if(!workout.historicalImport?.sourceIdentity)
      legacyDates.add(JSON.stringify([workoutPlanDate(workout),normalizeExerciseAlias(workout.name)]));
  }
  return workouts.map(workout=>{
    const fingerprint=historicalWorkoutFingerprint(workout), identity=identityOf(workout);
    const duplicate=fingerprints.has(fingerprint)?'exact':
      identities.has(identity)||legacyDates.has(JSON.stringify([workoutPlanDate(workout),normalizeExerciseAlias(workout.name)]))?'ambiguous':null;
    fingerprints.add(fingerprint);identities.add(identity);
    return {...workout,fingerprint,duplicate};
  });
}
const normalizedSetType=value=>clean(value).toLowerCase().replace(/[\s_-]/g,'');
const sourceSetKind=value=>({normal:'standard',standard:'standard',warmup:'warmup',failure:'failure',dropset:'drop',drop:'drop',restpause:'rest_pause',amrap:'amrap'})[normalizedSetType(value)]||null;
function endFromDuration(started, duration) {
  if(started.precision!=='datetime'||duration==null)return null;
  const zone=started.zone;
  const offset=zone&&zone!=='Z' ? (zone[0]==='-'?-1:1)*(Number(zone.slice(1,3))*60+Number(zone.replace(':','').slice(3))) : 0;
  const local=new Date(started.sortable+duration*1000+offset*60000).toISOString().replace(/Z$/,'');
  return {...historyDate(local+(zone||'')),derivedFrom:'source-duration'};
}
function loadReview(exercise) {
  const definition=exerciseCatalog[exercise.exerciseId]||exercise.customRecord;
  const requirement=definition ? exerciseLoadRequirement(definition) : null;
  const positive=exercise.sets.some(s=>s.rawImport.weight>0&&!s.rawImport.loadKind);
  return positive && (!definition || ['optional','none'].includes(requirement) || exercise.customRecord);
}
function buildPreview(info, parsedRows, invalidRows, state, fileName, table, {timing, matchCache = new Map(), deferDuplicates = false} = {}) {
  const finishNames=timing?.begin('unique exercises',parsedRows.length);
  const byWorkout=new Map(), warnings=new Set(), matches=new Map(),customRecords=new Map(),sourceNames=new Map();
  for(const name of [...new Set(parsedRows.map(r=>r.exerciseName))].sort())if(!sourceNames.has(normalizeExerciseAlias(name)))sourceNames.set(normalizeExerciseAlias(name),name);
  finishNames?.();
  const finishGrouping=timing?.begin('workout grouping',parsedRows.length);
  for(const row of parsedRows) {
    const key=JSON.stringify([row.workoutId,row.started.value,row.workoutName]);
    if(!byWorkout.has(key))byWorkout.set(key,[]);
    byWorkout.get(key).push(row);
  }
  finishGrouping?.();
  // One proof lookup per unique provider/name in this job, not per set or file.
  for(const [alias,name] of sourceNames){
    const key=historicalSourceKey(info.source,name);
    if(!matchCache.has(key)){
      const finish=timing?.begin('matching',1);
      matchCache.set(key,matchHistoricalExercise(name,state,exerciseCatalog,info.source));
      finish?.();
    }
    matches.set(alias,matchCache.get(key));
  }
  const finishConstruction=timing?.begin('preview construction',parsedRows.length);
  const workouts=[...byWorkout].map(([key,rows])=>{
    const first=rows[0], byExercise=new Map();
    const ends=new Set(rows.map(r=>r.ended?.value).filter(Boolean));
    const durations=new Set(rows.map(r=>r.duration).filter(v=>v!=null));
    if(ends.size>1||durations.size>1)invalidRows.push({line:first.line,reason:'Conflicting end times/durations within one workout; review the source.',raw:first.sourceValues});
    const runs = new Map();
    for(const row of rows) {
      const baseKey=JSON.stringify([row.exerciseBlockId,row.exerciseOrder,normalizeExerciseAlias(row.exerciseName),row.supersetId]);
      const run = runs.get(baseKey) || { index: 0, last: null };
      // Hevy exports separate logging passes without exercise-entry IDs. A
      // zero-index restart is a new bounded pass, not a duplicate performed set.
      if(info.source==='hevy' && !row.exerciseBlockId && row.exerciseOrder==null && row.setOrder===0 && run.last!=null) {
        run.index++;
        warnings.add('Repeated Hevy exercise passes are kept separately in source order. No left/right side is inferred.');
      }
      run.last=row.setOrder;
      runs.set(baseKey,run);
      const exerciseKey=JSON.stringify([baseKey,run.index]);
      if(!byExercise.has(exerciseKey))byExercise.set(exerciseKey,[]);
      byExercise.get(exerciseKey).push(row);
    }
    const groups=[...byExercise.values()];
    if(groups.every(group=>group[0].exerciseOrder!=null)) groups.sort((a,b)=>a[0].exerciseOrder-b[0].exerciseOrder);
    const exercises=groups.map((exerciseRows,exerciseIndex)=>{
      const sourceName=exerciseRows[0].exerciseName, alias=normalizeExerciseAlias(sourceName);
      const resolution=matches.get(alias);
      const autoCustom=!resolution.exerciseId&&resolution.tier==='C'&&!resolution.requiresReview;
      if(autoCustom&&!customRecords.has(alias))customRecords.set(alias,importedHistoricalExercise(info.source,sourceNames.get(alias),state));
      const customRecord=autoCustom?customRecords.get(alias):null;
      const exerciseId=resolution?.exerciseId||customRecord?.id||null;
      const orderKeys=new Set();
      for(const row of exerciseRows) {
        // Strong may number warm-up and working sets independently (W1, 1).
        const orderKey=info.source==='strong'?JSON.stringify([row.setType,row.setOrder]):row.setOrder;
        if(row.setOrder!=null&&orderKeys.has(orderKey)) invalidRows.push({line:row.line,reason:'Repeated set index in one exercise block. Map an exercise block/order column or correct the source; rows were not merged or discarded.',raw:row.sourceValues});
        orderKeys.add(orderKey);
      }
      const ordered=[...exerciseRows];
      // Strong W/D markers do not establish a global numeric order across types.
      if(info.source!=='strong'&&ordered.every(r=>r.setOrder!=null))ordered.sort((a,b)=>a.setOrder-b.setOrder);
      const sets=ordered.map((row,setIndex)=>{
        const kind=sourceSetKind(row.setType);
        if(!kind)warnings.add(row.setType ? 'Unknown set types are retained verbatim and excluded from comparable working-set/PR metrics.' : 'This file does not state every set type. Unspecified types are retained and excluded from comparable working-set/PR metrics.');
        if(row.rpe!=null)warnings.add('RPE is retained as source RPE, never converted to RIR.');
        if(kind&&kind!=='standard')warnings.add('Special set types remain in history. Warm-ups are excluded from working volume; only comparable normal rep/load sets contribute to working-load and PR estimates.');
        return {
          id:'import-set-'+hash(key+'|'+exerciseIndex+'|'+setIndex),completed:true,
          planned:kind!=null&&kind!=='warmup',
          weight:row.weight==null?null:storedWeight(row.weight,row.unit), reps:row.reps,
          durationSeconds:row.seconds,seconds:row.seconds,distance:row.distance,distanceUnit:row.distanceUnit,
          importSetType:row.setType, setType:['drop','rest_pause','amrap'].includes(kind)?kind:undefined,
          rir:row.rir,rpe:row.rpe,
          rawImport:{version:2,weight:row.weight,weightUnit:row.unit,unitSource:row.rawUnit,
            rpe:row.rpe,rir:row.rir,setOrder:row.setOrder,setType:row.setType,
            loadKind:row.loadKind,sourceRow:row.line,sourceIndex:row.sourceIndex,
            sourceValues:row.sourceValues,sourceCells:row.sourceCells,
          },
        };
      });
      const exercise={
        id:'import-exercise-'+hash(key+'|'+exerciseIndex),sourceName,source:info.source,sourceKey:historicalSourceKey(info.source,sourceName),exerciseId,matchStatus:autoCustom?'custom-auto':resolution?.status||'unresolved',
        matchProvenance:{version:resolution.version,tier:resolution.tier,reason:resolution.reason,sourceIdentity:alias},
        rememberMatch:false,ignored:false,customRecord,notes:notesOf(exerciseRows.map(r=>r.notes)),
        sourceExerciseOrder:exerciseRows[0].exerciseOrder,sourceExerciseBlockId:exerciseRows[0].exerciseBlockId,
        sourceSupersetId:exerciseRows[0].supersetId,sets,
      };
      exercise.needsLoadKind=Boolean(loadReview(exercise));
      // Missing meaning is safely representable: retain the number as source
      // data and exclude it from load/PR metrics unless explicitly clarified.
      if(exercise.needsLoadKind)exercise.loadKind='unknown';
      return exercise;
    });
    const pairs=new Map();
    for(const ex of exercises)if(ex.sourceSupersetId){
      if(!/^[\p{L}\p{N}][\p{L}\p{N} _:-]{0,127}$/u.test(ex.sourceSupersetId)){
        warnings.add('Malformed source group IDs are retained as metadata, not used to create A1/A2 links.');continue;
      }
      if(!pairs.has(ex.sourceSupersetId))pairs.set(ex.sourceSupersetId,[]);
      pairs.get(ex.sourceSupersetId).push(ex);
    }
    for(const [id,members]of pairs) {
      if(members.length===2) members.forEach((ex,index)=>{ex.supersetId='history-pair-'+hash(key+'|'+id);ex.supersetOrder=index+1;});
      else warnings.add('Source groups with other than two exercises remain historical source groups, not executable ROOK A1/A2 pairs.');
    }
    const ended=rows.find(r=>r.ended)?.ended || endFromDuration(first.started,rows.find(r=>r.duration!=null)?.duration);
    const duration=rows.find(r=>r.duration!=null)?.duration ??
      (ended&&first.started.precision==='datetime'&&ended.precision==='datetime' ? (ended.sortable-first.started.sortable)/1000 : null);
    const sourceRows=rows.map(r=>stableValue({
      // Physical row position is deliberately excluded; explicit source order is included.
      values:r.sourceValues, weightUnit:r.unit,distanceUnit:r.distanceUnit,
    })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const working=exercises.reduce((n,ex)=>n+ex.sets.filter(s=>s.planned).length,0);
    const count=exercises.reduce((n,ex)=>n+ex.sets.length,0);
    return {
      id:'import-workout-'+hash(key),name:first.workoutName,canonicalPlanDate:first.started.day,
      // Keep wall-clock timestamps without adding a timezone the source never gave us.
      startedAt:first.started.precision==='datetime'?first.started.value:null,
      endedAt:ended?.precision==='datetime'?ended.value:null,
      completedAt:ended?.value||first.started.value,durationSeconds:duration,
      sourceDate:first.started,sourceEnd:ended||null,sourceWorkoutId:first.workoutId,
      needsGroupingReview:first.started.precision==='date'&&!first.workoutId&&rows.length>1,
      sourceIdentity:JSON.stringify([info.source,first.workoutId,first.started.value,first.workoutName]),
      sourceFingerprint:JSON.stringify([info.source,key,sourceRows]),
      status:'completed',endedEarly:false,plannedSetCount:working,completedPlannedSetCount:working,completedSetCount:count,
      sessionNote:notesOf(rows.map(r=>r.workoutNotes)),exercises,
    };
  });
  const classified=deferDuplicates?workouts:classifyDuplicates(workouts,state.workouts||[]);
  const mappings=new Map();
  for(const workout of classified)for(const exercise of workout.exercises) {
    const alias=normalizeExerciseAlias(exercise.sourceName), previous=mappings.get(alias);
    if(!previous)mappings.set(alias,{
      sourceName:sourceNames.get(alias),source:exercise.source,sourceKey:exercise.sourceKey,exerciseId:exercise.exerciseId,matchStatus:exercise.matchStatus,
      match:matches.get(alias),
      ignored:false,rememberMatch:false,customRecord:exercise.customRecord,needsLoadKind:exercise.needsLoadKind,loadKind:exercise.loadKind||null,
    });
    else {previous.needsLoadKind ||= exercise.needsLoadKind;previous.loadKind ||= exercise.loadKind;}
  }
  if(parsedRows.some(r=>r.started.zone==null))warnings.add('Source dates/times have no timezone. Their local calendar dates are preserved without assuming UTC.');
  if(info.unmappedColumns.length)warnings.add('Unmapped columns are retained in source metadata, not interpreted as training results.');
  const dates=classified.map(w=>w.canonicalPlanDate).sort();
  finishConstruction?.();
  return summarizePreview({
    id:'history-import-'+hash(info.source+'|'+fileName+'|'+parsedRows.length),
    source:info.source,sourceLabel:HISTORICAL_IMPORT_SOURCES[info.source].label,fileName,
    workouts:classified,invalidRows,exerciseMappings:[...mappings.values()],warnings:[...warnings],
    fileInfo:{...info,encoding:table.encoding,delimiter:table.delimiter,format:table.format,
      weightUnits:[...new Set(parsedRows.map(r=>r.unit).filter(Boolean))],
      distanceUnits:[...new Set(parsedRows.map(r=>r.distanceUnit).filter(Boolean))]},
    dateRange:dates.length?[dates[0],dates.at(-1)]:[],
  });
}
export function summarizePreview(preview) {
  const mappings=preview.exerciseMappings||[];
  const pendingNames=new Set(preview.workouts.filter(w=>w.duplicate!=='exact').flatMap(w=>w.exercises.map(e=>e.sourceKey||historicalSourceKey(preview.source,e.sourceName))));
  const pending=mappings.filter(m=>pendingNames.has(m.sourceKey||historicalSourceKey(preview.source,m.sourceName)));
  return {...preview,summary:{
    workouts:preview.workouts.length,sets:preview.workouts.reduce((n,w)=>n+w.exercises.reduce((n,e)=>n+e.sets.length,0),0),
    matchedExercises:mappings.filter(m=>m.exerciseId&&!m.ignored).length,
    autoMatchedExercises:mappings.filter(m=>m.exerciseId&&!m.exerciseId.startsWith('custom-')&&!m.ignored&&['matched','alias','remembered-alias'].includes(m.matchStatus)).length,
    suggestedExercises:pending.filter(m=>!m.ignored&&m.match?.tier==='B'&&!m.optionalReviewed).length,
    ambiguousExercises:pending.filter(m=>!m.exerciseId&&!m.ignored&&m.match?.tier!=='B').length,
    customExercises:mappings.filter(m=>!m.ignored&&m.exerciseId?.startsWith('custom-')).length,
    reviewExercises:mappings.filter(m=>!m.exerciseId&&!m.ignored&&m.match?.requiresReview).length,
    loadDecisions:pending.filter(m=>m.needsLoadKind&&!m.loadKind&&!m.ignored).length,
    ignoredExercises:mappings.filter(m=>m.ignored).length,
    groupingDecisions:preview.workouts.filter(w=>w.needsGroupingReview&&w.duplicate!=='exact'&&w.exercises.filter(e=>!e.ignored).reduce((n,e)=>n+e.sets.length,0)>1).length,
    exactDuplicates:preview.workouts.filter(w=>w.duplicate==='exact').length,
    ambiguousDuplicates:preview.workouts.filter(w=>w.duplicate==='ambiguous').length,invalidRows:preview.invalidRows.length,
  }};
}
export function parseHistoricalWorkoutTable({table,state={},fileName='workouts.csv',timing,matchCache,deferDuplicates=false,...options}) {
  const finishValidation=timing?.begin('validation',Math.max(0,table.rows.length-1));
  const info=inspectHistoryTable(table,{...options,weightUnit:options.weightUnit||options.strongUnit});
  if(info.needsMapping)throw new Error('Map the date, exercise and performed-result columns before importing.');
  if(info.needsWeightUnit)throw new Error('Choose the weight unit used in this export.');
  if(info.needsDistanceUnit)throw new Error('Choose the distance unit used in this export.');
  const {parsedRows,invalidRows}=readHistoryRows(table,info,options);
  finishValidation?.();
  if(!parsedRows.length)throw new Error(invalidRows[0]?.reason||'No importable workout sets were found.');
  return buildPreview(info,parsedRows,invalidRows,state,fileName,table,{timing,matchCache,deferDuplicates});
}
export function parseHistoricalWorkoutCsv({text,...options}) {
  return parseHistoricalWorkoutTable({...options,table:readHistoryCsv(text)});
}

export async function compactHistoricalPreview(preview, state = {}, timing) {
  // Compatible local SHA-256 keeps duplicate evidence compact in durable storage.
  // Chunked batches avoid thousands of simultaneous crypto jobs on phones.
  const unhashed=preview.workouts.filter(w=>!w.sourceFingerprint.startsWith('sha256:'));
  const finishHashes=timing?.begin('hashes',unhashed.length);
  for(let i=0;i<unhashed.length;i+=40) await Promise.all(unhashed.slice(i,i+40).map(async workout=>{
    workout.sourceFingerprint='sha256:'+await hashCanonicalImportData(workout.sourceFingerprint);
  }));
  finishHashes?.();
  const finishDuplicates=timing?.begin('duplicate detection',preview.workouts.length+(state.workouts||[]).length);
  preview.workouts=classifyDuplicates(preview.workouts,state.workouts||[]);
  finishDuplicates?.();
  return summarizePreview(preview);
}
export function resolveHistoricalExercise(preview, state, sourceName, resolution) {
  const next = structuredClone(preview);
  const exact=next.exerciseMappings.find(item=>item.sourceKey===sourceName);
  const named=next.exerciseMappings.filter(item=>normalizeExerciseAlias(item.sourceName)===normalizeExerciseAlias(sourceName));
  if(!exact&&named.length>1)throw new Error('Choose the source-specific mapping. These names belong to different providers.');
  const mapping = exact||named[0];
  if (!mapping) return next;
  const belongs=exercise=>exercise.sourceKey===mapping.sourceKey||!exercise.sourceKey&&normalizeExerciseAlias(exercise.sourceName)===normalizeExerciseAlias(mapping.sourceName);
  mapping.ignored = resolution.type === "ignore";
  if (Object.hasOwn(resolution, 'rememberMatch')) mapping.rememberMatch = Boolean(resolution.rememberMatch);
  if (resolution.type === 'ignore') mapping.customRecord = null;
  if (resolution.type === 'load') {
    if (!['external', 'added', 'assisted', 'bodyweight', 'none', 'unknown'].includes(resolution.loadKind)) throw new Error('Choose the meaning of the source load.');
    mapping.loadKind = resolution.loadKind;
  }
  if (resolution.type === "custom") {
    mapping.customRecord = importedHistoricalExercise(mapping.source||next.source,mapping.sourceName,state);
    mapping.exerciseId = mapping.customRecord.id;
    mapping.matchStatus = "custom-new";
    mapping.rememberMatch = true;
  } else if (resolution.type === "match") {
    const selectedCustom = state.customExercises?.find(item=>item.id===resolution.exerciseId&&!item.deletedAt) ||
      (mapping.customRecord?.id===resolution.exerciseId&&!mapping.customRecord.deletedAt ? mapping.customRecord : null);
    const exists = exerciseCatalog[resolution.exerciseId] || selectedCustom;
    if (!exists) throw new Error("Choose an available exercise.");
    mapping.exerciseId = resolution.exerciseId;
    mapping.customRecord = selectedCustom;
    mapping.matchStatus = "manual";
    if (!Object.hasOwn(resolution, 'rememberMatch')) mapping.rememberMatch = true;
  } else if (resolution.type === "ignore") {
    mapping.exerciseId = null;
    mapping.matchStatus = "ignored";
  }
  if(['match','custom'].includes(resolution.type))mapping.remapExisting=true;
  if(['match','custom','ignore'].includes(resolution.type))mapping.optionalReviewed=true;
  if(resolution.type==='custom')mapping.loadKind ||= 'unknown';
  for (const workout of next.workouts)
    for (const exercise of workout.exercises)
      if (belongs(exercise)) Object.assign(exercise, {
        exerciseId: mapping.exerciseId,
        matchStatus: mapping.matchStatus,
        ignored: mapping.ignored,
        rememberMatch: mapping.rememberMatch,
        customRecord: mapping.customRecord,
        loadKind: mapping.loadKind,
        matchProvenance: resolution.type === 'load' ? exercise.matchProvenance : {version:2,tier:mapping.match?.tier||'C',reason:mapping.matchStatus==='manual'?'User selected match':mapping.matchStatus==='custom-new'?'User kept separate':'User ignored',sourceIdentity:normalizeExerciseAlias(mapping.sourceName)},
      });
  mapping.needsLoadKind = false;
  for (const workout of next.workouts) for (const exercise of workout.exercises) if (belongs(exercise)) {
    exercise.needsLoadKind = Boolean(loadReview(exercise));
    mapping.needsLoadKind = exercise.needsLoadKind || mapping.needsLoadKind;
  }
  next.workouts = classifyDuplicates(next.workouts.map(({ fingerprint, duplicate, ...workout }) => workout), state.workouts || []);
  return summarizePreview(next);
}

function materializeExercise(state, exercise) {
  if (exercise.ignored) return null;
  if (!exercise.exerciseId) throw new Error(`${exercise.sourceName} still needs review.`);
  let custom = state.customExercises?.find((item) => item.id === exercise.exerciseId) || exercise.customRecord;
  const catalog = exerciseCatalog[exercise.exerciseId];
  const definition = catalog || (custom ? customExerciseSnapshot(custom, "historical-import") : null);
  if (!definition) throw new Error(`${exercise.sourceName} no longer maps to an available exercise.`);
  return {
    ...exercise,
    importedName: exercise.sourceName,
    originalImportedName: exercise.sourceName,
    importedExercise: catalog ? undefined : definition,
    repMin: null,
    repMax: null,
    targetRir: null,
    restSeconds: null,
    sets: exercise.sets.map(({ seconds, rawImport, ...set }) => ({
      ...set,
      rawImport: { ...rawImport, loadKind: rawImport.loadKind || exercise.loadKind || null },
    })),
  };
}

export function applyHistoricalWorkoutImport(state, preview, { ambiguousAction = null, dateOnlyGroupingConfirmed = false, now = new Date().toISOString() } = {}) {
  // Optional suggestions are never implicitly accepted. The normal Import
  // action materializes their safe source identities when review is skipped.
  preview=structuredClone(preview);
  for(const mapping of preview.exerciseMappings)if(!mapping.exerciseId&&!mapping.ignored&&!mapping.match?.requiresReview){
    mapping.customRecord=importedHistoricalExercise(mapping.source||preview.source,mapping.sourceName,state);
    mapping.exerciseId=mapping.customRecord.id;mapping.matchStatus='custom-auto';mapping.loadKind ||= 'unknown';
    for(const w of preview.workouts)for(const e of w.exercises)if((e.sourceKey||historicalSourceKey(preview.source,e.sourceName))===(mapping.sourceKey||historicalSourceKey(preview.source,mapping.sourceName)))
      Object.assign(e,{exerciseId:mapping.exerciseId,customRecord:mapping.customRecord,matchStatus:'custom-auto',loadKind:mapping.loadKind});
  }
  preview=summarizePreview(preview);
  if (preview.invalidRows?.length) throw new Error('Correct the invalid rows before importing. Nothing has been saved.');
  if (preview.summary.loadDecisions) throw new Error('Review the meaning of imported loads before importing.');
  if (preview.summary.reviewExercises) throw new Error("Review every unmatched exercise before importing.");
  if (preview.summary.groupingDecisions&&!dateOnlyGroupingConfirmed) throw new Error('Confirm date-only session grouping or supply a workout ID/start time. Separate same-day sessions must not be merged.');
  if (preview.summary.ambiguousDuplicates && !["skip", "import"].includes(ambiguousAction))
    throw new Error("Choose how to handle possible duplicates.");
  const next = structuredClone(state);
  const newCustom = new Map();
  for (const mapping of preview.exerciseMappings)
    if (mapping.customRecord) newCustom.set(mapping.customRecord.id, mapping.customRecord);
  for (const record of newCustom.values()) registerCustomExerciseRecord(next, record, now);
  for (const mapping of preview.exerciseMappings)
    if (mapping.rememberMatch && mapping.exerciseId && !mapping.ignored)
      rememberHistoricalExerciseAlias(next, mapping.sourceName, mapping.exerciseId, { builtInCatalog: exerciseCatalog, now, source:mapping.source||preview.source });
  // An explicit mapping correction on re-import changes association only.
  // Existing set objects, local corrections, timestamps and fingerprints stay.
  for(const mapping of preview.exerciseMappings.filter(m=>m.remapExisting&&!m.ignored))for(const w of next.workouts||[]){
    if(w.historicalImport?.source!==(mapping.source||preview.source))continue;
    for(const e of w.exercises||[])if(normalizeExerciseAlias(e.sourceName)===normalizeExerciseAlias(mapping.sourceName)){
      e.exerciseId=mapping.exerciseId;e.matchStatus=mapping.matchStatus;
      e.importedExercise=exerciseCatalog[mapping.exerciseId]?undefined:customExerciseSnapshot(mapping.customRecord||next.customExercises.find(c=>c.id===mapping.exerciseId),'historical-import');
      e.matchProvenance={version:2,reason:'User remapped imported identity',sourceIdentity:normalizeExerciseAlias(mapping.sourceName)};
    }
  }
  const imported = [];
  const occupiedIds = new Set((state.workouts || []).map(w=>w.id));
  for (const workout of preview.workouts) {
    if (workout.duplicate === "exact") continue;
    if (workout.duplicate === "ambiguous" && ambiguousAction === "skip") continue;
    const exercises = workout.exercises.map((exercise) => materializeExercise(next, exercise)).filter(Boolean);
    if (!exercises.length) continue;
    const setCount = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    const baseId = `${workout.id}-${hash(workout.fingerprint)}`;
    let id = baseId, suffix = 1;
    while (occupiedIds.has(id)) id = `${baseId}-${suffix++}`;
    occupiedIds.add(id);
    imported.push({
      ...workout,
      id,
      exercises,
      plannedSetCount: exercises.reduce((n,e)=>n+e.sets.filter(s=>s.planned).length,0),
      completedPlannedSetCount: exercises.reduce((n,e)=>n+e.sets.filter(s=>s.planned).length,0),
      completedSetCount: setCount,
      historicalImport: {
        source: workout.importSource || preview.source,
        sourceLabel: workout.importSourceLabel || preview.sourceLabel,
        importedAt: now,
        importId: preview.id,
        fingerprint: workout.fingerprint,
        sourceIdentity: workout.sourceIdentity,
        version: 2,
        dateOnlyGroupingConfirmed:workout.needsGroupingReview?dateOnlyGroupingConfirmed:undefined,
        partial:exercises.length!==workout.exercises.length,
      },
    });
  }
  next.workouts = [...(next.workouts || []), ...imported].sort(
    (left, right) => new Date(left.completedAt || 0) - new Date(right.completedAt || 0),
  );
  return {
    state: next,
    result: {
      imported: imported.length,
      sets: imported.reduce((total, workout) => total + workout.completedSetCount, 0),
      skippedDuplicates: preview.summary.exactDuplicates + (ambiguousAction === "skip" ? preview.summary.ambiguousDuplicates : 0),
      skippedRows: 0,
      ignoredExercises: preview.summary.ignoredExercises,
    },
  };
}

export function historicalExerciseChoices(state, query = "") {
  const normalized = normalizeExerciseAlias(query);
  const builtIn = Object.values(exerciseCatalog)
    .map((item) => ({ id: item.id, name: item.name, custom: false }));
  const custom = (state.customExercises || [])
    .filter((item) => !item.deletedAt)
    .map((item) => ({ id: item.id, name: item.name, custom: true }));
  return rankExerciseSearch([...builtIn, ...custom]
    .filter((item, index, values) => values.findIndex((value) => value.id === item.id) === index)
    .filter((item) => !normalized || normalizeExerciseAlias(item.name).includes(normalized))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 30), query);
}

export function historicalExerciseLabel(state, exerciseId) {
  const custom = state.customExercises?.find((item) => item.id === exerciseId);
  return custom?.name || (exerciseCatalog[exerciseId] ? exerciseName({ exerciseId }) : "Unmatched");
}
