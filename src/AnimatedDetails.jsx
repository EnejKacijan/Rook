import {Children, cloneElement, useId, useLayoutEffect, useRef, useState} from 'react';
import {Disclosure} from './Disclosure.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';

// Native summary keyboard semantics, with the same measured animation as the
// workout and plan disclosures. Keep the native body open until collapse ends.
export function AnimatedDetails({children, open, defaultOpen=false, onOpenChange, className='', keepMounted=true, ...props}) {
  const [localOpen,setLocalOpen]=useState(defaultOpen);
  const expanded=open===undefined?localOpen:Boolean(open);
  const [present,setPresent]=useState(expanded);
  const ref=useRef(null),expectedOpen=useRef(expanded||present),id=useId();
  expectedOpen.current=expanded||present;
  useLayoutEffect(()=>{if(expanded)setPresent(true);},[expanded]);
  const change=next=>{
    if(!next&&ref.current?.querySelector('.rook-disclosure')?.contains(document.activeElement))
      ref.current.querySelector('summary').focus({preventScroll:true});
    if(open===undefined)setLocalOpen(next);
    onOpenChange?.(next);
  };
  const parts=Children.toArray(children),summary=parts[0];
  return <details {...props} ref={ref} className={`rook-details${className?` ${className}`:''}`}
    open={expanded||present} data-expanded={expanded} onToggle={event=>{
      if(event.currentTarget.open!==expectedOpen.current)change(event.currentTarget.open);
    }}>
    {cloneElement(summary,{
      'aria-expanded':expanded,'aria-controls':id,
      onClick:event=>{summary.props.onClick?.(event);if(event.defaultPrevented)return;event.preventDefault();change(!expanded);},
    },<><span className="rook-details-label">{summary.props.children}</span><NavigationChevron className="rook-details-chevron"/></>)}
    <Disclosure id={id} open={expanded} keepMounted={keepMounted} onRest={setPresent}>{parts.slice(1)}</Disclosure>
  </details>;
}
