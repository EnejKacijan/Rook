import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {bindScrollableSheetTouch} from './App.jsx';

let surface, button, release, dismiss, reset, action;
beforeEach(() => {
  surface = document.createElement('section'); button = document.createElement('button'); surface.append(button); document.body.append(surface);
  Object.defineProperty(surface, 'offsetHeight', {value:400});
  dismiss = vi.fn(); reset = vi.fn(() => { surface.style.transform = ''; }); action = vi.fn(); button.addEventListener('click', action);
  release = bindScrollableSheetTouch({surface, scroller:surface, onDismiss:dismiss, onReset:reset,
    setPosition:distance => { surface.style.transform = `translateY(${distance}px)`; }});
});
afterEach(() => { release(); surface.remove(); });
function touch(type, y, count = 1, target = surface) {
  const e = new Event(type, {bubbles:true, cancelable:true});
  Object.assign(e, {touches: /end|cancel/.test(type) ? [] : Array.from({length:count}, (_, identifier) => ({identifier, clientX:150, clientY:y}))});
  target.dispatchEvent(e); return e;
}
it.each(['resize', 'orientationchange', 'blur', 'pagehide', 'visibilitychange', 'touchcancel', 'multitouch'])('%s cancels a captured sheet drag without dismissing or leaving a transform', reason => {
  touch('touchstart', 100); touch('touchmove', 140); expect(surface.style.transform).toBe('translateY(40px)');
  if (reason === 'multitouch') touch('touchstart', 140, 2);
  else if (reason === 'touchcancel') touch(reason, 140);
  else (reason === 'visibilitychange' ? document : window).dispatchEvent(new Event(reason));
  expect(surface.style.transform).toBe(''); expect(surface.classList.contains('is-dragging')).toBe(false);
  touch('touchend', 140); expect(dismiss).not.toHaveBeenCalled(); expect(reset).toHaveBeenCalledOnce();
});
it('blocks the gesture release ghost click but accepts a fresh touch action immediately', () => {
  touch('touchstart', 100); touch('touchmove', 140); touch('touchcancel', 140);
  button.click(); expect(action).not.toHaveBeenCalled();
  touch('touchstart', 140, 1, button); touch('touchend', 140, 1, button); button.click();
  expect(action).toHaveBeenCalledOnce(); expect(dismiss).not.toHaveBeenCalled();
});
it('normal scrolling and horizontal intent do not capture sheet dismissal', () => {
  surface.scrollTop = 40; touch('touchstart', 100); const move = touch('touchmove', 60); touch('touchend', 60);
  expect(move.defaultPrevented).toBe(false); expect(surface.style.transform).toBe(''); expect(dismiss).not.toHaveBeenCalled();
});
