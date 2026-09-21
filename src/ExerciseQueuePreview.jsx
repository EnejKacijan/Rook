import React from 'react';
import {exerciseCatalog} from './domain.js';
import {exerciseArt} from './exerciseArt.js';
import {canonicalPlanReviewArt} from './PlanReviewIllustration.jsx';
import {useAvailableImage} from './useAvailableImage.js';

/** Uses the same artwork and full-screen viewer as exercise details. */
export function ExerciseQueuePreview({item,showImages,status,Illustration,children}) {
  const exercise={...item,exerciseId:item.exerciseId || item.id};
  const image=useAvailableImage(showImages&&!item.custom?canonicalPlanReviewArt(exercise,exerciseCatalog,exerciseArt):null);
  return <section className="queue-exercise-preview" data-exercise-search-scroll data-preview-motion>
    {image.source&&Illustration&&<div className="queue-preview-hero">
      <Illustration exercise={exercise} src={image.source} onError={image.onError} label={`View ${item.name} image`}>
        <svg className="queue-preview-expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>
      </Illustration>
    </div>}
    <h1 tabIndex={-1}>{item.name}</h1>
    {item.equipment?.length>0&&<p className="queue-preview-equipment">{item.equipment.join(' · ')}</p>}
    <p className="queue-preview-status" aria-live="polite">{status==='Current'?'Current exercise':status||'Not in this workout'}</p>
    {item.description&&<p className="queue-preview-description">{item.description}</p>}
    {children}
  </section>;
}
