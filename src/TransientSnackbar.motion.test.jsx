import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useTransientSnackbar} from './TransientSnackbar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, open, rerender, rollback, reduced, animate, originalAnimate, motions;
function Harness() {
  const notice = useTransientSnackbar(), [tick, setTick] = useState(0);
  open = notice.show; rerender = () => setTick(value => value + 1);
  return <div data-tick={tick}>{notice.surface}</div>;
}
const snackbar = () => host.querySelector('.rook-snackbar');
const show = (message = 'Updated 2 sets') => act(() => open({message, undo: rollback}));
const advance = ms => act(() => vi.advanceTimersByTime(ms));
function pointer(target, type, x, y) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {pointerId: 1, isPrimary: true, clientX: x, clientY: y});
  act(() => target.dispatchEvent(event));
}
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; rollback = vi.fn(); motions = [];
  vi.stubGlobal('matchMedia', () => ({matches: reduced}));
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  animate = vi.fn((frames, options) => {
    const motion = {frames, options, cancel: vi.fn(), onfinish: null};
    motions.push(motion); return motion;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', {configurable: true, value: animate});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness/>));
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else delete HTMLElement.prototype.animate;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});

it('rises 16px once per item while Undo is immediately available', () => {
  show(); const entry = motions[0], undo = snackbar().querySelector('button');
  expect(entry.frames).toEqual([{transform: 'translate3d(0, 16px, 0)', opacity: 0}, {transform: 'translate3d(0, 0, 0)', opacity: 1}]);
  expect(entry.options.duration).toBe(190); expect(undo.disabled).toBe(false);
  act(() => undo.click());
  expect(rollback).toHaveBeenCalledOnce(); expect(snackbar()).toBeNull(); expect(entry.cancel).toHaveBeenCalledOnce();
});
it('unrelated renders restart neither entry nor the remaining timeout', () => {
  show(); const node = snackbar(); advance(3000);
  act(() => {rerender(); rerender();});
  expect(snackbar()).toBe(node); expect(animate).toHaveBeenCalledOnce();
  advance(1999); expect(motions).toHaveLength(1);
  advance(1); expect(motions).toHaveLength(2); expect(snackbar()).toBe(node);
  act(() => motions[1].onfinish()); expect(snackbar()).toBeNull();
});
it('a swipe takes over the actual entry pose without snapping or activating Undo', () => {
  show(); const node = snackbar(), entry = motions[0];
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({transform: 'matrix(1, 0, 0, 1, 0, 8)', opacity: '.7'});
  pointer(node, 'pointerdown', 100, 100);
  expect(entry.cancel).toHaveBeenCalledOnce(); expect(entry.onfinish).toBeNull();
  expect(node.style.transform).toBe('matrix(1, 0, 0, 1, 0, 8)');
  pointer(window, 'pointermove', 120, 100);
  expect(node.style.transform).toBe('translate3d(20px, 0, 0) matrix(1, 0, 0, 1, 0, 8)');
  pointer(window, 'pointerup', 120, 100);
  expect(node.style.transform).toBe(''); expect(snackbar()).toBe(node); expect(rollback).not.toHaveBeenCalled();
  advance(170); act(() => node.querySelector('button').click()); expect(rollback).toHaveBeenCalledOnce();
});
it('timeout fades down a short distance, then removes only feedback', () => {
  show(); act(() => motions[0].onfinish()); advance(5000);
  const exit = motions[1];
  expect(exit.frames.at(-1)).toEqual({transform: 'translate3d(0, 16px, 0)', opacity: 0});
  expect(exit.options.duration).toBe(170); expect(snackbar()).not.toBeNull();
  act(() => exit.onfinish()); expect(snackbar()).toBeNull(); expect(rollback).not.toHaveBeenCalled();
});
it('Undo during expiry cancels exit and a stale finish cannot dismiss new feedback', () => {
  show(); advance(5000); const exit = motions[1], finish = exit.onfinish;
  act(() => snackbar().querySelector('button').click());
  expect(rollback).toHaveBeenCalledOnce(); expect(exit.cancel).toHaveBeenCalledOnce(); expect(exit.onfinish).toBeNull();
  show('New feedback'); act(() => finish());
  expect(snackbar().textContent).toContain('New feedback');
});
it('reduced motion shows and expires immediately without any translation animation', () => {
  reduced = true; show(); expect(animate).not.toHaveBeenCalled();
  advance(5000); expect(snackbar()).toBeNull(); expect(animate).not.toHaveBeenCalled();
});
