import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Snackbar, useTransientSnackbar} from './TransientSnackbar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, open, undo, outside;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const snackbar = () => host.querySelector('.rook-snackbar');
const focus = target => act(() => target.focus());
const pointer = (target, type, x = 10, y = 100) => {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {pointerId: 1, isPrimary: true, clientX: x, clientY: y});
  act(() => target.dispatchEvent(event));
};
function Harness() {
  const notice = useTransientSnackbar(); open = notice.show;
  return <div><button data-outside>Next action</button>{notice.surface}</div>;
}
const show = () => act(() => open({message: 'Workout moved', undo}));
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({matches: false}));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  undo = vi.fn(); act(() => root.render(<Harness/>)); outside = host.querySelector('[data-outside]');
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it('retains Undo and keyboard focus after the original expiration time', () => {
  show(); advance(3000); const button = snackbar().querySelector('button'); focus(button);
  advance(10000);
  expect(snackbar()).not.toBeNull(); expect(document.activeElement).toBe(button); expect(undo).not.toHaveBeenCalled();
  act(() => button.click()); expect(undo).toHaveBeenCalledOnce(); expect(snackbar()).toBeNull();
});

it('resumes only the original remaining duration when keyboard focus leaves', () => {
  show(); advance(3200); focus(snackbar().querySelector('button')); advance(8000); focus(outside);
  advance(1799); expect(snackbar()).not.toBeNull();
  advance(1); expect(snackbar()).toBeNull(); expect(document.activeElement).toBe(outside);
});

it.each(['pointerup', 'pointercancel'])('%s cannot restart auto-dismiss while Undo remains focused', reason => {
  show(); advance(3000); focus(snackbar().querySelector('button')); pointer(snackbar(), 'pointerdown');
  advance(7000); pointer(window, reason); advance(7000); expect(snackbar()).not.toBeNull();
  focus(outside); advance(1999); expect(snackbar()).not.toBeNull(); advance(1); expect(snackbar()).toBeNull();
});

it.each(['pointerup', 'pointercancel'])('focus leaving cannot restart the timer until a held pointer receives %s', reason => {
  show(); advance(3000); pointer(snackbar(), 'pointerdown'); focus(snackbar().querySelector('button'));
  advance(7000); focus(outside); advance(7000); expect(snackbar()).not.toBeNull();
  pointer(window, reason); advance(1999); expect(snackbar()).not.toBeNull(); advance(1); expect(snackbar()).toBeNull();
});

it('moving focus within the snackbar preserves one pause without resetting the remaining time', () => {
  show(); advance(3000); const surface = snackbar(), button = surface.querySelector('button'); surface.tabIndex = -1;
  focus(button); advance(7000); focus(surface); advance(7000); focus(button); advance(7000);
  expect(snackbar()).toBe(surface); focus(outside); advance(1999); expect(snackbar()).toBe(surface); advance(1); expect(snackbar()).toBeNull();
});

it('focus does not prevent intentional horizontal dismissal or invoke Undo', () => {
  show(); const button = snackbar().querySelector('button'); focus(button);
  pointer(snackbar(), 'pointerdown'); pointer(window, 'pointermove', 150); pointer(window, 'pointerup', 150);
  advance(169); expect(snackbar()).not.toBeNull(); advance(1); expect(snackbar()).toBeNull(); expect(undo).not.toHaveBeenCalled();
});

it('a new notice retains its own lifetime after replacing a focused older notice', () => {
  show(); advance(3000); focus(snackbar().querySelector('button')); advance(7000);
  const oldButton = snackbar().querySelector('button'); act(() => open({message: 'New notice'}));
  expect(oldButton.isConnected).toBe(false); expect(snackbar().textContent).toBe('New notice');
  advance(4999); expect(snackbar()).not.toBeNull(); advance(1); expect(snackbar()).toBeNull();
});

it('unmount removes held-pointer listeners and cannot resume or dismiss after focus cleanup', () => {
  const pause = vi.fn(), resume = vi.fn(), dismiss = vi.fn();
  act(() => root.render(<Snackbar message="Synthetic notice" onPause={pause} onResume={resume} onDismiss={dismiss} onUndo={undo}/>));
  focus(snackbar().querySelector('button')); pointer(snackbar(), 'pointerdown');
  expect(pause).toHaveBeenCalledOnce(); act(() => root.render(null));
  pointer(window, 'pointercancel'); advance(10000);
  expect(resume).not.toHaveBeenCalled(); expect(dismiss).not.toHaveBeenCalled(); expect(undo).not.toHaveBeenCalled();
});
