import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindStepperTouch } from './stepperTouch.js';

let release, plus, minus, click;
function touch(type, node = plus, { x = 80, y = 25, count = 1, id = 1, cancelable = true, prevented = false } = {}) {
  const point = { identifier: id, clientX: x, clientY: y, target: node };
  const event = new Event(type, { bubbles: true, cancelable });
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: count }, (_, i) => ({ ...point, identifier: id + i })) },
    changedTouches: { value: [point] },
  });
  if (prevented) event.preventDefault();
  node.dispatchEvent(event);
  return event;
}
function tap(node = plus, options) { touch('touchstart', node, options); return touch('touchend', node, options); }
beforeEach(() => {
  document.body.innerHTML = '<div class="stepper"><button>−</button><input value="42"><button><span>+</span></button></div><button id="other">Other</button>';
  [minus, plus] = document.querySelectorAll('.stepper button');
  for (const button of [minus, plus]) vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 100, bottom: 50 });
  click = vi.fn(); plus.addEventListener('click', click); minus.addEventListener('click', click);
  release = bindStepperTouch(document);
});
afterEach(() => { release(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('cancels the zoom-producing default and delivers every rapid +/- tap once', () => {
  for (let i = 0; i < 10; i++) expect(tap().defaultPrevented).toBe(true);
  expect(tap(minus).defaultPrevented).toBe(true);
  expect(click).toHaveBeenCalledTimes(11);
  expect(tap(plus.querySelector('span')).defaultPrevented).toBe(true);
  expect(click).toHaveBeenCalledTimes(12);
  // Managed focus must still recognize touch intent rather than a virtual
  // keyboard/assistive click (detail 0), with the original release position.
  expect(click.mock.calls.at(-1)[0]).toMatchObject({ detail: 1, clientX: 80, clientY: 25 });
});
it('does not cancel start/move, and abandons scrolling even if the finger returns', () => {
  expect(touch('touchstart').defaultPrevented).toBe(false);
  expect(touch('touchmove', plus, { y: 80 }).defaultPrevented).toBe(false);
  touch('touchmove'); expect(touch('touchend').defaultPrevented).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
it.each(['touchcancel', 'scroll', 'contextmenu', 'blur', 'pagehide'])('abandons a tap on %s', type => {
  touch('touchstart');
  if (type === 'blur' || type === 'pagehide') window.dispatchEvent(new Event(type));
  else plus.dispatchEvent(new Event(type, { bubbles: true }));
  expect(touch('touchend').defaultPrevented).toBe(false); expect(click).not.toHaveBeenCalled();
});
it('does not claim a multi-finger gesture or a different touch identifier', () => {
  touch('touchstart'); touch('touchstart', plus, { count: 2 });
  expect(touch('touchend').defaultPrevented).toBe(false);
  touch('touchstart'); touch('touchmove', plus, { count: 2 }); touch('touchend');
  touch('touchstart'); expect(touch('touchend', plus, { id: 2 }).defaultPrevented).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
it('does not activate on a hold, a release outside the button or a disabled/removed control', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  touch('touchstart'); now.mockReturnValue(600); expect(touch('touchend').defaultPrevented).toBe(false);
  touch('touchstart', plus, { x: 99 }); expect(touch('touchend', plus, { x: 101 }).defaultPrevented).toBe(false);
  touch('touchstart'); plus.disabled = true; touch('touchend'); plus.disabled = false;
  touch('touchstart'); plus.remove(); touch('touchend');
  expect(click).not.toHaveBeenCalled();
});
it.each(['inert', 'hidden', 'aria-hidden'])('leaves unavailable %s layers alone', attribute => {
  plus.parentElement.setAttribute(attribute, attribute === 'aria-hidden' ? 'true' : '');
  expect(tap().defaultPrevented).toBe(false); expect(click).not.toHaveBeenCalled();
});
it('leaves already owned or non-cancelable events to the browser/other recognizer', () => {
  expect(tap(plus, { prevented: true }).defaultPrevented).toBe(true);
  expect(click).not.toHaveBeenCalled();
  touch('touchstart'); expect(touch('touchend', plus, { prevented: true }).defaultPrevented).toBe(true);
  touch('touchstart'); expect(touch('touchend', plus, { cancelable: false }).defaultPrevented).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
it('preserves direct clicks, input focus and non-stepper controls', () => {
  const input = document.querySelector('input'); input.focus();
  expect(tap(input).defaultPrevented).toBe(false);
  expect(tap(document.querySelector('#other')).defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input); expect(input.value).toBe('42');
  plus.click(); plus.click(); expect(click).toHaveBeenCalledTimes(2);
});
it('handles optional duration +/- but leaves its edit-value button alone', () => {
  const group = plus.parentElement; group.className = 'stepper-row-controls';
  expect(tap().defaultPrevented).toBe(true); expect(click).toHaveBeenCalledOnce();
  plus.className = 'stepper-row-value'; expect(tap().defaultPrevented).toBe(false);
  expect(click).toHaveBeenCalledOnce();
});
it('removes all handlers and discards an unfinished touch on release', () => {
  touch('touchstart'); release();
  expect(touch('touchend').defaultPrevented).toBe(false); expect(tap().defaultPrevented).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
