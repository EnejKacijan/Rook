import React, {useId,useLayoutEffect,useRef,useState} from 'react';
import './uiSelectionPolicy.css';

// Shared geometry for optional-session parameters; value formatting and the
// existing domain bounds remain owned by the form using this row.
export function StepperRow({label,value,valueLabel=label,onDecrease,onIncrease,decreaseDisabled=false,increaseDisabled=false,editor}) {
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
  const input=useRef(null),trigger=useRef(null),returnFocus=useRef(false),errorId=useId();
  const number=Number(draft),valid=/^\d+$/.test(draft)&&Number.isSafeInteger(number)&&number>=editor?.min&&number<=editor?.max;
  const error=editor?`Enter a whole number from ${editor.min} to ${editor.max}${editor.unit?` ${editor.unit}`:''}.`:'';
  useLayoutEffect(()=>{
    if(editing){input.current?.focus();input.current?.select();}
    else if(returnFocus.current){returnFocus.current=false;trigger.current?.focus();}
  },[editing]);
  useLayoutEffect(()=>{input.current?.setCustomValidity(valid?'':error);},[editing,valid,error]);
  const adjust=action=>{setEditing(false);action();};
  return <div className="optional-duration stepper-row rook-ui">
    <span>{label}</span><div className="stepper-row-controls">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={decreaseDisabled} onClick={()=>adjust(onDecrease)}>−</button>
      {editor ? editing ? <div className="stepper-row-entry">
        <input ref={input} type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" required
          aria-label={`${label}${editor.unit?` in ${editor.unit}`:''}`} aria-invalid={!valid||undefined} aria-describedby={!valid?errorId:undefined} value={draft}
          onChange={event=>{const raw=event.target.value,next=Number(raw);setDraft(raw);if(/^\d+$/.test(raw)&&Number.isSafeInteger(next)&&next>=editor.min&&next<=editor.max)editor.onChange(next);}}
          onBlur={()=>{if(valid)setEditing(false);}}
          onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(valid){returnFocus.current=true;setEditing(false);}else input.current?.reportValidity();}}}/>
        {editor.unit&&<span aria-hidden="true">{editor.unit}</span>}
      </div> : <button ref={trigger} type="button" className="stepper-row-value" aria-label={`Edit ${label.toLowerCase()}, ${value}`} onClick={()=>{setDraft(String(editor.value));setEditing(true);}}><output aria-label={valueLabel}>{value}</output></button>
      : <output aria-label={valueLabel}>{value}</output>}
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={increaseDisabled} onClick={()=>adjust(onIncrease)}>+</button>
    </div>
    {editing&&!valid&&<small id={errorId} className="stepper-row-error">{error}</small>}
  </div>;
}
