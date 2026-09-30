import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { capturePageSurface, createPageBackMotion, createLivePageBackMotion, playPageNavigation } from './pageStackMotion.js';

let surface, parent, animations, reduced;
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; animations = [];
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  document.body.innerHTML = '<main id="parent"><h1>Parent</h1><input value="Original"/><div class="scroll"></div></main><main id="child" style="color: red"><h1>Child</h1><input value="Draft"/><footer style="position: fixed; bottom: 0">Continue</footer></main>';
  parent = document.querySelector('#parent'); surface = document.querySelector('#child');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.tagName === 'FOOTER' ? { left: 24, top: 740, width: 342, height: 64 } : { left: 0, top: 0, width: 390, height: 844 };
  });
  HTMLElement.prototype.getAnimations = () => [];
  HTMLElement.prototype.animate = function (frames, timing) { const animation = { node: this, frames, timing, cancel: vi.fn() }; animations.push(animation); return animation; };
});
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([320, 390, 430])('tracks one opaque full page at %ipx, coalesces frames and never rereads geometry while moving', width => {
  surface.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width, height: 844 }));
  const style = surface.getAttribute('style'), footerStyle = surface.querySelector('footer').getAttribute('style');
  const input = surface.querySelector('input'); input.focus(); input.setSelectionRange(1, 3); surface.scrollTop = 91;
  const motion = createPageBackMotion(surface, capturePageSurface(parent));
  motion.render(20, 0); const reads = surface.getBoundingClientRect.mock.calls.length;
  for (let x = 21; x <= 100; x++) motion.render(x, 0);
  vi.advanceTimersByTime(16);
  expect(surface.style.transform).toBe('translate3d(100px,0,0)');
  expect(surface.style.opacity).toBe('1');
  expect(surface.style.background).toBe('var(--rook-bg)');
  expect(surface.getBoundingClientRect).toHaveBeenCalledTimes(reads);
  const underlay = document.querySelector('[data-swipe-parent]');
  expect(underlay.style.opacity).toBe('1'); expect(underlay.hasAttribute('inert')).toBe(true);
  expect(underlay.getAttribute('aria-hidden')).toBe('true'); expect(underlay.querySelector('[id]')).toBeNull();
  motion.render(0, 150); expect(surface.style.transition).not.toContain('opacity'); motion.clear();
  expect(surface.getAttribute('style')).toBe(style); expect(surface.querySelector('footer').getAttribute('style')).toBe(footerStyle);
  expect(surface.scrollTop).toBe(91); expect(document.activeElement).toBe(input); expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  expect(underlay.isConnected).toBe(false);
});
it('copies current form values and nested parent scroll into inaccessible previews', () => {
  parent.querySelector('input').value = 'Retained value'; parent.querySelector('.scroll').scrollTop = 127;
  const motion = createPageBackMotion(surface, capturePageSurface(parent)); motion.render(120, 0); vi.advanceTimersByTime(16);
  const preview = document.querySelector('[data-swipe-parent]');
  expect(preview.querySelector('input').value).toBe('Retained value'); expect(preview.querySelector('.scroll').scrollTop).toBe(127); motion.clear();
});
it.each([false, true])('button transition uses transform-only full-width stack, back=%s', back => {
  const clear = playPageNavigation(surface, capturePageSurface(parent), { back });
  expect(animations).toHaveLength(2);
  expect(animations[0].frames).toEqual([{ transform: `translate3d(${back ? 0 : 390}px,0,0)` }, { transform: `translate3d(${back ? 390 : 0}px,0,0)` }]);
  expect(animations[1].frames).toEqual([{ transform: `translate3d(${back ? -16 : 0}px,0,0)` }, { transform: `translate3d(${back ? 0 : -16}px,0,0)` }]);
  expect(animations.every(a => a.timing.duration === 200 && a.frames.every(frame => frame.opacity === undefined))).toBe(true);
  vi.advanceTimersByTime(200); expect(document.querySelector('[data-swipe-parent]')).toBeNull(); expect(surface.style.transform).toBe(''); clear();
});
it('live history parent follows the same physical positions and restores its hidden state', () => {
  parent.style.visibility = 'hidden'; const original = parent.getAttribute('style');
  const motion = createLivePageBackMotion(surface, parent); motion.render(195, 0); vi.advanceTimersByTime(16);
  expect(surface.style.transform).toBe('translate3d(195px,0,0)'); expect(parent.style.transform).toBe('translate3d(-8px,0,0)');
  expect(parent.style.visibility).toBe('visible'); expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  motion.clear(); expect(parent.getAttribute('style')).toBe(original);
});
it('reduced motion creates no snapshot or animation and leaves live state untouched', () => {
  reduced = true; expect(capturePageSurface(parent)).toBeNull(); expect(createPageBackMotion(surface, null)).toBeNull();
  playPageNavigation(surface, null)(); expect(animations).toHaveLength(0); expect(surface.getAttribute('style')).toBe('color: red');
});
it('interruptions and cleanup release snapshots, inline styles and timer ownership', () => {
  for (const event of ['resize', 'pagehide']) {
    playPageNavigation(surface, capturePageSurface(parent)); window.dispatchEvent(new Event(event));
    expect(document.querySelector('[data-swipe-parent]')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  }
  const clear = playPageNavigation(surface, capturePageSurface(parent)); clear();
  expect(vi.getTimerCount()).toBe(0); expect(surface.getAttribute('style')).toBe('color: red');
});
