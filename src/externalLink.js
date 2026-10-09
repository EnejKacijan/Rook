import { Browser } from '@capacitor/browser';
import { rookPlatform } from './platform.js';

// The native WebView must not navigate away from ROOK for external destinations.
// Returning false leaves ordinary web anchors (including keyboard behavior) intact.
export async function openNativeExternalLink(url, { platform = rookPlatform, browser = Browser } = {}) {
  if (!platform.isIOSNative) return false;
  if (!platform.hasPlugin('Browser')) throw new Error('External links are unavailable on this device.');
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported external link.');
  await browser.open({ url: parsed.href, presentationStyle: 'popover' });
  return true;
}

export function handleExternalLinkClick(event, url, options) {
  if (!(options?.platform || rookPlatform).isIOSNative) return;
  if (!event || event.defaultPrevented) return;
  event.preventDefault();
  void openNativeExternalLink(url, options).catch(() => {
    // Deliberately do not navigate ROOK's WebView on failure.
  });
}
