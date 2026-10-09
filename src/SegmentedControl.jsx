import {useRef} from 'react';
import './segmentedControl.css';
import './uiSelectionPolicy.css';

// Controlled value selection only. Native click owns activation/scroll cancel;
// CSS follows the value without timers, pointer capture or deferred callbacks.
export function SegmentedControl({label,options,value,onChange,disabled=false,className=''}) {
  const buttons=useRef([]);
  const items=options.map(option=>typeof option==='string'?{value:option,label:option}:option);
  const selected=items.findIndex(option=>option.value===value);
  const enabled=items.map((option,index)=>!disabled&&!option.disabled?index:null).filter(index=>index!==null);
  const tabStop=enabled.includes(selected)?selected:enabled[0];
  const choose=index=>{if(enabled.includes(index)){onChange(items[index].value);buttons.current[index]?.focus();}};
  const keyDown=(event,index)=>{
    if(!enabled.length)return;
    let next;
    if(event.key==='Home')next=enabled[0];
    else if(event.key==='End')next=enabled.at(-1);
    else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)) {
      const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
      next=enabled[(enabled.indexOf(index)+direction+enabled.length)%enabled.length];
    }
    if(next!==undefined){event.preventDefault();choose(next);}
  };
  return <div className={`rook-segmented-control rook-ui${className?` ${className}`:''}`} role="radiogroup" aria-label={label}
    aria-disabled={disabled||undefined} style={{'--rook-segment-count':items.length,'--rook-segment-index':Math.max(0,selected)}}>
    <span className="rook-segmented-indicator" aria-hidden="true" hidden={selected<0}/>
    {items.map((option,index)=><button type="button" role="radio" key={option.value} ref={node=>buttons.current[index]=node}
      aria-checked={option.value===value} disabled={disabled||option.disabled} tabIndex={index===tabStop?0:-1}
      onClick={()=>choose(index)} onKeyDown={event=>keyDown(event,index)}>{option.label}</button>)}
  </div>;
}
