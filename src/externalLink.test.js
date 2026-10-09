import { describe, expect, it, vi } from 'vitest';
import { handleExternalLinkClick, openNativeExternalLink } from './externalLink.js';

const ios = { isIOSNative: true, hasPlugin: () => true };
const web = { isIOSNative: false, hasPlugin: () => false };

describe('external links', () => {
  it('leaves web navigation to the browser', async () => {
    const browser = { open: vi.fn() };
    expect(await openNativeExternalLink('https://example.com', { platform: web, browser })).toBe(false);
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('opens external links outside the native WebView', async () => {
    const browser = { open: vi.fn().mockResolvedValue() };
    expect(await openNativeExternalLink('https://example.com/path', { platform: ios, browser })).toBe(true);
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://example.com/path', presentationStyle: 'popover' });
  });

  it('fails closed for unsupported native links and missing plugin', async () => {
    await expect(openNativeExternalLink('file:///private/data', { platform: ios, browser: {} })).rejects.toThrow('Unsupported');
    await expect(openNativeExternalLink('https://example.com', { platform: { ...ios, hasPlugin: () => false } })).rejects.toThrow('unavailable');
  });

  it('does not intercept web navigation', () => {
    const preventDefault = vi.fn();
    handleExternalLinkClick({ button: 0, preventDefault }, 'https://example.com', { platform: web });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
