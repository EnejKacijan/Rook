import { rookPlatform } from './platform.js';

export function registerWebServiceWorker({ platform = rookPlatform, nav = globalThis.navigator,
  win = globalThis.window } = {}) {
  if (platform.isNative || !nav || !('serviceWorker' in nav) || !win) return () => {};
  const register = () => { void nav.serviceWorker.register('/sw.js').catch(() => {}); };
  win.addEventListener('load', register, { once: true });
  return () => win.removeEventListener('load', register);
}
