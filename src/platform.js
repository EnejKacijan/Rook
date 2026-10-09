import { Capacitor } from '@capacitor/core';

// Host capabilities live here; training-domain modules never depend on Capacitor.
export function detectPlatform(bridge = Capacitor) {
  const native = bridge.isNativePlatform();
  const platform = native ? bridge.getPlatform() : 'web';
  return Object.freeze({
    platform,
    isNative: native,
    isIOSNative: native && platform === 'ios',
    hasPlugin: name => native && bridge.isPluginAvailable(name),
  });
}

export const rookPlatform = detectPlatform();
