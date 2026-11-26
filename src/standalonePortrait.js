import { standaloneNavigation } from './edgeBack.js';
import { rookPlatform } from './platform.js';

export function bindStandalonePortrait(win = globalThis.window, platform = rookPlatform) {
  const doc = win?.document;
  const screen = win?.screen;
  const dialog = doc?.getElementById('rook-portrait-notice');
  if (!dialog || platform.isNative || !standaloneNavigation(win) ||
      !win.matchMedia?.('(pointer: coarse)').matches ||
      Math.min(screen.width, screen.height) > 600) return () => {};

  const orientation = screen.orientation;
  const update = () => {
    // Viewport dimensions can look landscape when the portrait keyboard opens.
    const landscape = orientation?.type
      ? orientation.type.startsWith('landscape')
      : typeof win.orientation === 'number'
        ? Math.abs(win.orientation) === 90
        : screen.width > screen.height;
    if (landscape && !dialog.open) dialog.showModal?.();
    else if (!landscape && dialog.open) dialog.close?.();
  };
  const resume = async () => {
    update();
    if (doc.visibilityState === 'hidden') return;
    try { await orientation?.lock?.('portrait'); }
    catch { /* The portrait notice covers a platform that declines the lock. */ }
  };
  const keepOpen = event => event.preventDefault();
  dialog.addEventListener('cancel', keepOpen);
  orientation?.addEventListener?.('change', update);
  win.addEventListener('orientationchange', update);
  win.addEventListener('resize', update);
  win.addEventListener('pageshow', resume);
  doc.addEventListener('visibilitychange', resume);
  void resume();
  return () => {
    dialog.removeEventListener('cancel', keepOpen);
    orientation?.removeEventListener?.('change', update);
    win.removeEventListener('orientationchange', update);
    win.removeEventListener('resize', update);
    win.removeEventListener('pageshow', resume);
    doc.removeEventListener('visibilitychange', resume);
    if (dialog.open) dialog.close?.();
  };
}
