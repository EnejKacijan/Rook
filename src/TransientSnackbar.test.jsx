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
const advance = ms => act(() => vi.advanceTimersByTime(ms));
function pointer(target, type, x, y = 100, stamp = null, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId, isPrimary: true, clientX: x, clientY: y }))
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
it('rejects upward motion and cleans pointercancel', () => {
  show(); pointer(snackbar(), 'pointerdown', 10);
  const vertical = pointer(window, 'pointermove', 13, 55);
  expect(vertical.defaultPrevented).toBe(false);
  expect(snackbar().style.transform).toBe('');
  pointer(window, 'pointerup', 13, 55);
  drag(10, 40); pointer(window, 'pointercancel', 40);
  expect(snackbar().style.transform).toBe('');
});
it('follows a downward drag and exits below the viewport without Undo', () => {
  show(); const node = snackbar();
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({top: window.innerHeight - 150});
  pointer(node, 'pointerdown', 100, 100, 100);
  const down = pointer(window, 'pointermove', 103, 160, 900);
  expect(down.defaultPrevented).toBe(true);
  expect(node.style.transform).toBe('translate3d(0, 60px, 0)');
  pointer(window, 'pointerup', 103, 160, 1000);
  expect(node.style.transform).toBe('translate3d(0, 234px, 0)');
  advance(169); expect(snackbar()).toBe(node);
  advance(1); expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it('settles a short downward drag, preserving the timeout through spring-back', () => {
  show(); advance(3000); const node = snackbar();
  pointer(node, 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 100, 145, 900);
  advance(5000);
  pointer(window, 'pointerup', 100, 145, 1000);
  expect(node.style.transform).toBe('');
  advance(170 + 1999); expect(snackbar()).toBe(node);
  advance(1); expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it('accepts a recent downward flick but rejects a held or reversing short drag', () => {
  show(); pointer(snackbar(), 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 100, 110, 900);
  pointer(window, 'pointermove', 100, 140, 930);
  pointer(window, 'pointerup', 100, 140, 940);
  advance(170); expect(snackbar()).toBeNull();
  show(); pointer(snackbar(), 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 100, 140, 120);
  pointer(window, 'pointerup', 100, 140, 1000);
  expect(snackbar()).not.toBeNull(); expect(snackbar().style.transform).toBe('');
  advance(170);
  pointer(snackbar(), 'pointerdown', 100, 100, 1000);
  pointer(window, 'pointermove', 100, 145, 1020);
  pointer(window, 'pointermove', 100, 132, 1040);
  pointer(window, 'pointerup', 100, 132, 1050);
  expect(snackbar()).not.toBeNull(); expect(snackbar().style.transform).toBe('');
});
it.each([[0, 70], [50, 150]])('a rejected upward or diagonal drag never activates Undo (%s, %s)', (dx, y) => {
  show(); const button = snackbar().querySelector('button');
  pointer(button, 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 100 + dx, y, 900);
  pointer(window, 'pointerup', 100 + dx, y, 1000);
  act(() => button.click());
  expect(snackbar()).not.toBeNull(); expect(snackbar().style.transform).toBe('');
  expect(rollback).not.toHaveBeenCalled();
  advance(170); act(() => button.click()); expect(rollback).toHaveBeenCalledOnce();
});
it.each(['pointercancel', 'lostpointercapture'])('cancels a downward drag on %s and keeps Undo available', reason => {
  show(); const node = snackbar();
  pointer(node, 'pointerdown', 100);
  pointer(window, 'pointermove', 100, 160);
  pointer(window, reason, 100, 160, null, 2); // Another contact cannot cancel this gesture.
  expect(node.style.transform).toBe('translate3d(0, 60px, 0)');
  pointer(window, reason, 100, 160);
  expect(node.style.transform).toBe(''); advance(170);
  act(() => node.querySelector('button').click()); expect(rollback).toHaveBeenCalledOnce();
});
it('locks the direction and does not turn a horizontal drag into downward dismissal', () => {
  show(); pointer(snackbar(), 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 120, 101, 500);
  pointer(window, 'pointermove', 120, 180, 900);
  expect(snackbar().style.transform).toBe('translate3d(20px, 0, 0)');
  pointer(window, 'pointerup', 120, 180, 1000);
  expect(snackbar()).not.toBeNull(); expect(snackbar().style.transform).toBe('');
});
it('a downward swipe starting on Undo only dismisses, including reduced motion', () => {
  reduced = true; show(); const button = snackbar().querySelector('button');
  pointer(button, 'pointerdown', 100);
  pointer(window, 'pointermove', 100, 160);
  pointer(window, 'pointerup', 100, 160);
  act(() => button.click());
  expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it('uses immediate reduced-motion settlement', () => {
  reduced = true; show(); drag(10, -100); pointer(window, 'pointerup', -100);
  expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it.each([-1, 1])('a swipe starting on Undo in direction %s cannot activate rollback', direction => {
  show(); const undo = snackbar().querySelector('button');
  pointer(undo, 'pointerdown', 150);
  pointer(window, 'pointermove', 150 + direction * 130);
  pointer(window, 'pointerup', 150 + direction * 130);
  act(() => undo.click());
  expect(rollback).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(170)); expect(snackbar()).toBeNull();
});
it('a slow sub-threshold drag settles and leaves Undo usable', () => {
  show(); const node = snackbar();
  pointer(node, 'pointerdown', 100, 100, 100);
  pointer(window, 'pointermove', 145, 100, 900);
  pointer(window, 'pointerup', 145, 100, 1000);
  expect(snackbar()).toBe(node); expect(node.style.transform).toBe('');
  act(() => vi.advanceTimersByTime(180));
  act(() => node.querySelector('button').click());
  expect(rollback).toHaveBeenCalledOnce(); expect(snackbar()).toBeNull();
});
it('an old swipe settlement cannot dismiss a newer Undo notice', () => {
  show(); drag(150, 20); pointer(window, 'pointerup', 20);
  act(() => open({message: 'New exercise removed', undo: rollback}));
  act(() => vi.advanceTimersByTime(180));
  expect(snackbar().textContent).toContain('New exercise removed');
  act(() => snackbar().querySelector('button').click());
  expect(rollback).toHaveBeenCalledOnce();
});
it('scopes a presentation-only notice class to its own lifetime', () => {
  act(() => open({message: 'Tips hidden', className: 'progression-tips-undo', undo: rollback}));
  expect(snackbar().classList.contains('progression-tips-undo')).toBe(true);
  show(); expect(snackbar().classList.contains('progression-tips-undo')).toBe(false);
});
