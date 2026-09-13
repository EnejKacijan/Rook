import React from 'react';
import { HISTORY_COLUMNS } from './historyImportTable.js';
import { MEASUREMENT_COLUMNS, inspectMeasurementTable } from './historicalMeasurements.js';
import './historyImportSetup.css';

export default function HistoryImportSetup({info,options,onChange,sheets,sheetIndex,onSheet,sample=[]}) {
  const measurement=info.category==='measurements'||options.category==='measurements';
  const columns=measurement?MEASUREMENT_COLUMNS:HISTORY_COLUMNS;
  const mapping=options.mapping||(measurement&&info.category!=='measurements'?inspectMeasurementTable({rows:[info.headers,...sample]}).mapping:info.mapping);
  return <section className="history-import-setup">
    <p>Detected: <strong>{info.detection.kind.replaceAll('_',' ')}</strong> · {info.rowCount.toLocaleString()} {info.rowCount===1?'row':'rows'}. Nothing is saved yet.</p>
    {info.source==='generic'&&<label>Data category<select value={options.category||info.category||'workouts'} onChange={e=>onChange({...options,category:e.target.value,mapping:undefined})}><option value="workouts">Workout sets</option><option value="measurements">Body measurements</option></select></label>}
    {sheets.length>1&&<label>Worksheet<select value={sheetIndex} onChange={e=>onSheet(Number(e.target.value))}>{sheets.map((s,i)=><option key={i} value={i}>{s.name} ({s.rowCount} rows)</option>)}</select><small>Import one worksheet at a time. Other worksheets are not silently merged.</small></label>}
    <label>Dates<select value={options.dateFormat||'iso'} onChange={e=>onChange({...options,dateFormat:e.target.value})}><option value="iso">ISO / Hevy named month</option><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></select></label>
    <label>Weight unit when absent from file<select value={options.weightUnit||''} onChange={e=>onChange({...options,weightUnit:e.target.value||null})}><option value="">Not specified — do not assume</option><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>
    {measurement?<label>Circumference unit when absent from file<select value={options.lengthUnit||''} onChange={e=>onChange({...options,lengthUnit:e.target.value||null})}><option value="">Not specified — do not assume</option><option value="cm">cm</option><option value="in">in</option></select></label>:<label>Distance unit when absent from file<select value={options.distanceUnit||''} onChange={e=>onChange({...options,distanceUnit:e.target.value||null})}><option value="">Not specified — do not assume</option>{['m','km','mi','ft'].map(u=><option key={u} value={u}>{u}</option>)}</select></label>}
    <p>Explicit units in a value, unit column or header take precedence. RPE is not RIR.</p>
    <details open={info.needsMapping || undefined}><summary>Review column mapping</summary>
      <p>{measurement?'One measurement entry per row. Only body weight is used in current ROOK check-ins.':'One performed set per row.'} Map only fields your file actually contains. Unmapped columns stay in source metadata.</p>
      {Object.entries(columns).map(([field,[label]])=><label key={field}>{label}<select aria-label={`Column: ${label}`} value={mapping[field]??''} onChange={e=>onChange({...options,mapping:{...mapping,[field]:e.target.value===''?null:Number(e.target.value)}})}><option value="">Not provided / preserve as metadata</option>{info.headers.map((h,i)=><option key={i} value={i}>{h||`Column ${i+1}`}</option>)}</select></label>)}
    </details>
    <details><summary>Source sample (first 3 rows)</summary><div className="history-import-sample"><table><thead><tr>{info.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{sample.map((r,i)=><tr key={i}>{info.headers.map((_,j)=><td key={j}>{r[j] instanceof Date?r[j].toISOString().replace(/Z$/,''):String(r[j]??'')}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
