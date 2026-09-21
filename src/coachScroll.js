export const FOLLOWING_LATEST = 'FOLLOWING_LATEST';
export const READING_HISTORY = 'READING_HISTORY';
export const COACH_BOTTOM_THRESHOLD = 100;
const JUMP_MIN_DURATION = 220;
const JUMP_MAX_DURATION = 280;

// The only writer of transcript scrollTop. Viewport/composer/content changes
// invalidate geometry; they never decide whether the reader wants to follow.
export function bindCoachScroll(scroller, content, { memory, conversationId, onChange = () => {} } = {}) {
  const saved = memory?.get(conversationId);
  let mode = saved?.mode || FOLLOWING_LATEST;
  let frame = 0, disposed = false, animation = null, dirty = false;
  let expectedTop = null, lastTop = scroller.scrollTop, direction = 0, touch = null;
  let manualUntil = 0;
  let anchor = null, snapshot = saved, published = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const bottom = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const distance = () => Math.max(0, bottom() - scroller.scrollTop);
  const anchors = () => [...content.querySelectorAll('[data-coach-anchor], .message-pair > .action-card, .message-pair > .combine-choices, .message-pair > .coach-interrupted, .message-pair > .coach-history-action')];
  const anchorKey = node => node.dataset.coachAnchor || `${node.closest('[data-coach-message]')?.dataset.coachMessage}:${node.matches('.action-card') ? 'action' : node.matches('.combine-choices') ? 'choices' : 'status'}`;
  const offset = element => element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const write = top => {
    const target = Math.max(0, Math.min(bottom(), top));
    if (Math.abs(scroller.scrollTop - target) > .5) scroller.scrollTop = target;
    expectedTop = scroller.scrollTop;
    lastTop = scroller.scrollTop;
  };
  const captureAnchor = () => {
    const top = scroller.getBoundingClientRect().top;
    const nodes = anchors();
    // Anchors are non-overlapping message leaves in document order. Binary
    // search avoids measuring every paragraph in a long conversation.
    let lo = 0, hi = nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (nodes[mid].getBoundingClientRect().bottom <= top + 1) lo = mid + 1;
      else hi = mid;
    }
    const element = nodes[lo];
    anchor = element ? { element, key: anchorKey(element), offset: offset(element) } : null;
  };
  const remember = () => {
    snapshot = { mode, top: scroller.scrollTop, anchor: anchor && { key: anchor.key, offset: anchor.offset } };
    memory?.set(conversationId, snapshot);
  };
  const publish = () => {
    const showLatest = distance() > 2 && (mode === READING_HISTORY || Boolean(animation));
    const signature = `${mode}:${showLatest}`;
    if (signature !== published) {
      published = signature;
      onChange({ mode, showLatest });
    }
  };
  const preserveAnchor = () => {
    if (!anchor) return;
    const element = anchor.element?.isConnected ? anchor.element : anchors().find(node => anchorKey(node) === anchor.key);
    if (!element) return;
    // Native anchoring may already have compensated. Apply only the residual,
    // never a second scrollHeight delta on top of the browser's adjustment.
    write(scroller.scrollTop + offset(element) - anchor.offset);
  };
  const flush = now => {
    frame = 0;
    if (disposed) return;
    if (mode === FOLLOWING_LATEST) {
      if (animation && !reduced.matches) {
        const progress = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
        write(animation.from + (bottom() - animation.from) * (1 - (1 - progress) ** 3));
        if (progress >= .98) { write(bottom()); animation = null; }
      } else { animation = null; write(bottom()); }
    } else if (dirty) preserveAnchor();
    dirty = false;
    direction = 0;
    if (mode === READING_HISTORY) captureAnchor();
    remember();
    publish();
    if (animation) schedule();
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(flush); };
  const changed = () => { dirty = true; schedule(); };
  const intent = nextDirection => {
    direction = nextDirection;
    manualUntil = performance.now() + 500;
    if (nextDirection < 0 || animation) {
      animation = null;
      mode = READING_HISTORY;
      captureAnchor();
      remember();
      publish();
    }
    schedule();
  };
  const onScroll = () => {
    const top = scroller.scrollTop;
    if (expectedTop !== null && Math.abs(top - expectedTop) <= 1) { expectedTop = null; return; }
    expectedTop = null;
    // A resize/prepend can produce native anchoring/clamping scroll events.
    // Explicit input takes priority; geometry changes alone cannot change mode.
    // Momentum continues after touchend/the last wheel event. A genuine move
    // changes the visible anchor; native anchoring leaves its offset unchanged.
    const momentum = performance.now() < manualUntil && Math.abs(top - lastTop) > .5 &&
      (!dirty || !anchor?.element?.isConnected || Math.abs(offset(anchor.element) - anchor.offset) > .5);
    const manualDirection = direction || (momentum ? Math.sign(top - lastTop) : 0);
    if (manualDirection) manualUntil = performance.now() + 500;
    if (!dirty || manualDirection) {
      if (manualDirection < 0 || distance() > COACH_BOTTOM_THRESHOLD) mode = READING_HISTORY;
      else if (manualDirection > 0 || top >= lastTop) mode = FOLLOWING_LATEST;
      if (mode === READING_HISTORY) captureAnchor();
      remember();
    }
    lastTop = top;
    schedule();
  };
  const wheel = event => { if (event.deltaY) intent(Math.sign(event.deltaY)); };
  const touchStart = event => { touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; };
  const touchMove = event => {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    const point = event.touches[0], dy = touch.y - point.clientY, dx = touch.x - point.clientX;
    if (Math.abs(dy) > 2 && Math.abs(dy) > Math.abs(dx)) {
      intent(Math.sign(dy));
      touch = { x: point.clientX, y: point.clientY };
    }
  };
  const touchEnd = () => { touch = null; };
  const keydown = event => {
    if (event.target.closest('textarea,input,select,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && event.target.closest('button,a[href]')) return;
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) intent(-1);
    if (['ArrowDown', 'PageDown', 'End'].includes(event.key) || (event.key === ' ' && !event.shiftKey)) intent(1);
  };
  // Pointer down halts an explicit smooth jump so a scrollbar drag or touch can
  // take over before its first scroll event. A simple focus is not such intent.
  const pointerDown = () => { if (animation) intent(-1); };
  const listeners = { scroll: onScroll, wheel, touchstart: touchStart, touchmove: touchMove, touchend: touchEnd, touchcancel: touchEnd, keydown, pointerdown: pointerDown };
  for (const [name, handler] of Object.entries(listeners)) scroller.addEventListener(name, handler, { passive: true });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(changed) : null;
  resize?.observe(scroller);
  resize?.observe(content);
  const mutation = new MutationObserver(changed);
  mutation.observe(content, { childList: true, characterData: true, subtree: true, attributes: true });

  // Restore before the first paint; cache belongs to the mounted app, not disk.
  if (mode === FOLLOWING_LATEST) write(bottom());
  else {
    write(saved?.top || 0);
    anchor = saved?.anchor || null;
    preserveAnchor();
    captureAnchor();
  }
  remember();
  publish();
  return {
    changed,
    latest() {
      mode = FOLLOWING_LATEST;
      direction = 0;
      manualUntil = 0;
      const travel = distance();
      const duration = Math.min(JUMP_MAX_DURATION, Math.max(JUMP_MIN_DURATION, 220 + travel / 20));
      animation = !reduced.matches && travel > 2 ? { from: scroller.scrollTop, start: performance.now(), duration } : null;
      publish();
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      for (const [name, handler] of Object.entries(listeners)) scroller.removeEventListener(name, handler);
      // React may already have replaced the DOM on a conversation switch.
      // Keep the last measured snapshot, not geometry from the next conversation.
      if (snapshot) memory?.set(conversationId, snapshot);
    },
  };
}
