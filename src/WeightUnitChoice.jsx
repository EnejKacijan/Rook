import React from 'react';
import './weightUnitChoice.css';

export function WeightUnitChoice({value='kg',onChange,disabled=false,compact=false}) {
  return <section className={`weight-unit-choice${compact?' is-compact':''}`}>
    {compact?<span className="weight-unit-label">Weight units</span>:<p className="eyebrow">WEIGHT UNITS</p>}
    <div className="segmented" role="group" aria-label="Weight units">
      {['kg','lb'].map(unit=><button type="button" key={unit} disabled={disabled} aria-pressed={value===unit} className={value===unit?'active':''} onClick={()=>{if(value!==unit)onChange(unit);}}>{unit}</button>)}
    </div>
    <p className="privacy-note">{compact?'Used for weights.':'For displaying and entering weights.'} Change anytime in Profile → Logging.</p>
  </section>;
}
