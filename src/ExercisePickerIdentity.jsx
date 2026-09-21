import React, {useEffect, useRef, useState} from 'react';
import {exerciseCatalog} from './domain.js';
import {exerciseArt} from './exerciseArt.js';
import {canonicalPlanReviewArt} from './PlanReviewIllustration.jsx';
import {useAvailableImage} from './useAvailableImage.js';
import './exercisePickerIdentity.css';

export function ExercisePickerIdentity({item,enabled=true,deferOffscreen=false,children}) {
  const thumbnail=useRef(null);
  const [visible,setVisible]=useState(()=>!deferOffscreen || typeof IntersectionObserver==='undefined');
  useEffect(()=>{
    if(!deferOffscreen || !enabled || visible || !thumbnail.current)return;
    // Native lazy loading still eagerly decodes many cached SVGs in a short
    // nested list. Only attach offscreen art when its reserved box is visible.
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    });
    observer.observe(thumbnail.current);
    return()=>observer.disconnect();
  },[deferOffscreen,enabled,visible]);
  const exercise={...item,exerciseId:item.exerciseId || item.id};
  const image=useAvailableImage(enabled && (!deferOffscreen || visible) && !item.custom ? canonicalPlanReviewArt(exercise,exerciseCatalog,exerciseArt) : null);
  return <span className="exercise-picker-identity">
    {enabled && <span ref={thumbnail} className="exercise-picker-thumbnail" aria-hidden="true">
      {image.source?<img src={image.source} onError={image.onError} alt="" width="44" height="44" loading="lazy" decoding="async" draggable={false}/>:<span className="exercise-picker-placeholder">—</span>}
    </span>}
    <span className="exercise-picker-label">{children || <strong>{item.name}</strong>}</span>
  </span>;
}
