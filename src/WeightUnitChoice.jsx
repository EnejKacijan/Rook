import React from 'react';
import './weightUnitChoice.css';
import {SegmentedControl} from './SegmentedControl.jsx';

export function WeightUnitChoice({value='kg',onChange,disabled=false,compact=false}) {
  return <section className={`weight-unit-choice${compact?' is-compact':''}`}>
    {compact?<span className="weight-unit-label">Weight units</span>:<p className="eyebrow">WEIGHT UNITS</p>}
    <SegmentedControl label="Weight units" options={['kg','lb']} value={value} disabled={disabled} onChange={unit=>{if(value!==unit)onChange(unit);}}/>
    <p className="privacy-note">{compact?'Used for weights.':'For displaying and entering weights.'} Change anytime in Profile → Logging.</p>
  </section>;
}
