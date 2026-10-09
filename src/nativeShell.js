import { StatusBar, Style } from '@capacitor/status-bar';
import { rookPlatform } from './platform.js';

export function statusBarStyleFor(appearance) {
  // Capacitor's names describe the background: Dark = light text.
  return appearance === 'dark' ? Style.Dark : Style.Light;
}

export function bindNativeShell({ platform = rookPlatform, doc = globalThis.document,
  statusBar = StatusBar, Observer = globalThis.MutationObserver } = {}) {
  if (!platform.isIOSNative || !doc?.documentElement) return () => {};
  const html = doc.documentElement;
  html.classList.add('ios-native');
  let lastAppearance;
  const update = () => {
    const appearance = html.dataset.appearance === 'dark' ? 'dark' : 'light';
    if (appearance === lastAppearance) return;
    lastAppearance = appearance;
    if (platform.hasPlugin('StatusBar'))
      void statusBar.setStyle({ style: statusBarStyleFor(appearance) }).catch(() => {});
  };
  update();
  const observer = Observer ? new Observer(update) : null;
  observer?.observe(html, { attributes: true, attributeFilter: ['data-appearance'] });
  return () => { observer?.disconnect(); html.classList.remove('ios-native'); };
}
