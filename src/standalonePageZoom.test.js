import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindStandalonePageZoom, PAGE_ZOOM_PREFERENCE, setStandalonePageZoomAllowed, standalonePageZoomMode } from './standalonePageZoom.js';

let release, media, standalone;
const target = () => document.querySelector('#root main');
function touch(type, node = target(), count = 1, targets) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, (_, i) => ({ identifier: i, target: targets?.[i] || node })) });
  node.dispatchEvent(event);
  return event;
}
function gesture(type, node = target()) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  node.dispatchEvent(event); return event;
}
beforeEach(() => {
  standalone = false;
  media = new EventTarget(); Object.defineProperty(media, 'matches', { get: () => standalone });
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  localStorage.removeItem(PAGE_ZOOM_PREFERENCE);
  document.body.innerHTML = '<div id="root"><main class="screen"><input value="42"><button>Action</button></main></div><aside id="outside">Outside app</aside>';
});
afterEach(() => { release?.(); release = null; document.body.innerHTML = ''; localStorage.removeItem(PAGE_ZOOM_PREFERENCE); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() { release = bindStandalonePageZoom(); }
function install() { standalone = true; mount(); }

it('uses real PWA signals rather than mobile width, user agent or installability', () => {
  expect(standalonePageZoomMode()).toBe('browser');
  expect(standalonePageZoomMode({ navigator: { standalone: true }, localStorage })).toBe('locked');
  standalone = true; expect(standalonePageZoomMode()).toBe('locked');
});
it('leaves browser mode without touch interceptors, scale mutations or a lock attribute', () => {
  const add = vi.spyOn(document, 'addEventListener'); mount();
  expect(add.mock.calls.some(([name]) => name === 'touchmove' || name === 'gesturestart')).toBe(false);
  expect(document.documentElement.hasAttribute('data-rook-page-zoom')).toBe(false);
  touch('touchstart'); expect(touch('touchmove', target(), 2).defaultPrevented).toBe(false);
  expect(gesture('gesturestart').defaultPrevented).toBe(false);
});
it('leaves the native container in charge even if it reports a standalone display mode', () => {
  standalone = true; release = bindStandalonePageZoom(window, { isNative: true });
  expect(document.documentElement.hasAttribute('data-rook-page-zoom')).toBe(false);
  expect(gesture('gesturestart').defaultPrevented).toBe(false);
});
it('blocks only multi-touch page gestures, and lets owners still receive events', () => {
  install(); const listener = vi.fn(); target().addEventListener('touchmove', listener);
  touch('touchstart'); expect(touch('touchmove').defaultPrevented).toBe(false);
  expect(touch('touchmove', target(), 2).defaultPrevented).toBe(true);
  expect(gesture('gesturestart').defaultPrevented).toBe(true);
  expect(gesture('gesturechange', document).defaultPrevented).toBe(true);
  expect(listener).toHaveBeenCalledTimes(2);
});
it.each(['.modal-layer', '.workout-confirm-layer', '.building-overlay', '.rook-snackbar'])('protects the %s body portal', owner => {
  document.body.insertAdjacentHTML('beforeend', `<div class="${owner.slice(1)}"><section>Portal</section></div>`);
  install(); const node = document.querySelector(`${owner} section`);
  touch('touchstart', node); expect(touch('touchmove', node, 2).defaultPrevented).toBe(true);
});
it('does not interfere with controls, input focus, values or one-finger gestures', () => {
  install(); const input = document.querySelector('input'); input.focus();
  touch('touchstart', input); expect(touch('touchmove', input).defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input); expect(input.value).toBe('42');
  expect(gesture('click', document.querySelector('button')).defaultPrevented).toBe(false);
  expect(gesture('wheel').defaultPrevented).toBe(false);
});
it('does not block touches that originated outside ROOK', () => {
  install(); const outside = document.querySelector('#outside'); touch('touchstart', outside);
  expect(touch('touchmove', outside, 2).defaultPrevented).toBe(false);
  expect(gesture('gesturestart', outside).defaultPrevented).toBe(false);
});
it.each(['native', 'custom'])('preserves an explicit %s zoom owner and its pointer events', owner => {
  target().insertAdjacentHTML('beforeend', `<div data-rook-zoom="${owner}"><img alt="Visual"></div>`);
  install(); const image = document.querySelector('img'); touch('touchstart', image);
  expect(touch('touchmove', image, 2).defaultPrevented).toBe(false);
  expect(gesture('gesturestart', image).defaultPrevented).toBe(false);
  expect(gesture('pointerdown', image).defaultPrevented).toBe(false);
});
it('does not extend a native visual exception to a second finger on app chrome', () => {
  target().insertAdjacentHTML('beforeend', '<div data-rook-zoom="native"><img alt="Visual"></div>');
  install(); const image = document.querySelector('img'); touch('touchstart', image);
  expect(touch('touchmove', image, 2, [image, document.querySelector('button')]).defaultPrevented).toBe(true);
});
it('ignores zoom owners in hidden or inert layers', () => {
  target().insertAdjacentHTML('beforeend', '<div inert><div data-rook-zoom="native"><img alt="Visual"></div></div>');
  install(); const image = document.querySelector('img'); touch('touchstart', image);
  expect(touch('touchmove', image, 2).defaultPrevented).toBe(true);
});
it('resets ownership on release, cancel and blur', () => {
  target().insertAdjacentHTML('beforeend', '<div data-rook-zoom="native"><img alt="Visual"></div>');
  install(); const image = document.querySelector('img');
  for (const reset of ['touchend', 'touchcancel', 'blur']) {
    touch('touchstart', image);
    if (reset === 'blur') window.dispatchEvent(new Event('blur')); else touch(reset, image, 0);
    expect(gesture('gesturestart', target()).defaultPrevented).toBe(true);
  }
});
it('applies the saved accessibility choice immediately and after rebinding', () => {
  install(); setStandalonePageZoomAllowed(true);
  expect(standalonePageZoomMode()).toBe('allowed');
  expect(document.documentElement.hasAttribute('data-rook-page-zoom')).toBe(false);
  touch('touchstart'); expect(touch('touchmove', target(), 2).defaultPrevented).toBe(false);
  release(); mount(); expect(standalonePageZoomMode()).toBe('allowed');
  setStandalonePageZoomAllowed(false); expect(gesture('gesturestart').defaultPrevented).toBe(true);
});
it('responds to display-mode changes and removes the lock when returning to browser mode', () => {
  mount(); standalone = true; media.dispatchEvent(new Event('change'));
  expect(gesture('gesturestart').defaultPrevented).toBe(true);
  standalone = false; media.dispatchEvent(new Event('change'));
  expect(gesture('gesturestart').defaultPrevented).toBe(false);
});
it('responds to storage updates from another tab, and pageshow after suspension', () => {
  install(); localStorage.setItem(PAGE_ZOOM_PREFERENCE, 'true');
  window.dispatchEvent(new StorageEvent('storage', { key: PAGE_ZOOM_PREFERENCE }));
  expect(gesture('gesturestart').defaultPrevented).toBe(false);
  localStorage.removeItem(PAGE_ZOOM_PREFERENCE); window.dispatchEvent(new Event('pageshow'));
  expect(gesture('gesturestart').defaultPrevented).toBe(true);
});
it('survives unavailable storage and does not publish a failed preference save', () => {
  install(); vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(standalonePageZoomMode()).toBe('locked');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  expect(() => setStandalonePageZoomAllowed(true)).toThrow('full');
  expect(gesture('gesturestart').defaultPrevented).toBe(true);
});
it('disposes interceptors, restores previous state and leaves viewport metadata unchanged', () => {
  const viewport = document.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'; document.head.append(viewport);
  document.documentElement.setAttribute('data-rook-page-zoom', 'prior'); install();
  release(); release = null;
  expect(document.documentElement.getAttribute('data-rook-page-zoom')).toBe('prior');
  expect(gesture('gesturestart').defaultPrevented).toBe(false);
  expect(viewport.content).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
  document.documentElement.removeAttribute('data-rook-page-zoom'); viewport.remove();
});
