// A geometric intersection can occur partway through a sheet or page entrance.
// Wait for that motion, then play each target the first time it enters view.
export function observeVisibleMotion(targets, play, { after = [], threshold = .5, root = null, rootMargin } = {}) {
  const view = targets[0]?.ownerDocument.defaultView;
  if (!view) return () => {};
  if (!view.IntersectionObserver) {
    targets.forEach(play);
    return () => {};
  }

  let cancelled = false;
  let observer;
  const observe = () => {
    if (cancelled) return;
    observer = new view.IntersectionObserver(entries => {
      if (cancelled) return;
      for (const { target, isIntersecting, intersectionRatio } of entries) {
        if (!isIntersecting || intersectionRatio < threshold || !target.isConnected) continue;
        observer.unobserve(target);
        play(target);
      }
    }, { threshold, root, rootMargin });
    targets.forEach(target => observer.observe(target));
  };
  const frame = after.length ? view.requestAnimationFrame(() => {
    // At this frame, CSS transitions from the same render have been registered.
    const animations = after.flatMap(node => node?.getAnimations?.() || []);
    Promise.allSettled(animations.map(animation => animation.finished)).then(observe);
  }) : null;
  if (frame === null) observe();
  return () => {
    cancelled = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
