import React from 'react';
import {SegmentedControl} from './SegmentedControl.jsx';
import { LIGHT_CARDIO_TYPES, LIGHT_CARDIO_INTENSITIES, CONDITIONING_TYPES, CONDITIONING_INTENSITIES, CONDITIONING_FORMATS, INTERVAL_LIMITS, optionalActivityDurationLabel } from './optionalActivity.js';
import './optionalActivity.css';
import {StepperRow} from './StepperRow.jsx';

export function OptionalIntensityControl({ value, onChange, options = LIGHT_CARDIO_INTENSITIES, label = 'Intensity' }) {
  return <SegmentedControl className="optional-intensity-control" label={label} options={options} value={value} onChange={onChange}/>;
}

// One canonical form, reused by RestTrainingSheet and completed-activity edits.
export function OptionalActivityEditor({ kind, value, onChange, onSubmit, editing = false, error, formId, showActions = true, submitDisabled = false }) {
  const conditioning = kind === 'Conditioning', cardio = kind === 'Cardio' || conditioning;
  const minimum = editing ? 0 : (cardio ? 10 : 5) * 60, maximum = editing ? Infinity : (cardio ? 90 : 45) * 60;
  const step = editing ? 60 : 300;
  const adjust = direction => {
    const seconds = editing ? (direction > 0 ? Math.floor(value.durationSeconds / step) + 1 : Math.ceil(value.durationSeconds / step) - 1) * step : value.durationSeconds + direction * step;
    onChange({ durationSeconds: Math.max(minimum, Math.min(maximum, seconds)) });
  };
  const sourceTypes = conditioning ? CONDITIONING_TYPES : LIGHT_CARDIO_TYPES;
  const types = sourceTypes.includes(value.activity) ? sourceTypes : [value.activity, ...sourceTypes];
  const stepper = (label, number, change, min, max, step, suffix = '') => <StepperRow key={label} label={label} value={`${number}${suffix}`}
    decreaseDisabled={number <= min} increaseDisabled={number >= max}
    onDecrease={() => change(Math.max(min, number - step))} onIncrease={() => change(Math.min(max, number + step))}/>;
  return <form id={formId} className="optional-activity-editor" onSubmit={event => { event.preventDefault(); if(!submitDisabled)onSubmit(); }}>
    {cardio && <label className="optional-field"><span className="rook-ui">Type</span><select value={value.activity} onChange={event => onChange({ activity: event.target.value })}>{types.map(option => <option key={option}>{option}</option>)}</select></label>}
    {conditioning && <div className="optional-control-field"><span className="rook-ui">Format</span><OptionalIntensityControl label="Format" options={CONDITIONING_FORMATS} value={value.format === 'intervals' ? 'Intervals' : 'Steady'} onChange={format => onChange({ format: format.toLowerCase() })} /></div>}
    <div className="optional-parameters" key={conditioning?value.format:'duration'}>
    {conditioning && value.format === 'intervals' ? <>
      {stepper('Rounds', value.intervals.rounds, rounds => onChange({ intervals: { ...value.intervals, rounds } }), ...INTERVAL_LIMITS.rounds, 1)}
      {stepper('Work duration', value.intervals.workSeconds, workSeconds => onChange({ intervals: { ...value.intervals, workSeconds } }), ...INTERVAL_LIMITS.workSeconds, 5, ' sec')}
      {stepper('Rest duration', value.intervals.restSeconds, restSeconds => onChange({ intervals: { ...value.intervals, restSeconds } }), ...INTERVAL_LIMITS.restSeconds, 15, ' sec')}
    </> : <>
    <StepperRow label="Duration" valueLabel="Activity duration" value={optionalActivityDurationLabel(value.durationSeconds)} decreaseDisabled={value.durationSeconds <= minimum} increaseDisabled={value.durationSeconds >= maximum} onDecrease={()=>adjust(-1)} onIncrease={()=>adjust(1)}/></>}
    {conditioning && editing && value.format === 'intervals' && <StepperRow label="Logged duration" value={optionalActivityDurationLabel(value.durationSeconds)} decreaseDisabled={value.durationSeconds <= 0} onDecrease={()=>adjust(-1)} onIncrease={()=>adjust(1)}/>}
    </div>
    {cardio && <div className="optional-control-field">{conditioning && <span className="rook-ui">Intensity</span>}<OptionalIntensityControl value={value.intensity} options={conditioning ? CONDITIONING_INTENSITIES : LIGHT_CARDIO_INTENSITIES} onChange={intensity => onChange({ intensity })} /></div>}
    {error && <p className="offline-banner" role="alert">{error}</p>}
    {showActions && <><button type="submit" disabled={submitDisabled} className="button primary">{editing ? 'SAVE ACTIVITY' : 'START SESSION'}</button>
    {!editing && cardio && <small className="sheet-footnote">Optional · does not complete a planned strength workout.</small>}</>}
  </form>;
}
