import { App } from '@capacitor/app';
import { rookPlatform } from './platform.js';

// Subscribes only in a native host. The callback is a clock refresh, never a
// session mutation; active workout/rest elapsed time remains timestamp-derived.
export function subscribeNativeForeground(callback, { platform = rookPlatform,
  app = App } = {}) {
  if (!platform.isNative || !platform.hasPlugin('App')) return () => {};
  let disposed = false;
  let handle;
  Promise.resolve(app.addListener('appStateChange', ({ isActive }) => {
    if (isActive && !disposed) callback();
  })).then(listener => {
    if (disposed) void listener.remove();
    else handle = listener;
  }).catch(() => {});
  return () => {
    disposed = true;
    if (handle) void handle.remove();
  };
}
