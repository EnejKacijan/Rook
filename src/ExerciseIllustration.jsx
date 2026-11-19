import React, {useState} from 'react';
import './exerciseIllustration.css';

// The original image still owns loading, errors and accessible image semantics.
// Its alpha mask paints the reviewed silhouette in the resolved theme ink;
// neither the SVG bytes nor the surrounding surface are recolored.
export function ExerciseIllustration({ src, className = '', style, loadingPlaceholder, onLoad, onError, ...imageProps }) {
  const [loadedSource, setLoadedSource] = useState(null);
  const [failedSource, setFailedSource] = useState(null);
  const ready = Boolean(src) && loadedSource === src;
  const loading = Boolean(src) && !ready && failedSource !== src;
  // Don't let the CSS mask fetch an offscreen image ahead of native lazy loading.
  const maskSource = ready ? `url(${JSON.stringify(src)})` : undefined;
  return <span className={`exercise-illustration${loading ? ' is-loading' : ''} ${className}`.trim()}
    style={{ ...style, '--exercise-illustration-source': maskSource, '--exercise-illustration-ready':ready?1:0 }}>
    <img {...imageProps} src={src}
      onLoad={event => {setLoadedSource(src); setFailedSource(null); onLoad?.(event);}}
      onError={event => {setLoadedSource(null); setFailedSource(src); onError?.(event);}} />
    {!ready && (loadingPlaceholder ?? <span className="exercise-illustration-placeholder" aria-hidden="true">—</span>)}
  </span>;
}
