// Horizontal photo paging deliberately yields to the existing vertical dismiss,
// scrolling and native pinch gestures. Distances are CSS pixels, velocity px/ms.
export const PHOTO_PAGER = Object.freeze({ intent: 10, ratio: 1.4, fraction: .24, flickDistance: 36, velocity: .55, freshFor: 100, settleMs: 180 });
export function photoPagerIntent(dx, dy) {
  if (Math.abs(dy) > PHOTO_PAGER.intent && Math.abs(dy) > Math.abs(dx) * PHOTO_PAGER.ratio) return 'yield';
  return Math.abs(dx) > PHOTO_PAGER.intent && Math.abs(dx) > Math.abs(dy) * PHOTO_PAGER.ratio ? 'drag' : 'pending';
}
export function commitPhotoPager(distance, width, velocity) {
  return Math.abs(distance) >= width * PHOTO_PAGER.fraction || Math.abs(distance) >= PHOTO_PAGER.flickDistance && Math.sign(distance) * velocity >= PHOTO_PAGER.velocity;
}

export function bindWorkoutPhotoPager({ viewport, track, state, onNavigate, onMoving = () => {} }) {
  const win = viewport.ownerDocument.defaultView;
  let gesture, timer, done, settling = false, alive = true;
  const allowed = () => viewport.isConnected && !state().disabled && (win.visualViewport?.scale || 1) <= 1.01;
  const pose = (distance, duration = 0) => {
    track.style.transition = duration ? `transform ${duration}ms cubic-bezier(.2,0,0,1)` : 'none';
    track.style.transform = `translate3d(calc(-100% + ${distance}px), 0, 0)`;
  };
  const cancel = () => {
    const captured = gesture?.kind === 'pointer' && gesture.active ? gesture.id : null;
    clearTimeout(timer); timer = null; done = null; gesture = null; settling = false;
    if (captured !== null && viewport.hasPointerCapture?.(captured)) viewport.releasePointerCapture?.(captured);
    pose(0); delete viewport.dataset.paging;
    if (alive) onMoving(false);
  };
  const start = (event, point, kind) => {
    if (settling || gesture || !allowed() || event.target.closest?.('button,a,input,select,textarea,[role="button"],[data-no-viewer-drag]')) return;
    gesture = { kind, id: kind === 'touch' ? point.identifier : point.pointerId, x: point.clientX, y: point.clientY,
      lastX: point.clientX, at: performance.now(), velocity: 0, active: false, width: viewport.getBoundingClientRect().width || viewport.clientWidth };
  };
  const move = (event, point) => {
    const g = gesture;
    if (!g) return;
    if (!allowed() || !event.cancelable) { cancel(); return; }
    const dx = point.clientX - g.x, dy = point.clientY - g.y;
    if (!g.active) {
      const intent = photoPagerIntent(dx, dy);
      if (intent === 'yield') { gesture = null; return; }
      if (intent !== 'drag' || !g.width) return;
      g.active = true; viewport.dataset.paging = 'true'; onMoving(true);
      if (g.kind === 'pointer') {
        // Window listeners also cover release outside the image in browsers
        // without capture (and in synthetic accessibility/QA input streams).
        try { viewport.setPointerCapture?.(g.id); } catch { /* no active native pointer */ }
      }
    }
    event.preventDefault();
    const now = performance.now();
    g.velocity = (point.clientX - g.lastX) / Math.max(1, now - g.at); g.lastX = point.clientX; g.at = now;
    // At either end only a small resistant drag is shown; the archive never loops.
    const boundary = dx > 0 ? !state().previous : !state().next;
    pose(boundary ? dx * .22 : Math.max(-g.width, Math.min(g.width, dx)));
  };
  const finish = (event, point) => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    if (!g.active) return;
    event.preventDefault();
    const dx = point.clientX - g.x, direction = dx < 0 ? 1 : -1;
    const velocity = performance.now() - g.at > PHOTO_PAGER.freshFor || Math.sign(point.clientX - g.lastX) && Math.sign(point.clientX - g.lastX) !== Math.sign(dx) ? 0 : g.velocity;
    const commit = allowed() && (direction === 1 ? state().next : state().previous) && commitPhotoPager(dx, g.width, velocity);
    settling = true;
    const ms = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : PHOTO_PAGER.settleMs;
    track.getBoundingClientRect(); pose(commit ? -direction * g.width : 0, ms);
    done = () => {
      if (!done) return;
      done = null;
      if (commit && allowed()) onNavigate(direction);
      cancel();
    };
    if (ms) timer = setTimeout(() => done?.(), ms); else done();
  };
  const touchStart = e => { if (e.touches.length !== 1) cancel(); else start(e, e.touches[0], 'touch'); };
  const touchMove = e => {
    if (gesture?.kind !== 'touch') return;
    const p = [...e.touches].find(p => p.identifier === gesture.id);
    if (e.touches.length !== 1 || !p) cancel(); else move(e, p);
  };
  const touchEnd = e => { if (gesture?.kind === 'touch') { const p = [...e.changedTouches].find(p => p.identifier === gesture.id); if (p) finish(e, p); } };
  const pointerStart = e => { if (e.pointerType !== 'touch' && e.button === 0) start(e, e, 'pointer'); };
  const pointerMove = e => { if (gesture?.kind === 'pointer' && gesture.id === e.pointerId) move(e, e); };
  const pointerEnd = e => { if (gesture?.kind === 'pointer' && gesture.id === e.pointerId) finish(e, e); };
  const lostCapture = () => { if (gesture?.active) cancel(); };
  const transitionEnd = e => { if (e.target === track && e.propertyName === 'transform') done?.(); };
  const preventImageDrag = e => { if (e.target.matches('img')) e.preventDefault(); };
  const events = [['touchstart', touchStart], ['touchmove', touchMove], ['touchend', touchEnd], ['touchcancel', cancel],
    ['pointerdown', pointerStart], ['lostpointercapture', lostCapture], ['dragstart', preventImageDrag]];
  events.forEach(([name, fn]) => viewport.addEventListener(name, fn, { passive: false }));
  const globalEvents = [['pointermove', pointerMove], ['pointerup', pointerEnd], ['pointercancel', cancel],
    ['blur', cancel], ['resize', cancel], ['pagehide', cancel]];
  globalEvents.forEach(([name, fn]) => win.addEventListener(name, fn, { passive: false }));
  track.addEventListener('transitionend', transitionEnd);
  win.document.addEventListener('visibilitychange', cancel);
  win.visualViewport?.addEventListener('resize', cancel);
  const dispose = () => {
    alive = false; cancel();
    events.forEach(([name, fn]) => viewport.removeEventListener(name, fn));
    globalEvents.forEach(([name, fn]) => win.removeEventListener(name, fn));
    track.removeEventListener('transitionend', transitionEnd);
    win.document.removeEventListener('visibilitychange', cancel);
    win.visualViewport?.removeEventListener('resize', cancel);
  };
  dispose.cancel = cancel;
  return dispose;
}
