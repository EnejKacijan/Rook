// Touch-only enhancement. Browser tabs retain their native history gestures.
export const EDGE_BACK = Object.freeze({ edge: 24, intent: 10, ratio: 1.4, fraction: .33, flickDistance: 56, velocity: .65 });
export function standaloneNavigation(win = window) {
  return win.navigator.standalone === true || Boolean(win.matchMedia?.('(display-mode: standalone)').matches);
}
export function backIntent(dx, dy) {
  if (dx < -EDGE_BACK.intent || Math.abs(dy) >= EDGE_BACK.intent && Math.abs(dy) * EDGE_BACK.ratio >= dx) return 'ignore';
  return dx > EDGE_BACK.intent && dx > Math.abs(dy) * EDGE_BACK.ratio ? 'back' : 'pending';
}
export function commitBack(distance, width, velocity) {
  return distance >= width * EDGE_BACK.fraction || distance >= EDGE_BACK.flickDistance && velocity >= EDGE_BACK.velocity;
}

// Scoped native touch events allow vertical scrolling until horizontal intent is
// established (pointer pan-y would let the browser cancel horizontal tracking).
export function bindEdgeBack(surface, { enabled, onBack, render, clear, getBounds, duration = 180 }) {
  let touch = null, timer = null, settling = false, suppressUntil = 0, suppressTarget = null;
  const blocked = target => target?.closest?.('input, textarea, select, button, a, [contenteditable], [role="slider"], [role="tablist"], canvas, svg, img, .modal-drag-handle, [data-no-edge-back]');
  const reset = () => { clearTimeout(timer); timer = null; touch = null; settling = false; delete surface.dataset.edgeBackActive; clear(); };
  const start = event => {
    if (event.touches.length !== 1) { reset(); return; }
    if (settling || !enabled(event) || blocked(event.target) || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') || String(window.getSelection?.() || '')) return;
    const point = event.touches[0], bounds = getBounds?.() || surface.getBoundingClientRect();
    if (point.clientX < bounds.left || point.clientX > bounds.left + EDGE_BACK.edge) return;
    touch = { target: event.target, id: point.identifier, x: point.clientX, y: point.clientY, lastX: point.clientX, at: performance.now(), velocity: 0, distance: 0, width: bounds.width, active: false };
  };
  const move = event => {
    if (!touch) return;
    if (!enabled() || event.touches.length !== 1 || event.touches[0].identifier !== touch.id) { reset(); return; }
    const point = event.touches[0], dx = point.clientX - touch.x, dy = point.clientY - touch.y;
    if (!touch.active) {
      const intent = backIntent(dx, dy);
      if (intent === 'ignore') { touch = null; return; }
      if (intent !== 'back') return;
      touch.active = true;
      surface.dataset.edgeBackActive = 'true';
    }
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    touch.velocity = (point.clientX - touch.lastX) / Math.max(1, now - touch.at);
    touch.lastX = point.clientX; touch.at = now;
    touch.distance = Math.max(0, Math.min(touch.width, dx));
    render(touch.distance, 0);
  };
  const finish = event => {
    if (!touch) return;
    const gesture = touch; touch = null;
    if (!gesture.active) return;
    event.stopPropagation();
    suppressUntil = performance.now() + 350;
    suppressTarget = gesture.target;
    const commit = event.type !== 'touchcancel' && enabled() && commitBack(gesture.distance, gesture.width, performance.now() - gesture.at > 100 ? 0 : gesture.velocity);
    settling = true;
    const ms = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : typeof duration === 'function' ? duration(gesture, commit) : duration;
    render(commit ? gesture.width : 0, ms);
    const complete = () => {
      reset();
      if (commit && enabled()) onBack();
    };
    if (ms === 0) complete();
    else timer = setTimeout(complete, ms);
  };
  const click = event => {
    if (event.isTrusted && event.target === suppressTarget && performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    // A real button action takes priority over an in-flight gesture/settle.
    if (touch || settling) reset();
  };
  const interrupt = () => reset();
  surface.addEventListener('touchstart', start, { passive: true, capture: true });
  surface.addEventListener('touchmove', move, { passive: false, capture: true });
  surface.addEventListener('touchend', finish, true);
  surface.addEventListener('touchcancel', finish, true);
  surface.addEventListener('click', click, true);
  window.addEventListener('resize', interrupt);
  window.addEventListener('blur', interrupt);
  document.addEventListener('visibilitychange', interrupt);
  return () => {
    reset();
    surface.removeEventListener('touchstart', start, true);
    surface.removeEventListener('touchmove', move, true);
    surface.removeEventListener('touchend', finish, true);
    surface.removeEventListener('touchcancel', finish, true);
    surface.removeEventListener('click', click, true);
    window.removeEventListener('resize', interrupt);
    window.removeEventListener('blur', interrupt);
    document.removeEventListener('visibilitychange', interrupt);
  };
}
