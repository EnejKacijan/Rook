import React, { useId, useRef, useState } from 'react';
import { OptionalActivityEditor } from './OptionalActivityEditor.jsx';
import { conditioningConfiguration, isConditioning, optionalActivitySummary } from './optionalActivity.js';
import { isoDay, startOptionalSession } from './domain.js';
import { useDurableAction } from './useDurableAction.js';
import { ExerciseNavigationButton } from './ExerciseNavigationButton.jsx';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';

export function ConditioningSheet({ date, state, update, close, setPage, Header }) {
  const [draft, setDraft] = useState({ activity: 'Running', format: 'steady', durationSeconds: 1200, intensity: 'Moderate', intervals: { rounds: 8, workSeconds: 30, restSeconds: 60 } });
  const [error, setError] = useState('');
  const formId=useId(),submitted=useRef(false);
  const { commit } = useDurableAction(state, update);
  const conflict = state.activeWorkout || state.activeOptionalSession;
  // A successful durable commit publishes the active session before the
  // canonical close animation ends. Keep the submitted form visible during
  // that exit instead of flashing the conflict message for its own new session.
  const starting = submitted.current;
  let valid=true;try{conditioningConfiguration(draft);}catch{valid=false;}
  const canSetUp=(!conflict || starting) && date===isoDay();
  const start = () => {
    if(submitted.current || !canSetUp || !valid)return;
    submitted.current=true;
    try {
      const config = conditioningConfiguration(draft);
      const result = commit(current => {
        const next = startOptionalSession(current, { ...draft, ...config, date, kind: 'Conditioning', intent: 'conditioning' });
        if (next === current) throw new Error('Finish or resume the active session before starting another.');
        return next;
      });
      if (result.changed) { close(); setPage('optional-session'); }
    } catch (failure) { submitted.current=false;setError(failure.message); }
  };
  return <main className="sheet conditioning-sheet" role="dialog" aria-modal="true" aria-label="Conditioning">
    <Header title="Conditioning" onClose={close} />
    <div className="sheet-scroll">
      <p className="eyebrow">OPTIONAL SESSION</p>
      {conflict && !starting ? <><p>{state.activeWorkout ? 'Your strength workout is active.' : 'An optional session is active.'} Return to it before starting conditioning.</p>
        <button type="button" className="button secondary" onClick={() => { close(); setPage(state.activeWorkout ? 'workout' : 'optional-session'); }}>RETURN TO ACTIVE SESSION</button></>
        : date !== isoDay() ? <p role="status">Optional sessions can only be started for today.</p>
        : <OptionalActivityEditor formId={formId} showActions={false} submitDisabled={!valid || starting} kind="Conditioning" value={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} onSubmit={start} error={error} />}
    </div>
    {canSetUp && <SheetActionFooter separate containViewport className="conditioning-action-footer">
      <small className="sheet-footnote">Optional · does not complete a planned strength workout.</small>
      <button type="submit" form={formId} disabled={!valid || starting} className="button primary">START SESSION</button>
    </SheetActionFooter>}
  </main>;
}

export function TodayOptionalActivities({ state, date, setDetail, recovery = false, historyOnly = false }) {
  const records = (state.optionalSessions || []).filter(item => item.date === date && item.status === 'completed' && (['Cardio', 'Mobility'].includes(item.kind) || item.kind === 'Conditioning' && item.intent === 'conditioning'));
  return <section className="today-optional-activities" aria-label="Optional activities">
    {!historyOnly && date === isoDay() && <div className="today-optional-actions">
      {recovery && <button type="button" className="text-button" onClick={() => setDetail({ restTraining: date, optionalMode: 'cardio' })}>+ Light cardio</button>}
      <button type="button" className="text-button" onClick={() => setDetail({ conditioning: date })}>+ Conditioning</button>
    </div>}
    <OptionalActivityRows records={records} setDetail={setDetail} />
  </section>;
}

export function OptionalActivityRows({ records, setDetail }) {
  if (!records.length) return null;
  return <div className="optional-session-history" aria-label="Completed optional activities">{records.map(optional => <ExerciseNavigationButton className="optional-session-note" key={optional.id} onClick={() => setDetail({ optionalActivity: optional.id })}>
    <strong>✓ {optional.activity}{isConditioning(optional) && optional.format === 'intervals' ? ' intervals' : ''} completed</strong>
    <small>{isConditioning(optional) ? optionalActivitySummary(optional) : `${Math.floor((optional.elapsedSeconds || 0) / 60)}:${String(Math.floor((optional.elapsedSeconds || 0) % 60)).padStart(2, '0')}${optional.kind === 'Cardio' ? ` · ${optional.intensity}` : ''}`}</small>
    <NavigationChevron className="optional-session-chevron"/>
  </ExerciseNavigationButton>)}</div>;
}
