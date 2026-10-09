import React, {useState} from 'react';
import './exerciseIllustration.css';

// The original image still owns loading, errors and accessible image semantics.
// Its alpha mask paints the reviewed silhouette in the resolved theme ink;
// neither the SVG bytes nor the surrounding surface are recolored.
export function ExerciseIllustration({ src, className = '', style, onLoad, onError, ...imageProps }) {
  const [loadedSource, setLoadedSource] = useState(null);
  // Don't let the CSS mask fetch an offscreen image ahead of native lazy loading.
  const maskSource = loadedSource === src ? `url(${JSON.stringify(src)})` : undefined;
  return <span className={`exercise-illustration ${className}`.trim()}
    style={{ ...style, '--exercise-illustration-source': maskSource }}>
    <img {...imageProps} src={src}
      onLoad={event => {setLoadedSource(src); onLoad?.(event);}}
      onError={event => {setLoadedSource(null); onError?.(event);}} />
  </span>;
}
