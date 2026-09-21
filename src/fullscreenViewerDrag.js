// Fullscreen visuals share directional arbitration and lifecycle, not sheet geometry.
// Native touchmove (as in ROOK's sheet/edge gestures) retains scroll/pinch until lock.
export const VIEWER_DRAG = Object.freeze({ intent: 10, ratio: 1.4, fraction: .26, flickDistance: 56, velocity: .65, freshFor: 100, cancelMs: 180, exitMs: 220 });
export function viewerDragIntent(dx, dy) {
  if (dy < -VIEWER_DRAG.intent || Math.abs(dx) > VIEWER_DRAG.intent && Math.abs(dx) > Math.abs(dy) * VIEWER_DRAG.ratio) return 'yield';
  return dy > VIEWER_DRAG.intent && dy > Math.abs(dx) * VIEWER_DRAG.ratio ? 'drag' : 'pending';
}
export function commitViewerDrag(distance, height, velocity) {
  return distance >= height * VIEWER_DRAG.fraction || distance >= VIEWER_DRAG.flickDistance && velocity >= VIEWER_DRAG.velocity;
}
const owners = [];
const interactive = 'button,a,input,textarea,select,[contenteditable],[role="button"],[role="slider"],[data-no-viewer-drag]';

// A release can remove the original touch target. Keep just its compatibility
// click guarded briefly across unmount; a new physical press always ends it.
function guardReleaseClick(doc) {
  const clear = () => {
    clearTimeout(timer);
    doc.removeEventListener('click', click, true);
    doc.removeEventListener('pointerdown', clear, true);
    doc.removeEventListener('touchstart', clear, true);
  };
  const click = event => {
    if (event.detail === 0) return;
    event.preventDefault(); event.stopImmediatePropagation(); clear();
  };
  const timer = setTimeout(clear, 350);
  doc.addEventListener('click', click, true);
  doc.addEventListener('pointerdown', clear, true);
  doc.addEventListener('touchstart', clear, { capture: true, passive: true });
}

export function bindFullscreenViewerDrag({ layer, visual, scroller, disabled = () => false, zoomScale = () => 1, onDismiss }) {
  if (!layer || !visual) return Object.assign(() => {}, { cancel() {} });
  const doc = layer.ownerDocument, win = doc.defaultView;
  const owner = { layer }; owners.push(owner);
  let gesture = null, phase = 'idle', timer = null, done = null;
  const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const allowed = () => owners.at(-1) === owner && layer.isConnected && !layer.closest('[inert],[aria-hidden="true"]') &&
    !disabled() && zoomScale() <= 1 && (win.visualViewport?.scale || 1) <= 1.01;
  const clearMotion = () => {
    clearTimeout(timer); timer = null; done = null;
    visual.style.removeProperty('transform'); visual.style.removeProperty('opacity'); visual.style.removeProperty('transition');
    layer.style.removeProperty('--viewer-scrim-opacity'); layer.style.removeProperty('--viewer-settle-duration');
    delete layer.dataset.viewerDragging;
  };
  const cancel = () => { gesture = null; phase = 'idle'; clearMotion(); };
  const ownMotion = () => {
    layer.style.animation = 'none';
    if (!layer.hasAttribute('data-viewer-motion')) {
      layer.style.setProperty('--viewer-scrim', win.getComputedStyle(layer).backgroundColor);
      layer.setAttribute('data-viewer-motion', '');
    }
    // Do not re-enable a fill-mode entrance after cancel; it would replay/jump.
    visual.style.animation = 'none'; layer.style.animation = 'none';
    visual.style.transition = 'none';
    layer.style.setProperty('--viewer-settle-duration', '0ms');
    layer.dataset.viewerDragging = 'true';
  };
  const position = distance => {
    const progress = Math.min(1, distance / (gesture.height * VIEWER_DRAG.fraction));
    visual.style.transform = `translate3d(0, ${distance}px, 0) scale(${reduced() ? 1 : 1 - progress * .06})`;
    layer.style.setProperty('--viewer-scrim-opacity', String(1 - progress * .75));
  };
  const settle = (commit, g) => {
    phase = commit ? 'dismissing' : 'returning';
    const ms = reduced() ? 0 : commit ? VIEWER_DRAG.exitMs : VIEWER_DRAG.cancelMs;
    // Flush the finger-tracked pose, so exit starts here even on a short flick.
    visual.getBoundingClientRect();
    visual.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,0,0,1), opacity ${ms}ms linear` : 'none';
    layer.style.setProperty('--viewer-settle-duration', `${ms}ms`);
    visual.style.transform = commit ? `translate3d(0, ${Math.max(g.distance, g.height) + 24}px, 0) scale(${reduced() ? 1 : .94})` : 'translate3d(0, 0, 0) scale(1)';
    visual.style.opacity = commit ? '0' : '1';
    layer.style.setProperty('--viewer-scrim-opacity', commit ? '0' : '1');
    done = () => {
      if (!done) return;
      done = null; clearTimeout(timer); timer = null;
      if (commit && allowed()) {
        phase = 'closed';
        // The host retains its history/domain close path, skipping only an
        // already completed decorative exit. No second close animation.
        if (onDismiss() === false) cancel();
      } else cancel();
    };
    if (ms) timer = setTimeout(() => done?.(), ms);
    else done();
  };
  const start = (event, point, kind) => {
    if (phase !== 'idle' || !allowed() || event.target.closest?.(interactive) || (scroller?.scrollTop || 0) > 0) return;
    gesture = { kind, id: kind === 'touch' ? point.identifier : point.pointerId, x: point.clientX, y: point.clientY,
      lastY: point.clientY, at: performance.now(), velocity: 0, distance: 0, active: false,
      height: win.visualViewport?.height || win.innerHeight };
  };
  const move = (event, point) => {
    const g = gesture;
    if (!g) return;
    if (!allowed() || !event.cancelable || !g.active && (scroller?.scrollTop || 0) > 0) { cancel(); return; }
    const dy = point.clientY - g.y, dx = point.clientX - g.x;
    if (!g.active) {
      const intent = viewerDragIntent(dx, dy);
      if (intent === 'yield') { gesture = null; return; }
      if (intent !== 'drag') return;
      g.active = true; phase = 'dragging'; ownMotion();
    }
    event.preventDefault(); event.stopPropagation();
    const now = performance.now();
    g.velocity = (point.clientY - g.lastY) / Math.max(1, now - g.at);
    g.lastY = point.clientY; g.at = now; g.distance = Math.max(0, dy);
    position(g.distance);
  };
  const finish = (event, point) => {
    const g = gesture;
    if (!g) return;
    if (g.active) {
      g.distance = Math.max(0, point.clientY - g.y);
      position(g.distance);
    }
    gesture = null;
    if (!g.active) return;
    event.preventDefault(); event.stopPropagation(); guardReleaseClick(doc);
    const age = performance.now() - g.at;
    // A long hold cannot borrow velocity from an old move. Release movement in
    // the opposite direction cannot borrow a prior downward flick either.
    const velocity = age > VIEWER_DRAG.freshFor || point.clientY < g.lastY ? 0 : g.velocity;
    settle(allowed() && commitViewerDrag(g.distance, g.height, velocity), g);
  };
  const touchStart = event => {
    if (event.touches.length !== 1) { cancel(); return; }
    if (!layer.contains(event.target)) return;
    start(event, event.touches[0], 'touch');
  };
  const touchMove = event => {
    if (gesture?.kind !== 'touch') return;
    const point = [...event.touches].find(p => p.identifier === gesture.id);
    if (event.touches.length !== 1 || !point) { cancel(); return; }
    move(event, point);
  };
  const touchEnd = event => {
    if (gesture?.kind !== 'touch') return;
    const point = [...event.changedTouches].find(p => p.identifier === gesture.id);
    if (point) finish(event, point);
  };
  const pointerStart = event => {
    if (event.pointerType === 'touch') { if (event.isPrimary === false) cancel(); return; }
    if (gesture) { cancel(); return; }
    if (event.button === 0 && layer.contains(event.target)) start(event, event, 'pointer');
  };
  const pointerMove = event => { if (gesture?.kind === 'pointer' && gesture.id === event.pointerId) move(event, event); };
  const pointerEnd = event => { if (gesture?.kind === 'pointer' && gesture.id === event.pointerId) finish(event, event); };
  const pointerCancel = event => { if (phase === 'dismissing' || phase === 'returning' || gesture?.kind === 'pointer' || gesture?.kind === 'touch' && event.pointerType === 'touch') cancel(); };
  const click = event => {
    if (phase === 'dismissing' || phase === 'closed') { event.preventDefault(); event.stopImmediatePropagation(); }
    else if (gesture || phase === 'returning') cancel();
  };
  const transitionEnd = event => { if (event.target === visual && event.propertyName === 'transform') done?.(); };
  const dragStart = event => { if (event.target.matches('img')) event.preventDefault(); };
  const live = [['touchstart', touchStart], ['touchmove', touchMove], ['touchend', touchEnd], ['touchcancel', cancel],
    ['pointerdown', pointerStart], ['pointermove', pointerMove], ['pointerup', pointerEnd], ['pointercancel', pointerCancel]];
  live.forEach(([name, fn]) => win.addEventListener(name, fn, { capture: true, passive: !['touchmove','touchend','pointermove','pointerup'].includes(name) }));
  layer.addEventListener('click', click, true); visual.addEventListener('transitionend', transitionEnd); layer.addEventListener('dragstart', dragStart);
  ['resize','orientationchange','blur','pagehide'].forEach(name => win.addEventListener(name, cancel));
  win.visualViewport?.addEventListener('resize', cancel); doc.addEventListener('visibilitychange', cancel);
  const dispose = () => {
    cancel(); owners.splice(owners.indexOf(owner), 1);
    live.forEach(([name, fn]) => win.removeEventListener(name, fn, true));
    layer.removeEventListener('click', click, true); visual.removeEventListener('transitionend', transitionEnd); layer.removeEventListener('dragstart', dragStart);
    ['resize','orientationchange','blur','pagehide'].forEach(name => win.removeEventListener(name, cancel));
    win.visualViewport?.removeEventListener('resize', cancel); doc.removeEventListener('visibilitychange', cancel);
  };
  dispose.cancel = cancel;
  return dispose;
}
