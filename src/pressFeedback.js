// One transient press owner for semantic app controls. This observes input;
// native click, focus, scrolling, swipe/reorder and navigation retain ownership.
const bindings = new WeakMap();
const controls = 'button, [role="button"], [role="tab"], [role="radio"], summary, .exercise-row-feedback, a.rook-ui[href]';

export function clearPressFeedback(node) {
  const binding = bindings.get(node?.ownerDocument);
  if (binding?.node && (node === binding.node || node.contains(binding.node))) binding.clear();
}

export function bindPressFeedback(doc = document) {
  const existing = bindings.get(doc);
  if (existing) { existing.users++; return releaseUser(existing); }
  const win = doc.defaultView;
  const binding = { users: 1, node: null, clear: null, dispose: null };
  let pointer = null, observer = null;
  const clear = () => {
    binding.node?.removeAttribute('data-row-pressed');
    binding.node = null; pointer = null;
    observer?.disconnect(); observer = null;
  };
  binding.clear = clear;
  const control = event => {
    if (event.target?.closest?.('textarea,input:not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]')) return null;
    return event.target?.closest?.(controls);
  };
  const unavailable = node => !node?.isConnected || node.matches(':disabled,[aria-disabled="true"]') || node.closest('[inert],[aria-hidden="true"]') || (node.matches('label') && node.querySelector('input:disabled'));
  const kind = (event, node = control(event)) => {
    if (event.pointerType === 'touch') node?.setAttribute('data-row-touch', '');
    else if (event.pointerType === 'mouse' || event.pointerType === 'pen') node?.removeAttribute('data-row-touch');
  };
  const start = node => {
    if (unavailable(node)) return;
    binding.node = node; node.setAttribute('data-row-pressed', '');
    observer = new win.MutationObserver(() => { if (unavailable(node)) clear(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled','aria-disabled','aria-hidden','inert'] });
  };
  const down = event => {
    clear(); const node = control(event); kind(event, node);
    if (event.button !== 0 || event.isPrimary === false || unavailable(node)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; start(node);
  };
  const move = event => {
    kind(event);
    if (!binding.node || !pointer || pointer.id !== event.pointerId) return;
    const rect = binding.node.getBoundingClientRect();
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8 || event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) clear();
  };
  const leave = event => { if (binding.node && !binding.node.contains(event.relatedTarget)) clear(); };
  const keydown = event => {
    if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) { clear(); start(control(event)); }
  };
  const keyup = event => { if (event.key === ' ' || event.key === 'Enter') clear(); };
  const handlers = { pointerdown: down, pointermove: move, pointerover: kind, pointerout: leave, pointerleave: leave, pointerup: clear, pointercancel: clear, lostpointercapture: clear, touchcancel: clear, click: clear, scroll: clear, focusout: clear, keydown, keyup, visibilitychange: clear };
  for (const [type, handler] of Object.entries(handlers)) doc.addEventListener(type, handler, { capture: true, passive: type.startsWith('pointer') || type.startsWith('touch') || type === 'scroll' });
  const windowEvents = ['blur','pagehide','popstate','hashchange'];
  windowEvents.forEach(type => win.addEventListener(type, clear));
  binding.dispose = () => {
    clear(); bindings.delete(doc);
    for (const [type, handler] of Object.entries(handlers)) doc.removeEventListener(type, handler, true);
    windowEvents.forEach(type => win.removeEventListener(type, clear));
  };
  bindings.set(doc, binding);
  return releaseUser(binding);
}

function releaseUser(binding) {
  let released = false;
  return () => { if (!released) { released = true; if (--binding.users === 0) binding.dispose(); } };
}
