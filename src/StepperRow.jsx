import React from 'react';
import './uiSelectionPolicy.css';

// Shared geometry for optional-session parameters; value formatting and the
// existing domain bounds remain owned by the form using this row.
export function StepperRow({label,value,valueLabel=label,onDecrease,onIncrease,decreaseDisabled=false,increaseDisabled=false}) {
  return <div className="optional-duration stepper-row rook-ui">
    <span>{label}</span><div className="stepper-row-controls">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={decreaseDisabled} onClick={onDecrease}>−</button>
      <output aria-label={valueLabel}>{value}</output>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={increaseDisabled} onClick={onIncrease}>+</button>
    </div>
  </div>;
}
