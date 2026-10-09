import { expect, it, vi } from 'vitest';
import { registerWebServiceWorker } from './webServiceWorker.js';

it('registers the existing PWA worker on web load and cleans its listener', () => {
  const register = vi.fn().mockResolvedValue(undefined);
  const listeners = new Map();
  const win = { addEventListener: vi.fn((name, fn) => listeners.set(name, fn)), removeEventListener: vi.fn() };
  const release = registerWebServiceWorker({ platform: { isNative: false }, nav: { serviceWorker: { register } }, win });
  expect(register).not.toHaveBeenCalled();
  listeners.get('load')();
  expect(register).toHaveBeenCalledWith('/sw.js');
  release();
  expect(win.removeEventListener).toHaveBeenCalledWith('load', listeners.get('load'));
});

it('never registers the PWA worker in a packaged native host', () => {
  const win = { addEventListener: vi.fn() };
  registerWebServiceWorker({ platform: { isNative: true }, nav: { serviceWorker: { register: vi.fn() } }, win })();
  expect(win.addEventListener).not.toHaveBeenCalled();
});
