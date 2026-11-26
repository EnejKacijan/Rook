import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useContextPress } from './useContextPress.js';

let host, root, open, select;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function Trigger() {
  const context = useContextPress(open);
  return <button {...context} onClick={select}>Exercise</button>;
}
beforeEach(() => {
  vi.useFakeTimers();
  open = vi.fn();
  select = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Trigger />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const button = () => host.querySelector('button');
function pointer(type, target, { x = 20, y = 40, id = 1, primary = true } = {}) {
  const event = new MouseEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y });
  Object.assign(event, { pointerType:'touch', pointerId:id, isPrimary:primary });
  act(() => target.dispatchEvent(event));
}
const press = () => pointer('pointerdown', button());
const wait = (time = 510) => act(() => vi.advanceTimersByTime(time));
const click = target => act(() => target.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, detail:1 })));

it('opens while held, suppresses the release click, and permits the next tap', () => {
  press();
  wait();
  expect(open).toHaveBeenCalledExactlyOnceWith(button());
  pointer('pointerup', window);
  click(button());
  expect(select).not.toHaveBeenCalled();
  press();
  pointer('pointerup', window);
  click(button());
  expect(select).toHaveBeenCalledOnce();
});

it('suppresses an activation on the opened overlay without affecting its next tap', () => {
  const action = document.createElement('button'), perform = vi.fn();
  host.append(action);
  action.addEventListener('click', perform);
  button().focus();
  open.mockImplementation(() => action.focus());
  press();
  wait();
  pointer('pointerup', window);
  click(action);
  expect(perform).not.toHaveBeenCalled();
  pointer('pointerdown', action);
  click(action);
  expect(perform).toHaveBeenCalledOnce();
  action.remove();
});

it.each(['tap','drag','scroll','cancel','second finger'])('yields to %s before the hold resolves', kind => {
  press();
  wait(150);
  if (kind === 'tap') pointer('pointerup', window);
  if (kind === 'drag') pointer('pointermove', window, { x:45 });
  if (kind === 'scroll') act(() => host.dispatchEvent(new Event('scroll')));
  if (kind === 'cancel') pointer('pointercancel', window);
  if (kind === 'second finger') pointer('pointerdown', button(), { id:2, primary:false });
  wait();
  expect(open).not.toHaveBeenCalled();
});

it('opens exactly once on the keyboard shortcut and once for a later right click', () => {
  const contextMenu = () => act(() => button().dispatchEvent(new MouseEvent('contextmenu', { bubbles:true,cancelable:true,button:2 })));
  act(() => button().dispatchEvent(new KeyboardEvent('keydown', { bubbles:true,key:'F10',shiftKey:true })));
  contextMenu();
  expect(open).toHaveBeenCalledTimes(1);
  wait();
  contextMenu();
  expect(open).toHaveBeenCalledTimes(2);
});
