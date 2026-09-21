import React, {useEffect, useState} from 'react';
import {storageDiagnostics, inspectStorageProtection} from './localStateStorage.js';

export function diagnosticTime(value, now = new Date()) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const day = date.toDateString() === now.toDateString() ? 'Today'
    : date.toDateString() === yesterday.toDateString() ? 'Yesterday'
    : date.toLocaleDateString('en-US', {month:'short', day:'numeric', ...(date.getFullYear() !== now.getFullYear() && {year:'numeric'})});
  return `${day}, ${date.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', hour12:false})}`;
}

const startupLabels = {
  ready:'Ready', empty:'No saved data', 'recovery-used':'Recovered',
  'explicitly-deleted':'Local data deleted', 'primary-missing':'Local data missing',
  'parse-error':'Needs attention', 'schema-error':'Needs attention',
  'migration-error':'Needs attention', 'restore-error':'Needs attention', 'delete-incomplete':'Needs attention',
};
const protectionLabels = {
  granted:'Enabled', 'not-granted':'Not enabled', unsupported:'Not available',
  unavailable:'Not available', requested:'Requested',
};

/** Presentation only; diagnostics remain the existing privacy-safe whitelist. */
export function StorageDiagnostics() {
  const [value, setValue] = useState(() => storageDiagnostics());
  const [technical, setTechnical] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    let active = true;
    // Inspect only. Viewing this screen never requests persistent storage.
    inspectStorageProtection().then(() => { if (active) setValue(storageDiagnostics()); });
    return () => { active = false; };
  }, []);
  const copy = async () => {
    setCopying(true); setFeedback('');
    const snapshot = storageDiagnostics(); setValue(snapshot);
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setFeedback('Diagnostics copied.');
    } catch {
      setTechnical(true);
      setFeedback('Couldn’t copy. Select and copy the technical details below.');
    } finally { setCopying(false); }
  };
  const rows = [
    ['LOCAL DATA', value.primaryChars == null ? 'Not available' : value.primaryChars > 0 ? 'Available' : 'Not found'],
    ['LAST SAVED', diagnosticTime(value.lastSuccessfulWriteAt)],
    ['LAST LOADED', diagnosticTime(value.lastSuccessfulReadAt)],
    ['STARTUP STATUS', startupLabels[value.startupOutcome] || (value.startupOutcome ? 'Needs attention' : 'Not recorded')],
    ['STORAGE PROTECTION', protectionLabels[value.persistentStorage?.result] || 'Not requested'],
  ];
  return <section className="storage-diagnostics-screen" aria-label="Storage status">
    <dl className="storage-status-summary">{rows.map(([label, text]) => <div key={label}><dt className="eyebrow">{label}</dt><dd>{text}</dd></div>)}</dl>
    <p className="storage-diagnostics-privacy">Technical status only. No workout contents, Coach messages or personal data. Nothing is uploaded.</p>
    <button type="button" className="button secondary" disabled={copying} onClick={copy}>Copy diagnostics</button>
    {feedback && <p role="status" className="storage-diagnostics-feedback">{feedback}</p>}
    <details className="storage-diagnostics" open={technical} onToggle={event => setTechnical(event.currentTarget.open)}>
      <summary>{technical ? 'Hide technical details' : 'Show technical details'}</summary>
      {technical && <pre tabIndex="0" aria-label="Technical diagnostics">{JSON.stringify(value, null, 2)}</pre>}
    </details>
  </section>;
}
