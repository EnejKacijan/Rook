import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from './platform.js';

describe('ROOK host detection', () => {
  it('distinguishes web/PWA from a native iOS host', () => {
    const web = detectPlatform({ isNativePlatform: () => false, getPlatform: () => 'ios', isPluginAvailable: vi.fn() });
    expect(web).toMatchObject({ platform: 'web', isNative: false, isIOSNative: false });
    expect(web.hasPlugin('App')).toBe(false);
    const ios = detectPlatform({ isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: name => name === 'App' });
    expect(ios).toMatchObject({ platform: 'ios', isNative: true, isIOSNative: true });
    expect(ios.hasPlugin('App')).toBe(true);
    expect(ios.hasPlugin('Haptics')).toBe(false);
  });
});
