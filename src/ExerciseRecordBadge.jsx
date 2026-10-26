import React,{useLayoutEffect,useRef} from 'react';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import './exercisePr.css';
import {InformationIcon} from './InformationIcon.jsx';

export function ExerciseRecordBadge({presentation,celebration, ...props}) {
  const ref=useRef(null);
  useLayoutEffect(()=>{
    const node=ref.current?.querySelector('.active-performance-pr');
    if(!celebration||!node?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    const motion=node.animate([{transform:'scale(1)',boxShadow:'0 0 0 0 transparent'},
      {transform:'scale(1.03)',boxShadow:'0 0 0 5px var(--rook-accent-soft)'},
      {transform:'scale(1)',boxShadow:'0 0 0 0 transparent'}],{duration:550,easing:'ease-out'});
    return()=>motion.cancel();
  },[celebration]);
  if(!presentation)return null;
  return <span role="status" aria-live="polite"><ExerciseNavigationButton ref={ref} {...props}
    className="active-performance-pr-trigger" aria-label={`View ${presentation.label.toLowerCase()}, ${presentation.gain}`} aria-haspopup="dialog">
    <span className={`active-performance-pr is-${presentation.kind}`}><strong>{presentation.label}</strong><span className="active-record-gain">{presentation.gain}<span className="active-record-info" aria-hidden="true"><InformationIcon/></span></span></span>
  </ExerciseNavigationButton></span>;
}
