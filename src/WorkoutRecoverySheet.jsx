import React, {useRef, useState} from 'react';
import {uid, workoutSetSummary} from './domain.js';
import {continueIdleWorkout, finishIdleWorkout} from './workoutTiming.js';
import {useDurableAction} from './useDurableAction.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import './workoutRecovery.css';

export function WorkoutRecoverySheet({state, update, review, Header, close, onContinued, onFinish, finishError, onClearError, busy}) {
  const {commit} = useDurableAction(state, update);
  const request = useRef(uid('timing-recovery'));
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(() => review.suggestedDurationSeconds === null ? '' :
    String(Number((Math.max(1, review.suggestedDurationSeconds) / 60).toFixed(2))));
  const missingTime = review.lastActivityAt === null;
  const summary = workoutSetSummary(state.activeWorkout);
  const last = missingTime ? null : new Date(review.lastActivityAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const clearError = () => { setError(''); onClearError?.(); };
  const resume = () => {
    clearError();
    try {
      const result = commit(current => continueIdleWorkout(current, review, {
        requestId: request.current, excludeGap: true, elapsedMinutes: duration,
      }));
      if (result.changed) onContinued();
    } catch (failure) { setError(failure.message); }
  };
  const finish = () => {
    clearError();
    try {
      onFinish(finishIdleWorkout(state, review,
        missingTime || adjusting ? {durationMinutes: duration} : {}));
    } catch (failure) { setError(failure.message); }
  };
  const durationField = <label className="workout-recovery-field">Duration (min)
    <input aria-label="Workout duration in minutes" type="number" inputMode="decimal" min="0" step="any"
      aria-invalid={error ? true : undefined} aria-describedby={error ? 'workout-duration-error' : undefined}
      value={duration} placeholder="Minutes trained" onChange={event => { clearError(); setDuration(event.target.value); }}/>
    {error && <span id="workout-duration-error" role="alert">{error}</span>}
  </label>;

  return <section className="screen detail-screen workout-recovery-sheet" role="dialog" aria-modal="true" aria-labelledby="workout-recovery-title">
    <Header title="Open workout" onClose={close}/>
    <div className="workout-recovery-content">
      <h1 id="workout-recovery-title">Still training?</h1>
      <p>{last ? `Last activity: ${last}.` : 'We couldn’t recover your workout duration.'}</p>
      <p className="workout-recovery-summary">
        <span>{summary.completed} of {summary.total} sets logged.</span>
        {!missingTime && <span>Estimated duration · {Number((review.suggestedDurationSeconds / 60).toFixed(1))} min</span>}
      </p>
      {missingTime ? durationField : <AnimatedDetails className="workout-recovery-adjust" open={adjusting} keepMounted={false}
        onOpenChange={open => {
          clearError();
          if (!open) setDuration(String(Number((Math.max(1, review.suggestedDurationSeconds) / 60).toFixed(2))));
          setAdjusting(open);
        }}>
        <summary>Adjust duration</summary>
        {durationField}
      </AnimatedDetails>}
      {(finishError || (error && !missingTime && !adjusting)) && <p role="alert">{finishError || error}</p>}
    <SheetActionFooter keyboardBehavior="pin-if-room">
      <button className="button primary" type="button" disabled={busy || !summary.completed} onClick={finish}>Finish workout</button>
      <button className="button secondary" type="button" disabled={busy} onClick={resume}>Continue workout</button>
      <small data-keyboard-secondary>{summary.completed ? 'Finish saves logged sets. Continue excludes the break.' : 'No sets logged yet. Continue, or close to use Workout options.'}</small>
    </SheetActionFooter>
    </div>
  </section>;
}
