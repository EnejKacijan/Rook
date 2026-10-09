import React, {useEffect, useRef, useState} from 'react';
import {exerciseCatalog} from './domain.js';
import {exerciseArt} from './exerciseArt.js';
import {canonicalPlanReviewArt} from './PlanReviewIllustration.jsx';
import {useAvailableImage} from './useAvailableImage.js';
import {ExerciseIllustration} from './ExerciseIllustration.jsx';
import './exercisePickerIdentity.css';

export function ExercisePickerIdentity({item,enabled=true,deferOffscreen=true,priority=false,children}) {
  const thumbnail=useRef(null);
  const [visible,setVisible]=useState(()=>!deferOffscreen || priority || typeof IntersectionObserver==='undefined');
  useEffect(()=>{
    if(!deferOffscreen || priority || !enabled || visible || !thumbnail.current)return;
    // Native lazy loading still eagerly decodes many cached SVGs in a short
    // nested list. Only attach offscreen art when its reserved box is visible.
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'120px 0px'});
    observer.observe(thumbnail.current);
    return()=>observer.disconnect();
  },[deferOffscreen,priority,enabled,visible]);
  const exercise={...item,exerciseId:item.exerciseId || item.id};
  const image=useAvailableImage(enabled && (!deferOffscreen || priority || visible) && !item.custom ? canonicalPlanReviewArt(exercise,exerciseCatalog,exerciseArt) : null);
  return <span className="exercise-picker-identity">
    {enabled && <span ref={thumbnail} className="exercise-picker-thumbnail" aria-hidden="true">
      {image.source?<ExerciseIllustration src={image.source} onError={image.onError} alt="" width="44" height="44" loading="eager" fetchpriority={priority?'high':'auto'} decoding="async" draggable={false}/>:<span className="exercise-picker-placeholder">—</span>}
    </span>}
    <span className="exercise-picker-label">{children || <strong>{item.name}</strong>}</span>
  </span>;
}
