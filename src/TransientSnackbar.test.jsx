import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTransientSnackbar } from './TransientSnackbar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, open, rollback, reduced;
function Harness() {
  const notice = useTransientSnackbar();
  open = notice.show;
  return <div>{notice.surface}</div>;
}
const snackbar = () => host.querySelector('.rook-snackbar');
function pointer(target, type, x, y = 100, stamp = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, isPrimary: true, clientX: x, clientY: y }))
    Object.defineProperty(event, key, { value });
  if (stamp !== null) Object.defineProperty(event, 'timeStamp', { value: stamp });
  act(() => target.dispatchEvent(event));
  return event;
}
function show() { act(() => open({ message: 'Workout moved', undo: rollback })); }
function drag(start, end, y = 100) {
  pointer(snackbar(), 'pointerdown', start);
  pointer(window, 'pointermove', end, y);
}
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; rollback = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; } }));
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host); act(() => root.render(<Harness/>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('follows a horizontal pointer before release, then settles a short drag', () => {
  show(); drag(10, 37);
  expect(snackbar().style.transform).toContain('27px');
  pointer(window, 'pointerup', 37);
  expect(snackbar().style.transform).toBe('');
  expect(rollback).not.toHaveBeenCalled();
});
it.each([[120, 'right'], [-120, 'left']])('commits a %s swipe without invoking Undo', (end) => {
  show(); drag(10, end); expect(snackbar().style.transform).not.toBe('');
  pointer(window, 'pointerup', end);
  act(() => vi.advanceTimersByTime(180));
  expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it('keeps Undo independently tappable and rolls back exactly once', () => {
  show(); const undo = snackbar().querySelector('button');
  pointer(undo, 'pointerdown', 20); pointer(window, 'pointerup', 20);
  act(() => undo.click());
  expect(rollback).toHaveBeenCalledOnce(); expect(snackbar()).toBeNull();
});
it('accepts a fast intentional short swipe but not a slow short drag', () => {
  show(); pointer(snackbar(), 'pointerdown', 10, 100, 100);
  pointer(window, 'pointermove', 55, 100, 120);
  pointer(window, 'pointerup', 55, 100, 130);
  act(() => vi.advanceTimersByTime(180)); expect(snackbar()).toBeNull();
});
it('pauses the remaining auto-dismiss time while touched, then resumes after cancellation', () => {
  show(); act(() => vi.advanceTimersByTime(3000));
  pointer(snackbar(), 'pointerdown', 10);
  act(() => vi.advanceTimersByTime(5000)); expect(snackbar()).not.toBeNull();
  pointer(window, 'pointercancel', 10);
  act(() => vi.advanceTimersByTime(1999)); expect(snackbar()).not.toBeNull();
  act(() => vi.advanceTimersByTime(2)); expect(snackbar()).toBeNull();
});
it('does not double-dismiss when a timeout and swipe race', () => {
  show(); act(() => vi.advanceTimersByTime(4900)); drag(10, 130);
  act(() => vi.advanceTimersByTime(200)); expect(snackbar()).not.toBeNull();
  pointer(window, 'pointerup', 130);
  act(() => vi.advanceTimersByTime(200)); expect(snackbar()).toBeNull();
  expect(rollback).not.toHaveBeenCalled();
});
it('cedes vertical motion to scroll and cleans pointercancel', () => {
  show(); pointer(snackbar(), 'pointerdown', 10);
  const vertical = pointer(window, 'pointermove', 13, 145);
  expect(vertical.defaultPrevented).toBe(false);
  expect(snackbar().style.transform).toBe('');
  drag(10, 40); pointer(window, 'pointercancel', 40);
  expect(snackbar().style.transform).toBe('');
});
it('uses immediate reduced-motion settlement', () => {
  reduced = true; show(); drag(10, -100); pointer(window, 'pointerup', -100);
  expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
