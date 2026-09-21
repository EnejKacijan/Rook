import { focusNavigationTarget } from './navigationFocus.js';

// Photos are nested in memory/timeline/compare, rather than ModalLayer. Their
// body portal must keep the same modal ownership while a fading scrim exposes
// the parent. Inherit an existing document lock instead of re-locking iOS.
export function bindFullscreenPhotoScope(layer, returnFocus) {
  const doc = layer.ownerDocument, win = doc.defaultView;
  const previousFocus = returnFocus || doc.activeElement, body = doc.body;
  const siblings = [...body.children].filter(node => node !== layer && !['SCRIPT','STYLE'].includes(node.tagName));
  const prior = siblings.map(node => [node, node.hasAttribute('inert'), node.getAttribute('aria-hidden')]);
  for (const node of siblings) { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); }
  const locked = body.style.position === 'fixed', y = win.scrollY;
  const styles = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
  if (!locked) Object.assign(body.style, { position: 'fixed', top: `-${y}px`, width: '100%', overflow: 'hidden' });
  const key = event => {
    if (event.key !== 'Tab' || layer.closest('[inert]')) return;
    event.stopImmediatePropagation();
    const controls = [...layer.querySelectorAll('button:not(:disabled),[href],[tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (doc.activeElement === first || !layer.contains(doc.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || !layer.contains(doc.activeElement))) { event.preventDefault(); first.focus(); }
  };
  win.addEventListener('keydown', key, true);
  return () => {
    win.removeEventListener('keydown', key, true);
    for (const [node, inert, hidden] of prior) {
      if (!inert) node.removeAttribute('inert');
      if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
    }
    if (!locked) { Object.assign(body.style, styles); win.scrollTo(0, y); }
    win.requestAnimationFrame(() => {
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) focusNavigationTarget(previousFocus);
    });
  };
}
