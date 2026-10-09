// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { Style } from '@capacitor/status-bar';
import { bindNativeShell, statusBarStyleFor } from './nativeShell.js';

it('maps all theme appearances to readable iOS status-bar text', async () => {
  expect(statusBarStyleFor('dark')).toBe(Style.Dark);
  expect(statusBarStyleFor('light')).toBe(Style.Light);
  const statusBar = { setStyle: vi.fn().mockResolvedValue(undefined) };
  const platform = { isIOSNative: true, hasPlugin: () => true };
  document.documentElement.dataset.appearance = 'light';
  const release = bindNativeShell({ platform, statusBar });
  expect(document.documentElement.classList.contains('ios-native')).toBe(true);
  expect(statusBar.setStyle).toHaveBeenCalledWith({ style: Style.Light });
  document.documentElement.dataset.appearance = 'dark';
  await Promise.resolve();
  expect(statusBar.setStyle).toHaveBeenCalledWith({ style: Style.Dark });
  release();
  expect(document.documentElement.classList.contains('ios-native')).toBe(false);
});

it('leaves web DOM and status bar untouched', () => {
  const statusBar = { setStyle: vi.fn() };
  bindNativeShell({ platform: { isIOSNative: false }, statusBar })();
  expect(statusBar.setStyle).not.toHaveBeenCalled();
});
