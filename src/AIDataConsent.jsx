import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {bindAiConsentPresenter,savePrivacyPreference} from './privacyPreferences.js';
import {LegalLink} from './LegalLinks.jsx';

export function AIDataConsent({children,Modal,Header}) {
  const [open,setOpen]=useState(false),[agreed,setAgreed]=useState(false),[error,setError]=useState('');
  const waiters=useRef(new Set()),trigger=useRef(null),background=useRef(null),accepted=useRef(false);
  const settle=accepted=>{for(const done of waiters.current)done(accepted);waiters.current.clear();setOpen(false);setAgreed(false);setError('');};
  useLayoutEffect(()=>{
    const unbind=bindAiConsentPresenter(({signal}={})=>new Promise(resolve=>{
      if(!waiters.current.size){accepted.current=false;trigger.current=document.activeElement;setAgreed(false);setError('');setOpen(true);}
      const done=value=>{signal?.removeEventListener('abort',abort);resolve(value);};
      const abort=()=>{waiters.current.delete(done);done(false);if(!waiters.current.size)setOpen(false);};
      waiters.current.add(done);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    }));
    return()=>{unbind();for(const done of waiters.current)done(false);waiters.current.clear();};
  },[]);
  return <><div ref={background} className="privacy-consent-host">{children}</div>{open&&createPortal(<Modal close={()=>settle(accepted.current)} backgroundRef={background} returnFocusRef={trigger}>{close=><section className="screen detail-screen ai-consent-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
    <Header title="AI data sharing" onClose={close}/><h1 id="ai-consent-title">Use AI with your training data?</h1>
    <p>ROOK sends the information needed for your request through its server to OpenAI: your message or imported notes, training preferences, relevant workout history and restrictions. Restrictions or messages may include health information.</p>
    <p>Photos are sent only when you separately choose and review them. AI can be wrong and does not replace medical advice.</p>
    <p>OpenAI response storage is disabled. Processing and safety retention still apply; this does not mean immediate deletion. <LegalLink document="privacy">Read the privacy policy</LegalLink>.</p>
    <label className="privacy-consent-choice"><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)}/><span>I explicitly consent to this AI processing, including any health information I choose to provide.</span></label>
    <p className="privacy-consent-hint">Optional. You can withdraw in Profile → Privacy &amp; legal. Local workout logging stays available.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="sheet-footer"><button type="button" className="button secondary" onClick={close}>KEEP AI OFF</button><button type="button" className="button primary" disabled={!agreed} onClick={()=>{try{savePrivacyPreference('ai',true);accepted.current=true;close();}catch{setError('Could not save your choice. No training data was sent.');}}}>ALLOW AI PROCESSING</button></div>
  </section>}</Modal>,document.body)}</>;
}
