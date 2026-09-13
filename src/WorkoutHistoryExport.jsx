import { useRef, useState, useEffect } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { completedExportWorkouts, createWorkoutHistoryExport, presentHistoryExport } from './workoutHistoryExport.js';
import './workoutHistoryExport.css';

export function WorkoutHistoryExport({state,close,SheetHeader,Button}) {
  const [format,setFormat]=useState('csv'),[notes,setNotes]=useState(false),[busy,setBusy]=useState(false),[file,setFile]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const mounted=useRef(true),lock=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const count=completedExportWorkouts(state).length;
  const reset=()=>{setFile(null);setMessage('');setError(false);};
  const handoff=async prepared=>{
    const result=await presentHistoryExport(prepared);
    if(mounted.current)setMessage(result==='cancelled'?'Sharing cancelled. Your file is ready to try again.':result==='shared'?'File handed to your device’s share service.':'Download requested. Check your device’s downloads.');
  };
  const run=async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError(false);setMessage('');
    try {
      const prepared=file || await createWorkoutHistoryExport(state,{format,includeNotes:notes});
      if(!mounted.current)return;
      setFile(prepared);
      // A separate user gesture preserves Web Share activation even for large exports.
      if(file)await handoff(prepared);else setMessage('File ready. Share or download it below.');
    }catch{if(mounted.current){setError(true);setMessage('Couldn’t prepare or hand off this file. Please try again.');}}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  return <main className="screen detail-screen history-export-screen">
    <SheetHeader title="Export workout history" onClose={close}/>
    <h1>Your training history.</h1>
    <p>Generated on this device. CSV or JSON for your own records — not a recovery backup.</p>
    <p className="history-export-count">{count} completed {count===1?'workout':'workouts'}</p>
    <fieldset disabled={busy}><legend>FORMAT</legend><div className="history-export-formats" role="radiogroup" aria-label="Format" onKeyDown={event=>{if(!busy&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setFormat(format==='csv'?'json':'csv');reset();event.currentTarget.querySelector(format==='csv'?'button:last-child':'button:first-child')?.focus();}}}>{['csv','json'].map(value=><button key={value} role="radio" tabIndex={format===value?0:-1} aria-checked={format===value} className={format===value?'is-selected':''} onClick={()=>{setFormat(value);reset();}}>{value.toUpperCase()}</button>)}</div></fieldset>
    <label className="history-export-notes"><span><strong>Include notes</strong><small>{notes?'Session and exercise notes will be included.':'Session and exercise notes are excluded.'}</small></span><input type="checkbox" checked={notes} disabled={busy} onChange={e=>{setNotes(e.target.checked);reset();}}/></label>
    <p className="history-export-explanation">Weights use stored kg values. Photos are not included. Nothing is uploaded by ROOK.</p>
    {!!(state.weightCheckins?.length||state.importedMeasurementSources?.length)&&<p>{format==='json'?'JSON also includes body-weight check-ins and preserved measurement-source records.':'CSV contains workout sets only. Choose JSON to include body-weight check-ins and preserved measurement-source records.'}</p>}
    {!count&&<p>No completed workouts yet. {format==='json'&&(state.weightCheckins?.length||state.importedMeasurementSources?.length)?'Your measurement data can still be exported.':'The workout list will be empty.'}</p>}
    <div aria-live="polite" className="history-export-status">{busy?<p><span className="restriction-spinner" aria-hidden="true"/> {file?'Opening share / download…':'Preparing your file…'}</p>:message&&<p role={error?'alert':undefined}>{message}</p>}</div>
    <SheetActionFooter><Button disabled={busy} onClick={run}>{busy?(file?'OPENING…':'PREPARING…'):file?'SHARE / DOWNLOAD':'PREPARE EXPORT'}</Button></SheetActionFooter>
  </main>;
}
