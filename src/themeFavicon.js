import { useEffect } from 'react';
import { personalThemeIconColor, rookIconSvg, ROOK_ICON_LETTER } from './personalThemes.js';

export const STABLE_FAVICON = '/icon.svg';
export function themeFaviconHref(theme) {
  const letter = personalThemeIconColor(theme);
  return letter === ROOK_ICON_LETTER ? STABLE_FAVICON : `data:image/svg+xml,${encodeURIComponent(rookIconSvg(letter))}`;
}

// Only the browser-tab icon. The manifest, apple-touch and native app icons
// stay stable: platforms read them at install time.
export function useThemeFavicon(theme, doc = globalThis.document) {
  const href = themeFaviconHref(theme);
  useEffect(() => {
    const link = doc?.querySelector('link[rel="icon"]');
    if (!link) return undefined;
    link.setAttribute('href', href);
    return () => link.setAttribute('href', STABLE_FAVICON);
  }, [href, doc]);
}
