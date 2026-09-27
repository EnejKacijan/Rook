import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bindFullscreenPhotoScope } from './fullscreenPhotoScope.js';
import { bindFullscreenViewerDrag } from './fullscreenViewerDrag.js';
import { bindPhotoComparisonGesture, COMPARISON_MAX_ZOOM } from './photoComparisonGesture.js';
import { focusNavigationTarget } from './navigationFocus.js';

export function PhotoComparisonViewer({ pair, images, onLoad, onError, onInspect, onChooseAnother, onBack, onClose, Header }) {
  const [mode, setMode] = useState('swipe'), [zoom, setZoom] = useState(1);
  const layer = useRef(null), content = useRef(null), stage = useRef(null), divider = useRef(null), gesture = useRef(null), dismiss = useRef(null);
  const current = useRef(null), previousFocus = useRef(document.activeElement);
  current.current = { mode, images, pair, onClose, onBack };
  useLayoutEffect(() => {
    const host = layer.current;
    const scope = bindFullscreenPhotoScope(host, previousFocus.current);
    const interactive = () => !host.closest('[inert]') && current.current.mode === 'swipe' && current.current.pair.every(p => current.current.images[p.id]?.ready);
    gesture.current = bindPhotoComparisonGesture({ stage: stage.current, divider: divider.current, enabled: interactive, onZoom: setZoom, onMultitouch: () => dismiss.current?.cancel() });
    dismiss.current = bindFullscreenViewerDrag({ layer: host, visual: content.current, zoomScale: () => gesture.current?.scale || 1, onDismiss: () => current.current.onClose() });
    const escape = event => {
      if (event.key !== 'Escape' || host.closest('[inert]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); current.current.onBack();
    };
    window.addEventListener('keydown', escape, true);
    focusNavigationTarget(host.querySelector('.detail-header-back') || host.querySelector('button'));
    return () => { window.removeEventListener('keydown', escape, true); gesture.current?.dispose(); dismiss.current?.(); scope(); };
  }, []);
  const changeMode = next => { dismiss.current?.cancel(); gesture.current?.reset(); setMode(next); };
  const ready = pair.every(entry => images[entry.id]?.ready);
  return createPortal(<div ref={layer} className="workout-photo-viewer photo-comparison-viewer" data-fullscreen-photo role="dialog" aria-modal="true" aria-label="Compare photos">
    <div ref={content} className="workout-photo-viewer-content photo-comparison-content">
      <Header title="Compare photos" onBack={onBack} onClose={onClose} closeLabel="Close photo comparison" />
      <div className="segmented photo-comparison-modes" role="group" aria-label="Comparison mode">
        {[['swipe','Swipe'],['side','Side by side']].map(([value,label]) => <button key={value} type="button" aria-pressed={mode===value} className={mode===value?'active':''} onClick={()=>changeMode(value)}>{label}</button>)}
      </div>
      <div className="photo-comparison-canvas">
        <div className="photo-comparison-labels">{pair.map(entry => <div className="photo-compare-context" key={entry.id} id={`compare-${entry.id}`}>
          <time dateTime={entry.day}>{new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric' }).format(new Date(`${entry.day}T12:00:00`))}</time>
          <strong title={entry.workoutName}>{entry.workoutName}</strong>
        </div>)}</div>
        <div ref={stage} className="photo-comparison-stage" data-mode={mode} aria-label={mode==='swipe'?'Swipe photo comparison':'Side by side photo comparison'}>
          {pair.map((entry,index) => <div className={`photo-comparison-layer${index===0?' is-earlier':''}`} key={entry.id} data-photo-id={entry.id}>
            {images[entry.id]?.url && <img src={images[entry.id].url} alt={`Private workout photo, ${entry.workoutName}, ${entry.day}`} draggable="false" decoding="async" onLoad={()=>onLoad(entry.id)} onError={()=>onError(entry.id)} />}
            {!images[entry.id]?.ready && <span className="photo-comparison-loading" role="status">{images[entry.id]?.unavailable?'Photo unavailable':'Loading photo…'}</span>}
            {mode==='side' && <button className="photo-compare-inspect" aria-label={`Inspect photo, ${entry.workoutName}, ${entry.day}`} disabled={!images[entry.id]?.ready} onClick={event=>onInspect(entry.id,event.currentTarget)} />}
          </div>)}
          <span className="photo-comparison-line" aria-hidden="true" hidden={mode!=='swipe' || !ready} />
          <div ref={divider} className="photo-comparison-divider" role="slider" tabIndex={ready && mode==='swipe'?0:-1} aria-label="Comparison divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={50} aria-valuetext="50 percent earlier photo" aria-orientation="horizontal" aria-disabled={!ready} hidden={mode!=='swipe' || !ready}><span aria-hidden="true">‹ ›</span></div>
        </div>
      </div>
      <div className="photo-comparison-footer">
        {pair.filter(entry=>images[entry.id]?.unavailable).map(entry=><div className="photo-compare-unavailable" key={entry.id} role="status"><p>{entry.workoutName}: This photo is no longer available.</p><button className="text-button" onClick={()=>onChooseAnother(entry.id)}>Choose another</button></div>)}
        {mode==='swipe' ? <div className="photo-comparison-zoom" role="group" aria-label="Comparison zoom">
          <button type="button" aria-label="Zoom out" disabled={!ready || zoom<=1} onClick={()=>gesture.current.zoom(zoom-.5)}>−</button>
          <button type="button" aria-label="Reset comparison zoom" disabled={!ready} onClick={()=>gesture.current.reset()}>{Number(zoom.toFixed(1))}×</button>
          <button type="button" aria-label="Zoom in" disabled={!ready || zoom>=COMPARISON_MAX_ZOOM} onClick={()=>gesture.current.zoom(zoom+.5)}>+</button>
        </div> : <p className="photo-comparison-hint">Tap a photo to inspect it.</p>}
        <button className="text-button photo-comparison-change" onClick={onBack}>CHANGE PHOTOS</button>
        <p className="photo-compare-privacy">Stored privately on this device. ROOK does not upload or analyze photos.</p>
      </div>
    </div>
  </div>, document.body);
}
