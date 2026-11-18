import React, {useState} from 'react';
import './exerciseIllustration.css';

// The original image still owns loading, errors and accessible image semantics.
// Its alpha mask paints the reviewed silhouette in the resolved theme ink;
// neither the SVG bytes nor the surrounding surface are recolored.
export function ExerciseIllustration({ src, className = '', style, loadingPlaceholder, onLoad, onError, ...imageProps }) {
  const [loadedSource, setLoadedSource] = useState(null);
  const ready = Boolean(src) && loadedSource === src;
  // Don't let the CSS mask fetch an offscreen image ahead of native lazy loading.
  const maskSource = ready ? `url(${JSON.stringify(src)})` : undefined;
  return <span className={`exercise-illustration ${className}`.trim()}
    style={{ ...style, '--exercise-illustration-source': maskSource, '--exercise-illustration-ready':ready?1:0 }}>
    <img {...imageProps} src={src}
      onLoad={event => {setLoadedSource(src); onLoad?.(event);}}
      onError={event => {setLoadedSource(null); onError?.(event);}} />
    {!ready && loadingPlaceholder}
  </span>;
}
