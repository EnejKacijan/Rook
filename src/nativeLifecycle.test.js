import { expect, it, vi } from 'vitest';
import { subscribeNativeForeground } from './nativeLifecycle.js';

const native = { isNative: true, hasPlugin: name => name === 'App' };

it('refreshes only on native foreground and removes the listener', async () => {
  const remove = vi.fn();
  let listener;
  const callback = vi.fn();
  const app = { addListener: vi.fn((_name, handler) => { listener = handler; return Promise.resolve({ remove }); }) };
  const release = subscribeNativeForeground(callback, { platform: native, app });
  await Promise.resolve();
  listener({ isActive: false });
  listener({ isActive: true });
  expect(callback).toHaveBeenCalledOnce();
  release();
  expect(remove).toHaveBeenCalledOnce();
});

it('does not leave a listener when unmounted before registration resolves', async () => {
  const remove = vi.fn();
  const app = { addListener: () => Promise.resolve({ remove }) };
  subscribeNativeForeground(vi.fn(), { platform: native, app })();
  await Promise.resolve();
  expect(remove).toHaveBeenCalledOnce();
  const webAdd = vi.fn();
  subscribeNativeForeground(vi.fn(), { platform: { isNative: false }, app: { addListener: webAdd } })();
  expect(webAdd).not.toHaveBeenCalled();
});
