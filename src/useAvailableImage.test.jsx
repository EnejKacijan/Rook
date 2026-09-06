import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAvailableImage } from './useAvailableImage.js';
let root, host, result;
function Harness({ source }) { result = useAvailableImage(source); return null; }
async function render(source) { await act(async () => root.render(<Harness source={source} />)); }
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('keeps a usable source and treats absent artwork as absent', async () => {
  await render('/art/a.svg'); expect(result.source).toBe('/art/a.svg');
  await render(null); expect(result.source).toBeNull();
});
it('hides a failed source without suppressing another exercise', async () => {
  await render('/art/a.svg'); await act(async () => result.onError()); expect(result.source).toBeNull();
  await render('/art/b.svg'); expect(result.source).toBe('/art/b.svg');
});
it('retries failed artwork after reconnect', async () => {
  await render('/art/a.svg'); await act(async () => result.onError());
  await act(async () => window.dispatchEvent(new Event('online'))); expect(result.source).toBe('/art/a.svg');
});
it('cleans up its reconnect listener', async () => {
  const remove = vi.spyOn(window, 'removeEventListener'); await render('/art/a.svg');
  await act(async () => root.render(null)); expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
});
