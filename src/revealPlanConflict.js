// A short, cancellable reveal inside the entered sheet; never scroll the page.
export function revealPlanConflict(screen, target, inset, reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const bounds = target.getBoundingClientRect(), viewport = screen.getBoundingClientRect();
  const destination = Math.max(0, Math.min(screen.scrollHeight - screen.clientHeight, screen.scrollTop + bounds.top - viewport.top - inset));
  const alreadyVisible = bounds.top >= viewport.top + inset && bounds.bottom <= viewport.bottom;
  let frame, stopped = false;
  const cancel = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) screen.removeEventListener(event, cancel);
  };
  const finish = () => { cancel(); if (target.isConnected) target.focus({ preventScroll: true }); };
  if (reducedMotion || alreadyVisible || Math.abs(destination - screen.scrollTop) < 2) {
    screen.scrollTop = destination;
    finish();
    return cancel;
  }
  // Don't fly through an entire long plan: reveal only the final viewport.
  const distance = Math.min(Math.abs(destination - screen.scrollTop), screen.clientHeight * 0.75);
  const start = destination - Math.sign(destination - screen.scrollTop) * distance;
  screen.scrollTop = start;
  const started = performance.now();
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) screen.addEventListener(event, cancel, { passive: true });
  const tick = now => {
    if (stopped || !target.isConnected) { cancel(); return; }
    const progress = Math.min(1, (now - started) / 180);
    screen.scrollTop = start + (destination - start) * (1 - (1 - progress) ** 3);
    if (progress === 1) finish();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return cancel;
}
