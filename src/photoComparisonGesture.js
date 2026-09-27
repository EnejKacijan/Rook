// One local transform for both originals; no pixel processing or per-image state.
export const COMPARISON_MAX_ZOOM = 4;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function bindPhotoComparisonGesture({ stage, divider, enabled = () => true, onMultitouch = () => {}, onZoom = () => {} }) {
  const win = stage.ownerDocument.defaultView;
  const points = new Map();
  let position = 50, scale = 1, x = 0, y = 0, gesture = null, frame = 0;
  const bounds = () => stage.getBoundingClientRect();
  const transform = () => ({ position, scale, x, y });
  const constrain = () => {
    const r = bounds();
    x = clamp(x, -r.width * (scale - 1) / 2, r.width * (scale - 1) / 2);
    y = clamp(y, -r.height * (scale - 1) / 2, r.height * (scale - 1) / 2);
  };
  const paint = () => {
    frame = 0;
    stage.style.setProperty('--compare-position', `${position}%`);
    stage.style.setProperty('--compare-scale', String(scale));
    stage.style.setProperty('--compare-x', `${x}px`);
    stage.style.setProperty('--compare-y', `${y}px`);
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(paint); };
  const flush = () => { win.cancelAnimationFrame(frame); paint(); };
  const announce = () => {
    divider.setAttribute('aria-valuenow', String(Math.round(position)));
    divider.setAttribute('aria-valuetext', `${Math.round(position)} percent earlier photo`);
    onZoom(scale);
  };
  const release = id => { try { if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id); } catch { /* Pointer may already have been cancelled by the OS. */ } };
  const cancel = () => {
    if (gesture?.before) ({ position, scale, x, y } = gesture.before);
    const ids = [...points.keys()]; points.clear(); gesture = null; ids.forEach(release);
    constrain(); flush(); announce();
  };
  const pinch = () => {
    const [a, b] = [...points.values()], r = bounds();
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2 - r.left - r.width / 2, cy: (a.y + b.y) / 2 - r.top - r.height / 2 };
  };
  const down = event => {
    if (!enabled() || event.button !== 0 && event.pointerType !== 'touch') return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { stage.setPointerCapture?.(event.pointerId); } catch { /* Detached/cancelled pointer. */ }
    if (points.size >= 2) {
      onMultitouch(); announce();
      gesture = { kind: 'pinch', ...pinch(), before: transform() };
    } else {
      gesture = { kind: divider.contains(event.target) ? 'divider' : scale > 1 ? 'pan' : 'base', startX: event.clientX, startY: event.clientY, before: transform(), width: bounds().width };
    }
  };
  const move = event => {
    if (!points.has(event.pointerId) || !gesture) return;
    if (!enabled()) { cancel(); return; }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture;
    if (g.kind === 'base' || g.kind === 'paused') return; // Shared fullscreen vertical-dismiss owns base-scale movement.
    event.preventDefault();
    if (g.kind === 'pinch') {
      const p = pinch();
      scale = clamp(g.before.scale * p.distance / g.distance, 1, COMPARISON_MAX_ZOOM);
      const ratio = scale / g.before.scale;
      x = p.cx - (g.cx - g.before.x) * ratio;
      y = p.cy - (g.cy - g.before.y) * ratio;
      constrain();
    } else if (g.kind === 'divider') {
      position = clamp(g.before.position + (event.clientX - g.startX) / Math.max(1, g.width) * 100, 0, 100);
    } else {
      x = g.before.x + event.clientX - g.startX; y = g.before.y + event.clientY - g.startY; constrain();
    }
    schedule();
  };
  const up = event => {
    if (!points.has(event.pointerId)) return;
    move(event); points.delete(event.pointerId); release(event.pointerId);
    // Do not turn the remaining pinch finger into a divider drag or dismiss.
    gesture = points.size ? { kind: 'paused', before: transform() } : null;
    flush(); announce();
  };
  const lost = event => { if (points.has(event.pointerId)) cancel(); };
  const key = event => {
    if (!enabled()) return;
    const amount = event.shiftKey ? 10 : 1;
    const next = { ArrowLeft: position - amount, ArrowDown: position - amount, ArrowRight: position + amount, ArrowUp: position + amount, Home: 0, End: 100 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); cancel(); position = clamp(next, 0, 100); flush(); announce();
  };
  const zoom = next => { cancel(); const ratio = clamp(next, 1, COMPARISON_MAX_ZOOM) / scale; scale *= ratio; x *= ratio; y *= ratio; constrain(); flush(); announce(); };
  const reset = () => { cancel(); scale = 1; x = y = 0; flush(); announce(); };
  const resize = () => { cancel(); reset(); };
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', lost], ['lostpointercapture', lost]];
  listeners.forEach(([name, fn]) => stage.addEventListener(name, fn));
  divider.addEventListener('keydown', key);
  win.addEventListener('blur', cancel); win.addEventListener('resize', resize);
  stage.ownerDocument.addEventListener('visibilitychange', cancel);
  paint(); announce();
  return {
    get scale() { return scale; },
    zoom, reset,
    dispose() {
      listeners.forEach(([name, fn]) => stage.removeEventListener(name, fn));
      divider.removeEventListener('keydown', key);
      win.removeEventListener('blur', cancel); win.removeEventListener('resize', resize);
      stage.ownerDocument.removeEventListener('visibilitychange', cancel);
      const ids = [...points.keys()]; points.clear(); gesture = null; ids.forEach(release); win.cancelAnimationFrame(frame);
    },
  };
}
