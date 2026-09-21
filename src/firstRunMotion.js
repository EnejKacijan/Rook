// First-run only: the questionnaire's 180ms easing, with compact semantic travel.
export const FIRST_RUN_MOTION = Object.freeze({ duration: 180, travel: 24, easing: 'cubic-bezier(.2,0,0,1)', utilityDuration: 160 });
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const running = new WeakMap();
export function stopFirstRunMotion(surface) { running.get(surface)?.(); }

// Visual-only outgoing content; live forms are never replaced by these copies.
export function captureFirstRunSurface(surface) {
  if (!surface || reduced()) return null;
  const bounds = surface.getBoundingClientRect();
  const copy = surface.cloneNode(true);
  const originals = [surface, ...surface.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  const scrolls = [];
  copies.forEach((node, index) => {
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
    node.style.animation = 'none';
    if (originals[index].scrollTop || originals[index].scrollLeft)
      scrolls.push([node, originals[index].scrollTop, originals[index].scrollLeft]);
    if (node.matches('input,textarea,select')) node.value = originals[index].value;
  });
  Object.assign(copy.style, { position: 'absolute', margin: '0', top: `${bounds.top}px`, left: `${bounds.left}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, maxHeight: 'none', transform: 'none' });
  const layer = document.createElement('div');
  layer.className = 'first-run-visual';
  layer.setAttribute('inert', '');
  layer.setAttribute('aria-hidden', 'true');
  layer.append(copy);
  return { layer, mount() { document.body.append(layer); scrolls.forEach(([node, top, left]) => { node.scrollTop = top; node.scrollLeft = left; }); } };
}

// Never transform a container of viewport-fixed controls. Moving its immediate
// content leaves scroll ownership, keyboard geometry and footer anchors intact.
function movingContent(surface) {
  return [...surface.children].filter(node => ![node, ...node.querySelectorAll('*')].some(child => getComputedStyle(child).position === 'fixed'));
}

export function playFirstRunMotion(surface, outgoing, { back = false, utility = false } = {}) {
  stopFirstRunMotion(surface);
  if (!surface || reduced() || !surface.animate) return () => {};
  const { duration, travel, easing, utilityDuration } = FIRST_RUN_MOTION;
  const timing = { duration: utility ? utilityDuration : duration, easing, fill: 'both' };
  const animations = [];
  const x = back ? -travel : travel;
  // Incoming is already readable on the first frame; outgoing fades over it.
  animations.push(surface.animate([{ opacity: .88 }, { opacity: 1 }], timing));
  if (!utility) for (const node of movingContent(surface))
    animations.push(node.animate([{ transform: `translate3d(${x}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], timing));
  if (outgoing) {
    outgoing.mount();
    animations.push(outgoing.layer.firstElementChild.animate([
      { opacity: 1, transform: 'translate3d(0,0,0)' },
      { opacity: 0, transform: utility ? 'translate3d(0,0,0)' : `translate3d(${-x}px,0,0)` },
    ], timing));
  }
  let timer;
  const clear = () => {
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    outgoing?.layer.remove();
    window.removeEventListener('resize', clear);
    window.removeEventListener('pagehide', clear);
    document.removeEventListener('visibilitychange', clear);
    surface.removeEventListener('pointerdown', clear, true);
    surface.removeEventListener('keydown', clear, true);
    if (running.get(surface) === clear) running.delete(surface);
  };
  running.set(surface, clear);
  timer = setTimeout(clear, timing.duration);
  window.addEventListener('resize', clear);
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', clear);
  surface.addEventListener('pointerdown', clear, true);
  surface.addEventListener('keydown', clear, true);
  return clear;
}

// Renderer for the SAME shared recognizer. Full-width gesture distances still
// use its unchanged thresholds, but first-run motion stays within 24px.
export function firstRunBackMotion(surface, parentSnapshot, utility = false) {
  if (reduced()) return null;
  stopFirstRunMotion(surface);
  const parent = parentSnapshot?.layer.cloneNode(true);
  const nodes = movingContent(surface);
  const styles = [surface, ...nodes].map(node => [node, node.getAttribute('style')]);
  const width = surface.getBoundingClientRect().width;
  let mounted = false, direction = 1;
  return {
    render(x, ms) {
      if (!mounted) { if (parent) document.body.append(parent); mounted = true; }
      // The existing questionnaire Forward gesture shares this renderer too.
      // Keep its leftward motion compact without revealing a Back destination.
      if (x) direction = Math.sign(x);
      const progress = Math.max(0, Math.min(1, Math.abs(x) / width));
      const transition = ms ? `transform ${ms}ms ${FIRST_RUN_MOTION.easing}, opacity ${ms}ms ${FIRST_RUN_MOTION.easing}` : 'none';
      if (parent) {
        parent.style.transition = transition;
        parent.style.opacity = String(direction > 0 ? progress : 0);
        parent.firstElementChild.style.transition = transition;
        parent.firstElementChild.style.transform = utility ? 'none' : `translate3d(${-FIRST_RUN_MOTION.travel * (1 - progress)}px,0,0)`;
      }
      for (const node of nodes) {
        node.style.transition = transition;
        if (!utility) node.style.transform = `translate3d(${direction * FIRST_RUN_MOTION.travel * progress}px,0,0)`;
      }
      surface.style.transition = transition;
      surface.style.opacity = String(1 - .12 * progress);
    },
    clear() {
      parent?.remove();
      if (mounted) for (const [node, style] of styles) {
        if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
      }
    },
  };
}
