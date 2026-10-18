import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Snackbar} from './TransientSnackbar.jsx';

let host, root, timerBounds, resize, disconnect;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  timerBounds = {top: window.innerHeight - 74, height: 60};
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.classList.contains('rest-timer') ? timerBounds : original.call(this);
  });
  disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function render({rest = false, logger = true} = {}) {
  act(() => root.render(<main className={logger ? 'workout-screen' : 'detail-screen'}>
    {rest && <aside className="rest-timer">Rest</aside>}
    <Snackbar message="Exercise removed" onDismiss={() => {}} onPause={() => {}} onResume={() => {}} />
  </main>));
}
const inset = () => host.querySelector('.rook-snackbar').style.getPropertyValue('--snackbar-rest-inset');
it('logger reserves no invisible navigation footprint and clears the actual rest timer footprint', async () => {
  render(); expect(inset()).toBe('0px');
  render({rest: true}); await act(async () => {}); expect(inset()).toBe('82px');
  render(); await act(async () => {}); expect(inset()).toBe('0px');
});
it('keeps an eight-pixel gap above the measured timer after resize, without double-counting its safe area', () => {
  render({rest: true}); expect(inset()).toBe('82px');
  timerBounds = {top: window.innerHeight - 108, height: 76};
  act(() => resize()); expect(inset()).toBe('116px');
  timerBounds = {top: 0, height: 0}; act(() => resize()); expect(inset()).toBe('0px');
});
it('does not measure unrelated timers behind a sheet and releases observers on unmount', () => {
  render({rest: true, logger: false}); expect(inset()).toBe('');
  render({rest: true}); // Remount, as a real navigation does.
  act(() => root.render(null)); render({rest: true});
  const before = disconnect.mock.calls.length;
  act(() => root.render(null)); expect(disconnect.mock.calls.length).toBeGreaterThan(before);
});
