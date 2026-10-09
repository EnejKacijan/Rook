import React, { useRef, useState } from 'react';
import { DestructiveConfirmationSheet } from './DestructiveConfirmationSheet.jsx';
import { OptionalActivityEditor } from './OptionalActivityEditor.jsx';
import { completedOptionalActivity, optionalActivityDurationLabel, optionalActivitySeconds, optionalActivityIntentLabel, optionalActivitySummary, isConditioning, editCompletedOptionalActivity, deleteCompletedOptionalActivity } from './optionalActivity.js';
import { useDurableAction } from './useDurableAction.js';
import { recordAccountSyncDeleteIntent } from './accountSyncOutbox.js';
import './optionalActivity.css';

export function OptionalActivityDetails({ id, state, update, close, Header, Modal }) {
  const activity = completedOptionalActivity(state, id), { commit } = useDurableAction(state, update);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(null), [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false), [deleteError, setDeleteError] = useState('');
  const original = useRef(null), deleteOriginal = useRef(null), sheet = useRef(null), deleteTrigger = useRef(null), submitted = useRef(false), deleted = useRef(false);
  const edit = () => {
    original.current = structuredClone(activity);
    setDraft({ activity: activity.activity, durationSeconds: optionalActivitySeconds(activity), targetSeconds: activity.duration * 60, intensity: activity.intensity || 'Easy', format: activity.format || 'steady', intervals: activity.intervals ? { ...activity.intervals } : { rounds: 8, workSeconds: 30, restSeconds: 60 } });
    setError(''); setEditing(true);
  };
  const save = () => {
    try { commit(current => editCompletedOptionalActivity(current, id, draft, original.current)); setEditing(false); setError(''); }
    catch (failure) { setError(failure.message); }
  };
  const dismissConfirmation = () => { setConfirming(false); setDeleteError(''); if (deleted.current) close(); };
  const confirmDelete = requestClose => {
    if (submitted.current) return;
    submitted.current = true;
    try {
      const result = commit(current => deleteCompletedOptionalActivity(current, id, deleteOriginal.current));
      deleted.current = true;
      // Use the existing local-first deletion intent/tombstone machinery.
      recordAccountSyncDeleteIntent(globalThis.localStorage, result.state.profile.id, 'optionalSessions', id);
      requestClose();
    } catch (failure) { submitted.current = false; setDeleteError(deleted.current ? 'Activity removed locally. Couldn’t queue cloud removal. Try again.' : failure.message); }
  };
  const date = activity?.completedAt ? new Date(activity.completedAt) : activity?.date ? new Date(`${activity.date}T12:00:00`) : null;
  return <><main ref={sheet} className="sheet optional-activity-details" role="dialog" aria-modal="true" aria-label={editing ? 'Edit optional activity' : 'Optional activity'}>
    <Header title={editing ? 'Edit activity' : 'Optional activity'} onClose={close} closeLabel="Close activity" onBack={editing ? () => { setEditing(false); setError(''); } : undefined} backLabel="Back to activity" />
    <div className="sheet-scroll optional-activity-content">
      {activity ? editing ? <><h2>{optionalActivityIntentLabel(activity)}</h2><OptionalActivityEditor editing kind={activity.kind} value={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} onSubmit={save} error={error} /></> : <>
        <p className="eyebrow">{optionalActivityIntentLabel(activity).toUpperCase()}</p>
        <h2>{activity.activity}</h2><p className="optional-activity-summary">{optionalActivitySummary(activity)}</p>
        {isConditioning(activity) && activity.format === 'intervals' && <p className="optional-activity-date">{activity.intervals.rounds} × {activity.intervals.workSeconds}/{activity.intervals.restSeconds} sec · {optionalActivityDurationLabel(optionalActivitySeconds(activity))} logged</p>}
        {date && !Number.isNaN(date.getTime()) && <p className="optional-activity-date">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', ...(activity.completedAt ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(date)}</p>}
        <div className="optional-activity-actions"><button type="button" className="button secondary" onClick={edit}>EDIT ACTIVITY</button>
          <button type="button" ref={deleteTrigger} className="text-button optional-activity-delete" onClick={() => { deleteOriginal.current = structuredClone(activity); submitted.current = false; deleted.current = false; setDeleteError(''); setConfirming(true); }}>Delete activity</button></div>
      </> : <p role="status">{deleted.current ? 'Activity removed.' : 'This activity is no longer available.'}</p>}
    </div>
  </main>{confirming && <DestructiveConfirmationSheet Modal={Modal} Header={Header} title="Delete this activity?" description="This removes the optional activity from this day." confirmLabel={deleted.current && deleteError ? 'RETRY CLOUD REMOVAL' : 'DELETE ACTIVITY'} keepLabel={deleted.current && deleteError ? 'CLOSE' : 'KEEP ACTIVITY'} closeLabel="Close delete activity confirmation" backLabel="Back to activity" backgroundRef={sheet} returnFocusRef={deleteTrigger} confirm={confirmDelete} close={dismissConfirmation} error={deleteError} />}</>;
}
