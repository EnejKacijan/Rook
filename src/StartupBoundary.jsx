import React, {useEffect,useRef,useState} from 'react';

export function StartupRecovery({loading=false,onRetry,restoreError=false}) {
  return <main className="fatal-error-screen startup-recovery" role={loading?'status':'alert'} aria-busy={loading}>
    <p className="eyebrow">ROOK</p>
    <h1>{loading?'Opening your saved data…':restoreError?'ROOK couldn’t safely reopen your data.':'ROOK couldn’t load your data.'}</h1>
    {!loading&&<><p>Your saved data couldn’t be read right now. Nothing has been reset.</p><button className="button primary" onClick={onRetry}>RETRY</button></>}
  </main>;
}

// The domain app (and every autosave effect) exists only after safe hydration.
export function StartupBoundary({load,children}) {
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
  if(!['ready','empty'].includes(startup.status))return <StartupRecovery loading={startup.status==='loading'} onRetry={()=>{setStartup({status:'loading'});setAttempt(n=>n+1);}}/>;
  return children(startup);
}
