// The physical page stack used by Profile, first-run routes and questionnaire
// steps. Only transforms change during tracking; the front page stays opaque.
export const PAGE_STACK_MOTION = Object.freeze({ duration: 200, parallax: 16, easing: 'cubic-bezier(.2,.8,.2,1)' });
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const running = new WeakMap();
export const stopPageNavigation = surface => running.get(surface)?.();
const restoreStyle = (node, style) => style === null ? node.removeAttribute('style') : node.setAttribute('style', style);

export function capturePageSurface(surface) {
  if (!surface || reduced()) return null;
  const bounds = surface.getBoundingClientRect(), copy = surface.cloneNode(true);
  const originals = [surface, ...surface.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
  const scrolls = [];
  copies.forEach((node, index) => {
    node.removeAttribute('id'); node.removeAttribute('autofocus');
    node.style.animation = 'none';
    if (node.matches('input,textarea,select')) node.value = originals[index].value;
    if (originals[index].scrollTop || originals[index].scrollLeft) scrolls.push([index, originals[index].scrollTop, originals[index].scrollLeft]);
  });
  return { copy, bounds, scrolls };
}

function snapshotLayer(snapshot, bounds) {
  const layer = document.createElement('div');
  layer.dataset.swipeParent = 'true';
  layer.setAttribute('inert', ''); layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', left: `${bounds.left}px`, top: '0', width: `${bounds.width}px`, height: '100dvh', overflow: 'clip', pointerEvents: 'none', background: 'var(--rook-bg)', opacity: '1' });
  if (snapshot) {
    const copy = snapshot.copy.cloneNode(true);
    Object.assign(copy.style, { position: 'absolute', margin: '0', top: `${snapshot.bounds.top}px`, left: `${snapshot.bounds.left - bounds.left}px`, width: `${snapshot.bounds.width}px`, height: `${snapshot.bounds.height}px`, maxHeight: 'none', transform: 'none' });
    layer.append(copy);
  }
  return { layer, mount(anchor) {
    anchor.after(layer);
    const nodes = layer.firstElementChild && [layer.firstElementChild, ...layer.firstElementChild.querySelectorAll('*')];
    snapshot?.scrolls.forEach(([index, top, left]) => { nodes[index].scrollTop = top; nodes[index].scrollLeft = left; });
  } };
}

// Transforming a page establishes a containing block for fixed descendants.
// Freeze their current viewport geometry once, so footers do not jump to the
// bottom of a long document. Live nodes, focus, selection and scroll stay intact.
function preparePage(surface, zIndex) {
  const original = surface.getAttribute('style'), bounds = surface.getBoundingClientRect();
  const fixed = [...surface.querySelectorAll('*')].filter(node => getComputedStyle(node).position === 'fixed');
  const anchors = fixed.map(node => [node, node.getAttribute('style'), node.getBoundingClientRect()]);
  for (const animation of surface.getAnimations?.() || []) animation.cancel();
  Object.assign(surface.style, { position: getComputedStyle(surface).position === 'static' ? 'relative' : getComputedStyle(surface).position, zIndex: String(zIndex), background: 'var(--rook-bg)', opacity: '1', animation: 'none', willChange: 'transform' });
  for (const [node, , rect] of anchors) Object.assign(node.style, { position: 'absolute', top: `${rect.top - bounds.top + surface.scrollTop}px`, left: `${rect.left - bounds.left + surface.scrollLeft}px`, right: 'auto', bottom: 'auto', width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', maxWidth: 'none' });
  return () => { restoreStyle(surface, original); anchors.forEach(([node, style]) => restoreStyle(node, style)); };
}

function physicalStack(child, parent, width, mount, dispose) {
  let mounted = false, frame = 0, nextX = 0, direction = 1;
  const animations = [];
  const positions = x => [`translate3d(${x}px,0,0)`, `translate3d(${-PAGE_STACK_MOTION.parallax * (1 - Math.abs(x) / width)}px,0,0)`];
  const ensureMounted = () => { if (!mounted) { mounted = true; mount(); } };
  const paint = (x, ms) => {
    if (x) direction = Math.sign(x);
    const values = positions(x), transition = ms ? `transform ${ms}ms ${PAGE_STACK_MOTION.easing}` : 'none';
    child.style.transition = parent.style.transition = transition;
    child.style.transform = values[0]; parent.style.transform = values[1];
    // A forward question gesture must never reveal the previous question.
    parent.style.visibility = direction < 0 ? 'hidden' : 'visible';
  };
  return {
    render(x, ms) {
      ensureMounted(); nextX = x;
      if (ms) { cancelAnimationFrame(frame); frame = 0; paint(x, ms); }
      else if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(nextX, 0); });
    },
    animate(from, to) {
      ensureMounted();
      const timing = { duration: PAGE_STACK_MOTION.duration, easing: PAGE_STACK_MOTION.easing, fill: 'both' };
      const start = positions(from), end = positions(to);
      [child, parent].forEach((node, index) => animations.push(node.animate([{ transform: start[index] }, { transform: end[index] }], timing)));
    },
    clear() { cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()); if (mounted) { mounted = false; dispose(); } },
  };
}

export function createPageBackMotion(surface, snapshot) {
  if (!surface || reduced()) return null;
  stopPageNavigation(surface);
  const bounds = surface.getBoundingClientRect(), parent = snapshotLayer(snapshot, bounds);
  let restore;
  return physicalStack(surface, parent.layer, bounds.width, () => {
    parent.mount(surface); parent.layer.style.zIndex = '1';
    restore = preparePage(surface, 2);
  }, () => { parent.layer.remove(); restore(); });
}

// Coach retains the actual history page underneath its conversation; it uses
// the same physics without making a copy of that live transcript/scroll owner.
export function createLivePageBackMotion(surface, parent) {
  if (reduced()) return null;
  if (!parent) return createPageBackMotion(surface, null);
  const width = surface.getBoundingClientRect().width;
  let restoreChild, restoreParent;
  return physicalStack(surface, parent, width, () => {
    restoreChild = preparePage(surface, 62); restoreParent = preparePage(parent, 61);
    parent.style.visibility = 'visible';
  }, () => { restoreChild(); restoreParent(); });
}

// Button navigation uses the exact same opaque stack and positions as dragging.
// The route has committed, so only its outgoing visual copy lives for 200ms.
export function playPageNavigation(surface, outgoing, { back = false } = {}) {
  stopPageNavigation(surface);
  if (!surface || reduced() || !surface.animate) return () => {};
  const bounds = surface.getBoundingClientRect();
  let motion;
  if (!back) motion = createPageBackMotion(surface, outgoing);
  else {
    const child = snapshotLayer(outgoing, bounds);
    let restore;
    motion = physicalStack(child.layer, surface, bounds.width, () => {
      child.mount(surface); child.layer.style.zIndex = '2'; restore = preparePage(surface, 1);
    }, () => { child.layer.remove(); restore(); });
  }
  motion.animate(back ? 0 : bounds.width, back ? bounds.width : 0);
  let timer;
  const clear = () => {
    clearTimeout(timer); motion.clear();
    window.removeEventListener('resize', clear); window.removeEventListener('pagehide', clear);
    document.removeEventListener('visibilitychange', clear);
    surface.removeEventListener('pointerdown', clear, true); surface.removeEventListener('keydown', clear, true);
    if (running.get(surface) === clear) running.delete(surface);
  };
  running.set(surface, clear); timer = setTimeout(clear, PAGE_STACK_MOTION.duration);
  window.addEventListener('resize', clear); window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', clear);
  surface.addEventListener('pointerdown', clear, true); surface.addEventListener('keydown', clear, true);
  return clear;
}
