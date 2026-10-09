import { rookPlatform } from './platform.js';

// This is a device preference, not training data or an account entitlement.
export const PAGE_ZOOM_PREFERENCE = 'rook-allow-page-zoom';
const preferenceChanged = 'rook-page-zoom-preference';
const appOwners = '#root,.modal-layer,.workout-confirm-layer,.workout-photo-viewer,.building-overlay,.rook-snackbar';
const zoomOwners = '[data-rook-zoom="native"],[data-rook-zoom="custom"]';

export function standalonePageZoomMode(win = globalThis.window, platform = rookPlatform) {
  // A native container owns its recognizers; PWA signals must not override it.
  if (platform.isNative) return 'browser';
  const standalone = win?.navigator?.standalone === true ||
    Boolean(win?.matchMedia?.('(display-mode: standalone)').matches);
  if (!standalone) return 'browser';
  try {
    if (win.localStorage.getItem(PAGE_ZOOM_PREFERENCE) === 'true') return 'allowed';
  } catch { /* Reading a blocked preference must not prevent app startup. */ }
  return 'locked';
}

export function setStandalonePageZoomAllowed(allowed, win = globalThis.window) {
  // Publish only a saved preference; the control reports storage failures.
  win.localStorage.setItem(PAGE_ZOOM_PREFERENCE, String(Boolean(allowed)));
  win.dispatchEvent(new win.Event(preferenceChanged));
}

export function subscribeStandalonePageZoom(listener, win = globalThis.window) {
  if (!win) return () => {};
  const media = win.matchMedia?.('(display-mode: standalone)');
  const storage = event => {
    if (event.key === null || event.key === PAGE_ZOOM_PREFERENCE) listener();
  };
  win.addEventListener(preferenceChanged, listener);
  win.addEventListener('storage', storage);
  win.addEventListener('pageshow', listener);
  if (media?.addEventListener) media.addEventListener('change', listener);
  else media?.addListener?.(listener);
  return () => {
    win.removeEventListener(preferenceChanged, listener);
    win.removeEventListener('storage', storage);
    win.removeEventListener('pageshow', listener);
    if (media?.removeEventListener) media.removeEventListener('change', listener);
    else media?.removeListener?.(listener);
  };
}

export function bindStandalonePageZoom(win = globalThis.window, platform = rookPlatform) {
  const doc = win?.document, html = doc?.documentElement;
  if (!html) return () => {};
  const previous = html.getAttribute('data-rook-page-zoom');
  let listening = false, origin = null;
  const element = target => target?.nodeType === 1 ? target : target?.parentElement;
  const start = event => {
    if (event.touches.length === 1 || !origin) origin = element(event.target);
  };
  const zoomOwner = target => target?.closest?.(zoomOwners);
  const exempt = event => {
    const owner = zoomOwner(origin || element(event.target));
    if (!owner || owner.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
    // An image pinch cannot borrow its exception for a second finger on chrome.
    return !event.touches || [...event.touches].every(touch =>
      owner.contains(element(touch.target) || element(event.target)));
  };
  const preventPagePinch = event => {
    const target = origin || element(event.target);
    if (!target?.closest?.(appOwners) || exempt(event) || !event.cancelable) return;
    event.preventDefault();
    // Never stop propagation: nested owners must still cancel their one-finger
    // drag/pager, or receive their custom comparison pinch pointer stream.
  };
  const move = event => {
    if (event.touches.length > 1) preventPagePinch(event);
  };
  const finish = event => { if (!event.touches.length) origin = null; };
  const cancel = () => { origin = null; };
  const events = [
    ['touchstart', start, true], ['touchmove', move, false],
    ['touchend', finish, true], ['touchcancel', cancel, true],
    // Safari's GestureEvents complement touch-action for page-scale rubber
    // banding. Do not rewrite viewport scale or react to keyboard resizing.
    ['gesturestart', preventPagePinch, false], ['gesturechange', preventPagePinch, false],
  ];
  const detach = () => {
    if (!listening) return;
    events.forEach(([name, handler]) => doc.removeEventListener(name, handler, true));
    win.removeEventListener('blur', cancel);
    listening = false; cancel();
  };
  const update = () => {
    const locked = standalonePageZoomMode(win, platform) === 'locked';
    if (locked) html.setAttribute('data-rook-page-zoom', 'locked');
    else html.removeAttribute('data-rook-page-zoom');
    if (locked && !listening) {
      events.forEach(([name, handler, passive]) => doc.addEventListener(name, handler, { capture: true, passive }));
      win.addEventListener('blur', cancel);
      listening = true;
    } else if (!locked) detach();
  };
  const releasePreference = subscribeStandalonePageZoom(update, win);
  update();
  return () => {
    releasePreference(); detach();
    if (previous === null) html.removeAttribute('data-rook-page-zoom');
    else html.setAttribute('data-rook-page-zoom', previous);
  };
}
