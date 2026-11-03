import {useEffect,useRef,useState} from 'react';
import {NavigationChevron} from './NavigationChevron.jsx';
import {LegalLink} from './LegalLinks.jsx';
import {privacyPreferences,savePrivacyPreference,PRIVACY_CHANGED} from './privacyPreferences.js';
import {legalOperator,operatorDetailsReady} from './legalOperator.js';
import {legalDraft} from './legalDocuments.js';
import {focusNavigationTarget} from './navigationFocus.js';

export function PrivacyLegal({Switch,setDetail,onDelete}) {
  const aiTitle=useRef(null);
  const [preferences,setPreferences]=useState(privacyPreferences),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{const refresh=()=>setPreferences(privacyPreferences());globalThis.addEventListener(PRIVACY_CHANGED,refresh);return()=>globalThis.removeEventListener(PRIVACY_CHANGED,refresh);},[]);
  const change=(key,enabled)=>{try{savePrivacyPreference(key,enabled);setPreferences(privacyPreferences());setError('');setMessage(key==='ai'?'AI sharing is off. Requests already sent cannot be recalled.':enabled?'Local usage diagnostics are on.':'Usage diagnostics are off and their local history has been cleared.');if(key==='ai'&&!enabled)focusNavigationTarget(aiTitle.current);}catch{setError('Could not save your privacy choice.');}};
  const requestHref=operatorDetailsReady?`mailto:${legalOperator.contactEmail}?subject=${encodeURIComponent('ROOK data deletion request')}&body=${encodeURIComponent('Please delete my ROOK account and associated cloud data.\n\nAccount sign-in email: [enter your account email]\n\nPlease confirm receipt and explain any data you must retain.\n\nI have not included a password, workout export or photos.')}`:null;
  return <section className="privacy-legal" aria-label="Privacy and legal">
    <h1 className="visually-hidden">Privacy &amp; legal</h1>
    <h2>Privacy choices</h2>
    <Switch label="Local usage diagnostics" help="Optional. Records limited feature-use events on this device; no remote analytics provider." checked={preferences.analytics} onChange={value=>change('analytics',value)}/>
    <div className="privacy-ai-choice"><h3 ref={aiTitle} tabIndex={-1}>AI data sharing</h3><p>{preferences.ai?'Allowed for your requests.':'Off. ROOK asks before sending training context to OpenAI.'}</p>{preferences.ai&&<button type="button" className="button secondary" onClick={()=>change('ai',false)}>TURN OFF AI SHARING</button>}</div>
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    <h2>Policies</h2>
    {legalDraft&&<p className="legal-draft-note">Draft notices. Operator details and the release review must be completed before publication.</p>}
    <nav className="profile-settings-list" aria-label="Policies">{[['privacy','Privacy policy'],['terms','Terms of service'],['cookies','Cookies & storage'],['refunds','Payments & refunds'],['operator','Operator & contact'],['licenses','Licenses & credits']].map(([id,title])=><LegalLink key={id} document={id} className="list-row"><strong>{title}</strong><NavigationChevron/></LegalLink>)}</nav>
    <h2>Your data</h2>
    <div className="profile-settings-list">
      <button type="button" className="list-row" onClick={()=>setDetail('backup-rook')}><strong>Export a ROOK backup</strong><NavigationChevron/></button>
      <LegalLink document="data-rights" className="list-row"><strong>Data access &amp; deletion</strong><NavigationChevron/></LegalLink>
      {requestHref?<a className="list-row" href={requestHref}><span><strong>Request cloud data deletion</strong><small>Opens an email draft for you to send</small></span><NavigationChevron/></a>:<p className="legal-contact-pending">Cloud deletion requests need the operator’s verified contact address. This is a release requirement still to complete.</p>}
      <button type="button" className="list-row" onClick={onDelete}><span><strong className="danger-text">Delete local data</strong><small>Review before erasing this device. Cloud data is separate.</small></span><NavigationChevron/></button>
    </div>
  </section>;
}
