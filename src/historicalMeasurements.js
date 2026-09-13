import { cleanHistoryCell as clean, missingHistoryCell as absent, historyHeader, historyDate, historyNumber, headerUnit, historicalUnit } from './historyImportTable.js';
import { hashCanonicalImportData, HistoryImportHashError } from './historyImportHash.js';

const sites = ['neck','shoulder','chest','left_bicep','right_bicep','left_forearm','right_forearm','abdomen','waist','hips','left_thigh','right_thigh','left_calf','right_calf'];
export const MEASUREMENT_COLUMNS = {
  date: ['Measurement date', ['date','measurement_date','recorded_at']],
  weight: ['Body weight', ['weight','body_weight','weight_kg','weight_lb','weight_lbs','body_weight_kg']],
  weightUnit: ['Body weight unit', ['weight_unit','unit']],
  fat_percent: ['Body fat (%) · source only', ['fat_percent','body_fat_percent','body_fat_percentage']],
  ...Object.fromEntries(sites.map(site => [site, [site.replaceAll('_',' ')+' · source only', [site,site+'_cm',site+'_in']]])),
};
export function isHevyMeasurementTable(table) {
  const keys = new Set((table.rows[0] || []).map(historyHeader));
  return keys.has('date') && keys.has('fat_percent') && ['weight_kg','weight_lbs'].some(k=>keys.has(k)) &&
    ['cm','in'].some(unit => ['neck','waist','left_bicep','right_bicep'].every(site=>keys.has(site+'_'+unit))) && !keys.has('exercise_title');
}
export function inspectMeasurementTable(table, options = {}) {
  const headers = (table.rows[0] || []).map(clean), keys = headers.map(historyHeader);
  if (!headers.length || new Set(keys).size !== keys.length) throw new Error('Measurement column headers must be distinct.');
  const automatic = Object.fromEntries(Object.entries(MEASUREMENT_COLUMNS).map(([key,[,aliases]])=>{
    const hits = keys.flatMap((h,i)=>aliases.includes(h)?[i]:[]);
    return [key, hits.length === 1 ? hits[0] : null];
  }));
  const mapping = {...automatic,...options.mapping}, used = Object.values(mapping).filter(i=>i!=null);
  if (new Set(used).size !== used.length || used.some(i=>!Number.isInteger(i)||i<0||i>=headers.length)) throw new Error('Map each column to one measurement field.');
  const has = field => mapping[field]!=null && table.rows.slice(1).some(row=>!absent(row[mapping[field]]));
  const needsWeightUnit = has('weight') && !headerUnit(headers[mapping.weight]) && !historicalUnit(options.weightUnit) &&
    table.rows.slice(1).some(row=>!absent(row[mapping.weight]) && absent(row[mapping.weightUnit]) && !/(kg|lbs?)\s*$/i.test(clean(row[mapping.weight])));
  const needsLengthUnit = sites.some(site=>has(site) && !/_(cm|in)$/.test(keys[mapping[site]])) && !['cm','in'].includes(options.lengthUnit);
  const ambiguous = Object.entries(MEASUREMENT_COLUMNS).some(([key,[,aliases]])=>!Object.hasOwn(options.mapping||{},key)&&keys.filter(k=>aliases.includes(k)).length>1);
  const hevy = isHevyMeasurementTable(table);
  return {category:'measurements', source:hevy?'hevy':'generic', detection:{kind:hevy?'hevy_measurements':'generic_measurements'}, headers,mapping,
    rowCount:Math.max(0,table.rows.length-1), needsMapping:ambiguous||mapping.date==null||!Object.keys(mapping).some(k=>!['date','weightUnit'].includes(k)&&has(k)),
    needsWeightUnit,needsLengthUnit,needsDistanceUnit:false,unmappedColumns:headers.filter((_,i)=>!used.includes(i))};
}
const stableValue = value => value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stableValue(v)])):value;
const stable = value => JSON.stringify(stableValue(value));
export async function parseMeasurementTable(table, options = {}) {
  const info = inspectMeasurementTable(table, options);
  if(info.needsMapping) throw new Error('Map the measurement date and recorded values.');
  if(info.needsWeightUnit || info.needsLengthUnit) throw new Error('Confirm the missing measurement units.');
  const records=[],invalidRows=[];
  for(const [index,row] of table.rows.slice(1).entries()) {
    const line=table.lines?.[index+1]||index+2;
    try {
      if(row.length>info.headers.length&&row.slice(info.headers.length).some(v=>!absent(v)))throw new Error('More measurement values than headers.');
      const get=field=>info.mapping[field]==null ? null : row[info.mapping[field]];
      const date=historyDate(get('date'),options.dateFormat);
      if(!date)throw new Error('Measurement date is missing.');
      const rawWeight=get('weight'), explicit=clean(rawWeight).match(/^(.*?)\s*(kg|lbs?)$/i);
      const weight=historyNumber(explicit?explicit[1]:rawWeight,'Body weight');
      let weightUnit=null,weightKg=null;
      if(weight!=null) {
        const cellUnit=absent(get('weightUnit'))?null:historicalUnit(get('weightUnit'));
        if(!absent(get('weightUnit'))&&!cellUnit)throw new Error('Unknown body weight unit.');
        const units=[explicit&&historicalUnit(explicit[2]),cellUnit,headerUnit(info.headers[info.mapping.weight])].filter(Boolean);
        if(new Set(units).size>1)throw new Error('Conflicting body weight units.');
        weightUnit=units[0]||historicalUnit(options.weightUnit);
        if(!weightUnit)throw new Error('Body weight unit is missing.');
        weightKg=weightUnit==='lb'?weight/2.2046226218:weight;
        if(weightKg<10||weightKg>700)throw new Error('Body weight is outside the supported check-in range (10–700 kg).');
      }
      const values={weight:{value:weight,unit:weightUnit},fat_percent:{value:historyNumber(get('fat_percent'),'Body fat',{max:100}),unit:'%'}};
      for(const site of sites) {
        const value=historyNumber(get(site),site);
        const unit=historyHeader(info.headers[info.mapping[site]]).match(/_(cm|in)$/)?.[1]||options.lengthUnit||null;
        if(value!=null&&!unit)throw new Error(`Confirm ${site} unit.`);
        values[site]={value,unit};
      }
      if(!Object.values(values).some(v=>v.value!=null))throw new Error('No recorded measurement values.');
      const sourceValues=Object.fromEntries(info.headers.map((header,i)=>[header,row[i]??null]));
      // No filename or row position in identity. Retain original nulls/cells and
      // bilateral fields; this is provenance, not another analytics model.
      const fingerprint=await hashCanonicalImportData(stable({source:info.source,date:date.value,values,sourceValues}));
      records.push({id:'measurement-source-'+fingerprint,version:1,source:info.source,sourceDate:date,localDate:date.day,weightKg,values,sourceValues,sourceRow:line,fingerprint});
    }catch(error){
      // Runtime verification failure is not a bad source row that may be skipped.
      if(error instanceof HistoryImportHashError)throw error;
      invalidRows.push({line,reason:`Measurement row ${line}: ${error.message}`});
    }
  }
  return {info,records,invalidRows};
}
export function reviewMeasurementRecords(records, state) {
  const seen=new Set((state.importedMeasurementSources||[]).map(r=>r.fingerprint));
  const weights=new Map((state.weightCheckins||[]).map(e=>[e.localDate,e.weightKg]));
  return records.map(record=>{
    const duplicate=seen.has(record.fingerprint);
    seen.add(record.fingerprint);
    const conflict=!duplicate&&record.weightKg!=null&&weights.has(record.localDate)&&Math.abs(weights.get(record.localDate)-record.weightKg)>0.0001;
    if(record.weightKg!=null&&!weights.has(record.localDate))weights.set(record.localDate,record.weightKg);
    return {...record,duplicate,conflict};
  });
}
export function applyMeasurementRecords(state, records, {keepExistingMeasurements=false,now=new Date().toISOString()}={}) {
  const reviewed=reviewMeasurementRecords(records,state);
  if(reviewed.some(r=>r.conflict)&&!keepExistingMeasurements)throw new Error('Review conflicting measurements. Existing check-ins will not be overwritten.');
  const next=structuredClone(state), weights=new Map((next.weightCheckins||[]).map(e=>[e.localDate,e]));
  const added=[];let mappedWeights=0;
  for(const {duplicate,conflict,...record} of reviewed) {
    if(duplicate)continue;
    if(record.weightKg!=null&&!weights.has(record.localDate)) {
      weights.set(record.localDate,{id:record.id,localDate:record.localDate,weightKg:record.weightKg,createdAt:now,updatedAt:now,importSourceId:record.id});
      mappedWeights++;
    }
    added.push({...record,importedAt:now,weightCheckinId:weights.get(record.localDate)?.id||null,weightProjection:conflict?'kept-existing':record.weightKg==null?'absent':'mapped'});
  }
  next.weightCheckins=[...weights.values()].sort((a,b)=>a.localDate.localeCompare(b.localDate));
  if(added.length)next.importedMeasurementSources=[...(next.importedMeasurementSources||[]),...added];
  return {state:next,result:{measurements:added.length,mappedWeights,measurementDuplicates:reviewed.filter(r=>r.duplicate).length,measurementConflicts:reviewed.filter(r=>r.conflict).length}};
}
