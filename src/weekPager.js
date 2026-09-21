// Today owns the canonical date. This controller owns only transient transforms.
// Like the sheet/viewer gestures, touch stays native until directional intent.
export const WEEK_PAGER = Object.freeze({intent: 10, ratio: 1.35, fraction: .28,
  flickDistance: 24, velocity: .5, freshFor: 100, minSettle: 160, maxSettle: 220});

export function bindWeekPager({root, viewport, track, labelTrack, getOptions, onCommit}) {
  let gesture = null, phase = 'idle', width = 0, stride = 0, frame = 0, timer = 0;
  let dragX = 0, suppressUntil = 0, disposed = false, finish = null, settlingDirection = null, resumedTap = null;
  const removers = [];
  const now = () => performance.now();
  const listen = (node, name, handler, options) => {
    node.addEventListener(name, handler, options);
    removers.push(() => node.removeEventListener(name, handler, options));
  };
  const setPhase = value => { phase = value; root.dataset.weekPhase = value; };
  const available = direction => direction < 0 ? getOptions().canGoBack : getOptions().canGoForward;
  const measure = () => {
    width = viewport.getBoundingClientRect().width;
    // The gap belongs to the track, never to a day cell or the page width.
    stride = width + (parseFloat(getComputedStyle(track).columnGap) || 0);
  };
  const paint = () => {
    frame = 0;
    track.style.transform = `translate3d(${-stride + dragX}px, 0, 0)`;
    labelTrack.style.transform = `translate3d(${(-1 + (stride ? dragX / stride : 0)) * 100 / 3}%, 0, 0)`;
  };
  const schedulePaint = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const flushPaint = () => { cancelAnimationFrame(frame); frame = 0; paint(); };
  const transitions = value => { track.style.transition = value; labelTrack.style.transition = value; };
  const releaseCapture = previous => {
    if (previous?.kind === 'pointer' && root.hasPointerCapture?.(previous.id)) root.releasePointerCapture(previous.id);
  };
  const reset = () => {
    clearTimeout(timer); timer = 0; finish = null; settlingDirection = null; resumedTap = null;
    const previous = gesture; gesture = null; releaseCapture(previous);
    setPhase('idle'); transitions('none'); dragX = 0; suppressUntil = 0;
    measure();
    flushPaint();
  };
  const settle = direction => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = direction ? -direction * stride : 0;
    const duration = reduced ? 0 : Math.round(WEEK_PAGER.minSettle +
      (WEEK_PAGER.maxSettle - WEEK_PAGER.minSettle) * Math.min(1, Math.abs(target - dragX) / (stride || 1)));
    settlingDirection = direction; setPhase('settling'); flushPaint();
    // One release-time layout boundary, never a pointermove layout read.
    if (duration) track.getBoundingClientRect();
    transitions(duration ? `transform ${duration}ms cubic-bezier(.2, 0, .2, 1)` : 'none');
    dragX = target; paint();
    const started = now();
    finish = event => {
      if (disposed || phase !== 'settling') return;
      if (event && now() - started < duration - 16) return;
      clearTimeout(timer); timer = 0; finish = null;
      // React's caller flushes the new date/pages before this centered reset.
      if (direction) onCommit(direction);
      if (disposed) return;
      transitions('none'); dragX = 0; settlingDirection = null; setPhase('idle'); flushPaint();
      suppressUntil = now() + 350;
    };
    if (!duration) finish();
    else timer = setTimeout(() => finish?.(), duration + 32);
  };
  const start = (id, x, y, kind, target) => {
    if (phase !== 'idle' || getOptions().disabled || !target.closest?.('[data-week-drag]')) return;
    suppressUntil = 0;
    measure();
    if (!width) return;
    gesture = {id, kind, x, y, lastX: x, lastAt: now(), velocity: 0, intent: null, dx: 0};
  };
  const move = (id, x, y, event) => {
    const g = gesture;
    if (!g || g.id !== id) return;
    const dx = x - g.x, dy = y - g.y, time = now();
    if (x !== g.lastX) {
      g.velocity = (x - g.lastX) / Math.max(1, time - g.lastAt);
      g.lastX = x; g.lastAt = time;
    }
    g.dx = dx;
    if (!g.intent && Math.max(Math.abs(dx), Math.abs(dy)) >= WEEK_PAGER.intent) {
      resumedTap = null;
      g.intent = Math.abs(dx) >= WEEK_PAGER.intent && Math.abs(dx) > Math.abs(dy) * WEEK_PAGER.ratio ? 'horizontal' : 'vertical';
      if (g.intent === 'horizontal') {
        setPhase('dragging');
        if (g.kind === 'pointer') root.setPointerCapture?.(id);
      }
    }
    if (g.intent !== 'horizontal') return;
    if (event.cancelable) event.preventDefault();
    const direction = dx < 0 ? 1 : -1;
    // A bounded pull never exposes fake dates; its neighbour page is empty.
    dragX = available(direction) ? Math.max(-stride, Math.min(stride, dx)) : 28 * Math.tanh(dx / 100);
    schedulePaint();
  };
  const end = (id, x, y, event) => {
    if (!gesture || gesture.id !== id) return;
    move(id, x, y, event);
    const g = gesture; gesture = null; releaseCapture(g);
    if (g.intent !== 'horizontal') return;
    suppressUntil = now() + 350;
    const distance = Math.abs(g.dx), direction = g.dx < 0 ? 1 : -1;
    const freshVelocity = now() - g.lastAt <= WEEK_PAGER.freshFor && Math.sign(g.velocity) === Math.sign(g.dx) ? Math.abs(g.velocity) : 0;
    const commit = available(direction) && (distance >= width * WEEK_PAGER.fraction ||
      distance >= WEEK_PAGER.flickDistance && freshVelocity >= WEEK_PAGER.velocity);
    settle(commit ? direction : 0);
  };
  const arrow = direction => {
    if (disposed || phase !== 'idle' || gesture || getOptions().disabled || !available(direction)) return false;
    measure();
    settle(direction); return true;
  };
  listen(root, 'pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.isPrimary === false || gesture) { reset(); return; }
    if (e.button === 0) start(e.pointerId, e.clientX, e.clientY, 'pointer', e.target);
  });
  listen(window, 'pointermove', e => { if (e.pointerType !== 'touch') move(e.pointerId, e.clientX, e.clientY, e); }, {passive: false});
  listen(window, 'pointerup', e => { if (e.pointerType !== 'touch') end(e.pointerId, e.clientX, e.clientY, e); });
  listen(window, 'pointercancel', e => { if (gesture?.kind === 'pointer' && gesture.id === e.pointerId) reset(); });
  listen(root, 'lostpointercapture', e => { if (gesture?.kind === 'pointer' && gesture.id === e.pointerId) reset(); });
  listen(root, 'touchstart', e => {
    if (e.touches.length !== 1) { reset(); return; }
    const t = e.touches[0]; start(t.identifier, t.clientX, t.clientY, 'touch', e.target);
  }, {passive: true});
  listen(window, 'touchstart', e => { if (gesture && e.touches.length > 1) reset(); }, {passive: true});
  listen(window, 'touchmove', e => {
    if (gesture?.kind !== 'touch') return;
    if (e.touches.length !== 1) { reset(); return; }
    const t = e.touches[0]; move(t.identifier, t.clientX, t.clientY, e);
  }, {passive: false});
  listen(window, 'touchend', e => {
    if (gesture?.kind !== 'touch') return;
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === gesture.id);
    if (t) end(t.identifier, t.clientX, t.clientY, e);
  });
  listen(window, 'touchcancel', () => { if (gesture?.kind === 'touch') reset(); });
  listen(root, 'click', e => {
    const original = resumedTap; resumedTap = null;
    // A native synthesized click can re-hit-test after we center a canceled
    // track. Keep this fresh tap on the button actually touched, using its
    // existing click handler exactly once (no separate date-selection path).
    if (original && e.detail !== 0 && now() <= original.until && original.target !== e.target.closest?.('button')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (root.contains(original.target) && !original.target.disabled) original.target.click();
      return;
    }
    if (phase === 'idle' && (e.detail === 0 || now() >= suppressUntil)) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  // A new physical contact is a new tap, even immediately after a cancellation.
  const freshContact = event => {
    // A fresh tap need not wait for a canceled pull's cosmetic return animation.
    // A committed transition still owns its one pending canonical date change.
    if (phase === 'settling' && settlingDirection === 0) {
      const target = event.target.closest?.('button');
      reset();
      if (target) resumedTap = {target, until: now() + 700};
    } else if (event.type === 'pointerdown') resumedTap = null;
    if (phase === 'idle') suppressUntil = 0;
  };
  listen(root, 'pointerdown', freshContact, true);
  listen(root, 'touchstart', freshContact, {capture: true, passive: true});
  listen(track, 'transitionend', e => { if (e.target === track && e.propertyName === 'transform') finish?.(e); });
  for (const name of ['blur', 'resize', 'orientationchange', 'pagehide']) listen(window, name, reset);
  listen(document, 'visibilitychange', reset);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (viewport.getBoundingClientRect().width !== width) reset();
  }) : null;
  observer?.observe(viewport);
  reset();
  return {arrow, reset, destroy() { disposed = true; reset(); observer?.disconnect(); removers.forEach(remove => remove()); }};
}
