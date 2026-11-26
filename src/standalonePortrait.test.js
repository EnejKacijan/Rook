import { afterEach, expect, it, vi } from 'vitest';
import { bindStandalonePortrait } from './standalonePortrait.js';

let release;
afterEach(() => {
  release?.();
  release = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function fixture({ installed = true, touch = true, native = false, legacy = false } = {}) {
  document.body.innerHTML = '<dialog id="rook-portrait-notice"></dialog>';
  const notice = document.querySelector('dialog');
  notice.showModal = vi.fn(() => notice.setAttribute('open', ''));
  notice.close = vi.fn(() => notice.removeAttribute('open'));
  const orientation = Object.assign(new EventTarget(), {
    type: 'portrait-primary',
    lock: vi.fn().mockRejectedValue(new DOMException('Unavailable', 'NotSupportedError')),
  });
  vi.stubGlobal('screen', { width: 393, height: 852, orientation: legacy ? undefined : orientation });
  vi.stubGlobal('matchMedia', query => ({ matches: query === '(pointer: coarse)' ? touch : installed }));
  release = bindStandalonePortrait(window, { isNative: native });
  return { notice, orientation };
}

it('requests portrait on installed phones and covers landscape when the lock is declined', () => {
  const { notice, orientation } = fixture();
  expect(orientation.lock).toHaveBeenCalledWith('portrait');
  expect(notice.open).toBe(false);
  orientation.type = 'landscape-primary';
  orientation.dispatchEvent(new Event('change'));
  expect(notice.open).toBe(true);
  expect(notice.dispatchEvent(new Event('cancel', { cancelable: true }))).toBe(false);
  orientation.type = 'portrait-primary';
  orientation.dispatchEvent(new Event('change'));
  expect(notice.open).toBe(false);
});

it('leaves the portrait app accessible when a keyboard makes its viewport shorter', () => {
  const { notice } = fixture();
  vi.stubGlobal('innerHeight', 300);
  window.dispatchEvent(new Event('resize'));
  expect(notice.open).toBe(false);
});

it('uses the legacy device angle when screen.orientation is unavailable', () => {
  vi.stubGlobal('orientation', 0);
  const { notice } = fixture({ legacy: true });
  window.orientation = -90;
  window.dispatchEvent(new Event('orientationchange'));
  expect(notice.open).toBe(true);
  window.orientation = 0;
  window.dispatchEvent(new Event('orientationchange'));
  expect(notice.open).toBe(false);
});

it.each([{ installed: false }, { touch: false }, { native: true }])('leaves other shells alone (%j)', options => {
  const { notice, orientation } = fixture(options);
  orientation.type = 'landscape-primary';
  orientation.dispatchEvent(new Event('change'));
  expect(orientation.lock).not.toHaveBeenCalled();
  expect(notice.open).toBe(false);
});
