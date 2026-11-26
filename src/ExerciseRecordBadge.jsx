import React,{useLayoutEffect,useRef} from 'react';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import './exercisePr.css';
import {InformationIcon} from './InformationIcon.jsx';
import {PersonalBestTrophy} from './WorkoutPersonalBestDetails.jsx';
import {observeVisibleMotion} from './visibleMotion.js';

export function ExerciseRecordBadge({presentation,celebration, ...props}) {
  const ref=useRef(null);
  useLayoutEffect(()=>{
    const node=ref.current?.querySelector('.active-performance-pr');
    if(!celebration||!node?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    const header=node.closest('.workout-screen')?.querySelector('.workout-header');
    const covered=Math.ceil(Math.max(0,header?.getBoundingClientRect().bottom ?? 0));
    let motion, pop;
    const stop=observeVisibleMotion([node],()=>{
      if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
      motion=node.animate([{transform:'scale(1)',boxShadow:'0 0 0 0 transparent'},
        {transform:'scale(1.03)',boxShadow:'0 0 0 5px var(--rook-accent-soft)'},
        {transform:'scale(1)',boxShadow:'0 0 0 0 transparent'}],{duration:550,easing:'ease-out'});
      const trophy=node.querySelector('.active-record-trophy');
      pop=trophy?.animate([{transform:'scale(.4) rotate(-20deg)',opacity:0},{transform:'scale(1.25) rotate(8deg)',opacity:1,offset:.6},{transform:'scale(1) rotate(0)',opacity:1}],
        {duration:520,delay:60,easing:'cubic-bezier(.34,1.56,.64,1)',fill:'backwards'});
    },{threshold:.9,rootMargin:`-${covered}px 0px 0px`});
    return()=>{stop();motion?.cancel();pop?.cancel();};
  },[celebration]);
  if(!presentation)return null;
  return <span role="status" aria-live="polite"><ExerciseNavigationButton ref={ref} {...props}
    className="active-performance-pr-trigger" aria-label={`View ${presentation.label.toLowerCase()}, ${presentation.gain}`} aria-haspopup="dialog">
    <span className={`active-performance-pr is-${presentation.kind}`}><span className="active-record-trophy" aria-hidden="true"><PersonalBestTrophy/></span><strong>{presentation.label}</strong><span className="active-record-gain">{presentation.gain}<span className="active-record-info" aria-hidden="true"><InformationIcon/></span></span></span>
  </ExerciseNavigationButton></span>;
}
