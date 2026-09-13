import { cleanHistoryCell as clean, missingHistoryCell as absent, historyHeader, historyColumnMapping, detectHistoricalImportSource, historyNumber, historyDate, historyDuration, historicalUnit, headerUnit, HISTORY_COLUMNS } from './historyImportTable.js';

export const HISTORY_SOURCE_LABELS = { hevy:'Hevy', strong:'Strong', generic:'Generic CSV / XLSX' };

export function inspectHistoryTable(table, { source, mapping: selectedMapping, weightUnit, distanceUnit } = {}) {
  const headers = table.rows[0]?.map(clean) || [];
  if (!headers.length) throw new Error('File contains no workout rows.');
  const keys = headers.map(historyHeader);
  if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) throw new Error('Duplicate column headers need distinct names before importing.');
  const detection = detectHistoricalImportSource(headers, table.format), detected = detection.source;
  // A selected brand is a hint, never permission to reinterpret another schema.
  if (source && source !== 'generic' && detected !== source) throw new Error(`This doesn’t match the current ${HISTORY_SOURCE_LABELS[source]} workout export. Detected ${HISTORY_SOURCE_LABELS[detected]}; choose that source or map the columns.`);
  const adapter = detected === 'generic' ? 'generic' : detected;
  const automatic = historyColumnMapping(headers, adapter);
  const mapping = selectedMapping ? { ...automatic, ...selectedMapping } : automatic;
  const used = Object.values(mapping).filter(i=>i!=null);
  if (used.some(i=>!Number.isInteger(i)||i<0||i>=headers.length) || new Set(used).size!==used.length) throw new Error('Map each source column to only one history field.');
  const data = table.rows.slice(1);
  const has = field => mapping[field]!=null && data.some(r=>!absent(r[mapping[field]]));
  const needsWeightUnit = has('weight') && !headerUnit(headers[mapping.weight]) && data.some(r => !absent(r[mapping.weight]) && !/(?:kg|lbs?)\s*$/i.test(clean(r[mapping.weight])) && absent(r[mapping.unit])) && !historicalUnit(weightUnit);
  const needsDistanceUnit = has('distance') && !headerUnit(headers[mapping.distance],true) && data.some(r=>!absent(r[mapping.distance])&&!/(?:km|mi|miles?|m|ft|feet)\s*$/i.test(clean(r[mapping.distance]))&&absent(r[mapping.distanceUnit]))&&!historicalUnit(distanceUnit,true);
  const ambiguousColumns = Object.entries(HISTORY_COLUMNS).filter(([field,[,aliases]])=>!Object.hasOwn(selectedMapping||{},field)&&keys.filter(k=>aliases.includes(k)).length>1).map(([field])=>field);
  const needsMapping = ambiguousColumns.length>0 || mapping.started==null || mapping.exerciseName==null || (!has('reps')&&!has('seconds')&&!has('distance')&&!has('weight'));
  return { headers, detection, source:adapter, mapping, ambiguousColumns, needsMapping, needsWeightUnit, needsDistanceUnit, rowCount:data.length,
    unmappedColumns:headers.filter((_,i)=>!used.includes(i)) };
}

function quantity(raw, rawUnit, column, selected, label, distance=false) {
  if(absent(raw))return { value:null, unit:null, unitSource:null };
  const explicit=clean(raw).match(/^(.*?)\s*(kg|lbs?|km|mi|miles?|m|ft|feet)$/i);
  const value=historyNumber(explicit ? explicit[1] : raw,label);
  const cellUnit=absent(rawUnit) ? null : historicalUnit(rawUnit,distance);
  if(!absent(rawUnit)&&!cellUnit)throw new Error(`${label} unit is unknown.`);
  const valueUnit=explicit ? historicalUnit(explicit[2],distance) : null, colUnit=headerUnit(column,distance);
  const units=[valueUnit,cellUnit,colUnit].filter(Boolean);
  if(new Set(units).size>1)throw new Error(`${label} has conflicting explicit units.`);
  const unit=valueUnit||cellUnit||colUnit||historicalUnit(selected,distance);
  if(!unit)throw new Error(`${label} unit needs confirmation.`);
  return { value,unit,unitSource:valueUnit?'value':cellUnit?'cell':colUnit?'column':'user-selected' };
}

function readMappedRow(row, table, info, options, index) {
  const get=field=>info.mapping[field]==null ? '' : row[info.mapping[field]];
  const number=(field,label=field,limits)=>historyNumber(get(field),label,limits);
  const started=historyDate(get('started'),options.dateFormat),ended=historyDate(get('ended'),options.dateFormat);
  if(!started)throw new Error('Workout date is missing.');
  if(ended&&ended.sortable<started.sortable)throw new Error('Workout end precedes its start.');
  const name=clean(get('exerciseName'));if(!name)throw new Error('Exercise name is missing.');
  const weight=quantity(get('weight'),get('unit'),info.headers[info.mapping.weight],options.weightUnit||options.strongUnit,'Weight');
  const distance=quantity(get('distance'),get('distanceUnit'),info.headers[info.mapping.distance],options.distanceUnit,'Distance',true);
  const reps=number('reps','Reps',{integer:true}),seconds=number('seconds','Set duration'),duration=historyDuration(get('duration'));
  if(reps==null&&seconds==null&&distance.value==null&&weight.value==null)throw new Error('No performed reps, duration, distance or load in this set row.');
  const marked=info.source==='strong' && clean(get('setOrder')).match(/^([WDF])(?:\s*(\d+))?$/i);
  const setOrder=marked ? (marked[2]==null?null:Number(marked[2])) : number('setOrder','Set order',{integer:true});
  const explicitType=absent(get('setType'))?'':clean(get('setType'));
  const setType=explicitType || (marked ? ({W:'warmup',D:'dropset',F:'failure'})[marked[1].toUpperCase()] : info.source==='strong'&&setOrder!=null ? 'normal' : null);
  const group=absent(get('supersetId'))?null:clean(get('supersetId'));
  const loadKind=clean(get('loadKind')).toLowerCase()==='none'?'none':absent(get('loadKind'))?null:clean(get('loadKind')).toLowerCase();
  if(loadKind&&!['external','added','assisted','bodyweight','none','unknown'].includes(loadKind))throw new Error('Load meaning needs review (external, added, assisted, bodyweight, none or unknown).');
  return {
    line:table.lines?.[index+1]||index+2, sourceIndex:index, source:info.source,
    started,ended,duration,workoutId:clean(get('workoutId'))||null,
    workoutName:clean(get('workoutName'))||null,workoutNotes:clean(get('workoutNotes'))||null,
    exerciseName:name,exerciseBlockId:clean(get('exerciseId'))||null,exerciseOrder:number('exerciseOrder','Exercise order',{integer:true}),
    setOrder,setType,weight:weight.value,unit:weight.unit,rawUnit:weight.unitSource,
    reps,seconds,distance:distance.value,distanceUnit:distance.unit,rpe:number('rpe','RPE',{max:10}),rir:number('rir','RIR',{max:10}),
    notes:clean(get('notes'))||null,supersetId:group,loadKind,
    sourceCells:row,
    sourceValues:Object.fromEntries(info.headers.map((header,i)=>[header,row[i]??null])),
  };
}

// Source-specific rules are bounded here; shared validation never supplies plan defaults.
export const HISTORY_ADAPTERS = {
  hevy: readMappedRow,
  strong: readMappedRow,
  generic: readMappedRow,
};

export function readHistoryRows(table, info, options={}) {
  const parsedRows=[],invalidRows=[];
  for(const [index,row]of table.rows.slice(1).entries()){
    try{
      if(row.length>info.headers.length&&row.slice(info.headers.length).some(v=>!absent(v)))throw new Error('More values than headers; check the delimiter or quote decimal commas.');
      parsedRows.push(HISTORY_ADAPTERS[info.source](row,table,info,options,index));
    }catch(error){const line=table.lines?.[index+1]||index+2;invalidRows.push({line,reason:`Row ${line}: ${error.message}`,raw:row});}
  }
  return {parsedRows,invalidRows};
}
