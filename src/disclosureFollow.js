// One rule for every in-page expansion: when a section opens below the
// visible area, the real scroll container moves with the height animation,
// just far enough to show the new content. The trigger stays as the top
// orientation point, so a long section shows its start, never its end.
// Nothing moves when the content is already visible, when the user scrolls,
// or when the change was not caused by the user.

const MARGIN = 12;
const USER_WINDOW = 1000;
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
let lastActivation = -Infinity, lastTarget = null, lastTargetTop = null, listening = false;
const CONTROL = 'summary,[aria-expanded],button,[role="button"]';

const now = () => globalThis.performance?.now?.() ?? Date.now();
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  // Remember where the pressed control was before React re-renders, so a
  // section collapsing above it (accordions) cannot carry it away.
  const mark = event => {
    lastActivation = now();
    if (!(event.target instanceof Element)) return;
    lastTarget = event.target.closest(CONTROL) || event.target;
    lastTargetTop = lastTarget.getBoundingClientRect().top;
  };
  for (const type of ['pointerdown', 'keydown', 'click']) document.addEventListener(type, mark, {capture: true, passive: true});
}
listen();

export function markUserActivation(time = now(), target = null) { lastActivation = time; lastTarget = target; lastTargetTop = target?.getBoundingClientRect().top ?? null; }
export function recentUserActivation(time = now()) { return time - lastActivation <= USER_WINDOW; }

export function scrollContainerFor(node) {
  for (let element = node?.parentElement; element; element = element.parentElement) {
    if (element === document.body || element === document.documentElement) break;
    const style = getComputedStyle(element);
    // Called after the section has its final layout height, so a container
    // that grows with its content (overflow set, height unconstrained) is skipped.
    if (/(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return element;
  }
  return document.scrollingElement || document.documentElement;
}

let safeAreaProbe;
function safeAreaBottom() {
  if (typeof document === 'undefined' || !document.body) return 0;
  if (!safeAreaProbe?.isConnected) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.setAttribute('aria-hidden', 'true');
    safeAreaProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.append(safeAreaProbe);
  }
  return safeAreaProbe.getBoundingClientRect().height || 0;
}

// A sticky or fixed element that covers an edge of the scroller (sheet header,
// profile header, sticky action footer, bottom navigation).
function pinnedAncestor(element, scroller, node) {
  for (let current = element; current && current !== scroller && current !== document.body; current = current.parentElement) {
    if (current.contains(node)) return null;
    const position = getComputedStyle(current).position;
    if (position === 'sticky' || position === 'fixed') return current;
  }
  return null;
}

function probe(x, y, scroller, node) {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const element of document.elementsFromPoint(x, y)) {
    const pinned = pinnedAncestor(element, scroller, node);
    if (pinned) return pinned.getBoundingClientRect();
    if (element === scroller) return null;
  }
  return null;
}

export function visibleArea(scroller, node) {
  const page = scroller === document.scrollingElement || scroller === document.documentElement;
  const viewport = globalThis.visualViewport;
  const windowTop = viewport ? viewport.offsetTop : 0;
  const windowBottom = viewport ? viewport.offsetTop + viewport.height : globalThis.innerHeight;
  const rect = page ? {top: 0, bottom: globalThis.innerHeight, left: 0, right: globalThis.innerWidth} : scroller.getBoundingClientRect();
  let top = Math.max(rect.top, windowTop), bottom = Math.min(rect.bottom, windowBottom);
  const nodeRect = node.getBoundingClientRect();
  const x = Math.min(Math.max((nodeRect.left + nodeRect.right) / 2 || (rect.left + rect.right) / 2, rect.left + 1), rect.right - 1);
  for (let step = 0; step < 3; step += 1) {
    const cover = probe(x, top + 1, scroller, node);
    if (!cover || cover.bottom <= top) break;
    top = cover.bottom;
  }
  for (let step = 0; step < 3; step += 1) {
    const cover = probe(x, bottom - 1, scroller, node);
    if (!cover || cover.top >= bottom) break;
    bottom = cover.top;
  }
  // The keyboard and home indicator: only when nothing pinned already sits there.
  if (bottom >= windowBottom - 1) bottom = windowBottom - safeAreaBottom();
  return {top: top + MARGIN, bottom: bottom - MARGIN};
}

// How far to scroll once the section reaches `finalHeight`.
export function revealDistance({anchorTop, nodeTop, finalHeight, area, maxScroll}) {
  const overflow = nodeTop + finalHeight - area.bottom;
  if (overflow <= 0) return 0;
  const room = Math.min(anchorTop, nodeTop) - area.top;
  return Math.max(0, Math.min(overflow, room, maxScroll));
}

function controlsNode(control, node) {
  return (control?.getAttribute('aria-controls') || '').split(/\s+/).some(id => {
    const region = id && document.getElementById(id);
    return region && (region === node || node.contains(region));
  });
}

function activatedTriggerFor(node) {
  const control = lastTarget?.closest?.(CONTROL);
  if (control?.isConnected && recentUserActivation() && !node.contains(control) &&
      (controlsNode(control, node) || control.matches('summary,[aria-expanded="true"]'))) {
    // Widen to the whole header block that owns the section (a card header,
    // a summary row), so its padding and title stay in view together.
    let block = control;
    while (block.parentElement && !block.parentElement.contains(node)) block = block.parentElement;
    // Same scroll area is insufficient: snackbar Undo and unrelated page
    // actions must not become an anchor for a notice that happens to reopen.
    if (controlsNode(control, node)) return block;
    if (block.parentElement === node.parentElement) {
      for (let sibling = block.nextElementSibling; sibling; sibling = sibling.nextElementSibling)
        if (sibling === node) return block;
    }
  }
  return null;
}

// Only an owning activation is an anchor. Forced/programmatic openings use
// the section's own controller instead of a recent, unrelated page action.
function triggerFor(node) {
  const activated = activatedTriggerFor(node);
  if (activated) return activated;
  const controller = [...document.querySelectorAll('[aria-controls]')].find(element => controlsNode(element, node));
  if (controller) return controller;
  const active = document.activeElement;
  if (active && active !== document.body && controlsNode(active, node)) return active;
  for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    const bounds = sibling.getBoundingClientRect();
    if (bounds.height > 2 && bounds.width > 2) return sibling;
  }
  return node.parentElement;
}

// Starts following an opening disclosure. The trigger is the anchor: each
// frame it is placed on a path from where the user pressed it to where it
// must end for the new content to be visible. Progress is the section's own
// animated height, so scrolling and expanding share one curve and end on the
// same frame, and any section collapsing above is absorbed instead of
// pulling the trigger away.
export function followDisclosure(node, {from, to, animated, force = false, onTakeover}) {
  if (!node?.isConnected || to - from < 1 || (!force && !recentUserActivation())) return null;
  const scroller = scrollContainerFor(node);
  if (!scroller) return null;
  // Only a press inside the same scroll area counts: an Undo in a snackbar
  // or a tab switch may reopen a notice, but should not move the page.
  if (!force && !(lastTarget?.isConnected && scroller.contains(lastTarget) && activatedTriggerFor(node))) return null;
  const trigger = triggerFor(node);
  const anchor = trigger && !node.contains(trigger) && trigger !== scroller && scroller.contains(trigger) ? trigger : node;
  const area = visibleArea(scroller, node);
  const anchorNow = anchor.getBoundingClientRect().top;
  const pressedShift = lastTarget?.isConnected && anchor.contains(lastTarget) && lastTargetTop != null && recentUserActivation() ? lastTarget.getBoundingClientRect().top - lastTargetTop : 0;
  const anchorStart = anchorNow - pressedShift;
  const nodeOffset = node.getBoundingClientRect().top - anchorNow;
  // The node already has its final layout height; WAAPI only animates the paint.
  // A shift since the press (for example a section collapsing above) is
  // absorbed by the path below, so only the plain remaining range counts.
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) + Math.max(0, anchorStart - anchorNow);
  const distance = revealDistance({anchorTop: anchorStart, nodeTop: anchorStart + Math.max(0, nodeOffset), finalHeight: to, area, maxScroll});
  // Nothing to reveal and nothing moving above: leave the page alone.
  if (distance < 1 && Math.abs(anchorNow - anchorStart) < 1 && !animated) return null;
  let stopped = false, frame = 0, written = scroller.scrollTop;
  // Native page-scroll events are dispatched on Document, not <html>.
  const scrollEvents = scroller === document.scrollingElement || scroller === document.documentElement ? document : scroller;
  const place = progress => {
    if (!anchor.isConnected) return;
    const target = anchorStart - distance * progress;
    const shift = anchor.getBoundingClientRect().top - target;
    if (Math.abs(shift) >= .5) { scroller.scrollTop += shift; }
    written = scroller.scrollTop;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const type of TAKEOVER_EVENTS) scroller.removeEventListener(type, takeover);
    scrollEvents.removeEventListener('scroll', external);
  };
  const takeover = () => { if (stopped) return; onTakeover?.(); stop(); };
  // Any scroll we did not write is the user (or the browser) taking over.
  const external = () => { if (Math.abs(scroller.scrollTop - written) > 2) takeover(); };
  for (const type of TAKEOVER_EVENTS) scroller.addEventListener(type, takeover, {passive: true});
  scrollEvents.addEventListener('scroll', external, {passive: true});
  if (!animated || reducedMotion()) {
    // Sections that close in the same commit settle after this one; place
    // again on the next frame so the final position accounts for them.
    place(1);
    frame = requestAnimationFrame(() => { if (!stopped) place(1); stop(); });
    return {stop, finish() {}};
  }
  const progressNow = () => Math.min(1, Math.max(0, (node.getBoundingClientRect().height - from) / (to - from)));
  const tick = () => {
    if (stopped) return;
    if (!node.isConnected) { stop(); return; }
    place(progressNow());
    frame = requestAnimationFrame(tick);
  };
  place(0);
  frame = requestAnimationFrame(tick);
  return {
    stop,
    finish() { if (stopped) return; place(1); stop(); },
  };
}
