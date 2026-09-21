import React, {useEffect,useRef,useState} from 'react';
import { hydrateStoredState } from './domain.js';
import { restoreLocalCheckpoint, deleteLocalState, storageDiagnostics, inspectStorageProtection } from './localStateStorage.js';
import { clearAllWorkoutMedia } from './workoutPhotos.js';
import './startupRecovery.css';

export function StorageDiagnosticView() {
  const [value,setValue]=useState(()=>storageDiagnostics());
  const inspect=async()=>{await inspectStorageProtection();setValue(storageDiagnostics());};
  return <details className="storage-diagnostics" onToggle={event=>{if(event.currentTarget.open)inspect();}}>
    <summary>Local storage diagnostics</summary>
    <p>Technical status only. No workout contents or messages. Nothing is uploaded.</p>
    <pre tabIndex="0">{JSON.stringify(value,null,2)}</pre>
    <p>Local copies can be lost with device or browser data. Keep a ROOK backup file somewhere safe.</p>
  </details>;
}

export function StartupRecovery({loading=false,onRetry,restoreError=false,startup={},renderImport}) {
  const [action,setAction]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const missing=startup.code==='primary-missing';
  const perform=async()=>{
    setBusy(true);setError('');
    try {
      if(action==='restore')restoreLocalCheckpoint(globalThis.localStorage,hydrateStoredState);
      else await deleteLocalState({clearPhotos:clearAllWorkoutMedia,reason:'start-over:user-confirmed'});
      setAction(null);onRetry();
    } catch { setError(action==='restore'?'The backup could not be restored. Its recovery copy is still available. Try again.':'Deletion did not finish. Some data may already have been removed. Try again to finish, or import a backup.'); }
    finally {setBusy(false);}
  };
  if(action==='import'&&renderImport)return renderImport({close:()=>setAction(null),onRestored:()=>{setAction(null);onRetry();}});
  return <main className="fatal-error-screen startup-recovery" role={loading?'status':'alert'} aria-busy={loading}>
    <p className="eyebrow">ROOK</p>
    <h1>{loading?'Opening your saved data…':missing&&!startup.recovery?'Your local ROOK data is no longer available.':restoreError?'ROOK couldn’t safely reopen your data.':'ROOK couldn’t load your local data.'}</h1>
    {!loading&&<>
      <p>{startup.code==='delete-incomplete'?'Your requested deletion did not finish. Retry Start over to finish deleting, or import a backup.':startup.code==='restore-error'?'An interrupted restore could not be safely reopened. Retry before importing a backup or starting over.':missing?'ROOK was previously used here, but its main saved state is missing.':"Your saved data couldn’t be read safely. ROOK has not replaced it."}</p>
      {startup.recovery&&<p>We found a local backup from {new Date(startup.recovery.createdAt).toLocaleString()}. It may not include your latest changes. Workout photos are stored separately.</p>}
      {action==='restore'||action==='delete'?<section className="startup-confirm" aria-label="Confirm recovery action">
        <h2>{action==='restore'?'Restore this local backup?':'Start over?'}</h2>
        <p>{action==='restore'?'This replaces the main saved state with this backup. The recovery copy is kept.':'This deletes remaining local ROOK data, including recovery copies and photos. Import a backup instead if you have one.'}</p>
        <button disabled={busy} className="button primary" onClick={perform}>{busy?'PLEASE WAIT…':action==='restore'?'RESTORE LOCAL BACKUP':'DELETE DATA & START OVER'}</button>
        <button disabled={busy} className="button quiet" onClick={()=>setAction(null)}>CANCEL</button>
      </section>:<div className="startup-recovery-actions">
        <button className="button primary" onClick={onRetry}>TRY AGAIN</button>
        {startup.recovery&&<button className="button secondary" onClick={()=>setAction('restore')}>RESTORE LOCAL BACKUP</button>}
        {renderImport&&<button className="button secondary" onClick={()=>setAction('import')}>IMPORT BACKUP</button>}
        <button className="button quiet" onClick={()=>setAction('delete')}>START OVER</button>
      </div>}
      {error&&<p role="alert">{error}</p>}
      <StorageDiagnosticView/>
    </>}
  </main>;
}

// The domain app (and every autosave effect) exists only after safe hydration.
export function StartupBoundary({load,children,renderImport}) {
  const [startup,setStartup]=useState({status:'loading'});
  const [attempt,setAttempt]=useState(0);
  const request=useRef(0);
  useEffect(()=>{
    const id=++request.current;
    Promise.resolve().then(()=>id===request.current?load():undefined).then(result=>{
      if(id===request.current)setStartup(result);
    },error=>{if(id===request.current)setStartup({status:'error',error});});
    return()=>{request.current++;};
  },[load,attempt]);
  if(!['ready','empty'].includes(startup.status))return <StartupRecovery startup={startup} renderImport={renderImport} loading={startup.status==='loading'} onRetry={()=>{setStartup({status:'loading'});setAttempt(n=>n+1);}}/>;
  return children(startup);
}
