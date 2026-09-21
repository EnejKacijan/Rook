import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {bindWeekPager} from './weekPager.js';

let root, viewport, track, labelTrack, controller, commit, options, time, reduced, pageWidth;
const advance = ms => { time += ms; vi.advanceTimersByTime(ms); };
function touch(type, x, y = 40, count = 1) {
  const t = {identifier: 1, clientX: x, clientY: y};
  const e = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(e, {touches: {value: type === 'touchend' ? [] : [t, ...Array.from({length: count - 1}, () => ({...t, identifier: 2}))]}, changedTouches: {value: [t]}});
  viewport.dispatchEvent(e); return e;
}
const pull = (dx, delay = 400) => { touch('touchstart', 160); advance(delay); return touch('touchmove', 160 + dx); };
const end = dx => touch('touchend', 160 + dx);
const click = (detail = 1) => { const e = new MouseEvent('click', {bubbles: true, cancelable: true, detail}); viewport.querySelector('button').dispatchEvent(e); return e; };
beforeEach(() => {
  vi.useFakeTimers(); time = 0; reduced = false; pageWidth = 300;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('matchMedia', () => ({matches: reduced}));
  root = document.createElement('div'); root.innerHTML = '<span><span id="label"></span></span><div data-week-drag><div id="track"><button>Day</button></div></div>';
  document.body.append(root); viewport = root.querySelector('[data-week-drag]'); track = root.querySelector('#track'); labelTrack = root.querySelector('#label');
  viewport.getBoundingClientRect = () => ({width: pageWidth});
  track.style.columnGap = '14px';
  options = {canGoBack: true, canGoForward: true}; commit = vi.fn();
  controller = bindWeekPager({root, viewport, track, labelTrack, getOptions: () => options, onCommit: commit});
});
afterEach(() => {controller.destroy(); root.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();});
it('slow 20% drag follows as one track per frame, then cancels without a commit', () => {
  pull(-60); touch('touchmove', 99); touch('touchmove', 100);
  expect(track.style.transform).toContain('-314px'); advance(17);
  expect(track.style.transform).toContain('-374px'); expect(Number(labelTrack.style.transform.match(/translate3d\(([-\d.]+)/)[1])).toBeCloseTo((-1 - 60 / 314) * 100 / 3);
  expect(commit).not.toHaveBeenCalled(); end(-60); expect(root.dataset.weekPhase).toBe('settling');
  advance(260); expect(track.style.transform).toContain('-314px'); expect(root.dataset.weekPhase).toBe('idle'); expect(commit).not.toHaveBeenCalled();
});
it.each([-1, 1])('distance commit %s occurs once after settling, then recenters', direction => {
  pull(-direction * 150); advance(17); end(-direction * 150);
  expect(commit).not.toHaveBeenCalled(); expect(track.style.transform).toContain(`${-314 - direction * 314}px`);
  advance(260); expect(commit).toHaveBeenCalledExactlyOnceWith(direction); expect(track.style.transform).toContain('-314px');
  const e = new Event('transitionend'); Object.defineProperty(e, 'propertyName', {value: 'transform'}); track.dispatchEvent(e); advance(400); expect(commit).toHaveBeenCalledOnce();
});
it('fresh short flick after a long hold commits, using recent samples', () => {
  touch('touchstart', 160); advance(2000); touch('touchmove', 148); advance(30); touch('touchmove', 120); end(-40); advance(260);
  expect(commit).toHaveBeenCalledExactlyOnceWith(1);
});
it.each(['stale', 'reversed', 'tiny'])('does not borrow %s flick velocity', kind => {
  pull(kind === 'tiny' ? -20 : -40, 30);
  if (kind === 'stale') advance(101);
  end(kind === 'reversed' ? -30 : kind === 'tiny' ? -20 : -40); advance(260); expect(commit).not.toHaveBeenCalled();
});
it('vertical and diagonal intent yield permanently without preventing native scroll', () => {
  touch('touchstart',160); const e = touch('touchmove',150,65); expect(e.defaultPrevented).toBe(false);
  expect(touch('touchmove',20,70).defaultPrevented).toBe(false); advance(17); expect(track.style.transform).toContain('-314px'); end(-140); advance(260); expect(commit).not.toHaveBeenCalled();
});
it('horizontal intent stays owned even when later movement becomes vertical', () => {
  expect(pull(-30).defaultPrevented).toBe(true); expect(touch('touchmove',100,150).defaultPrevented).toBe(true);
  advance(120); expect(track.style.transform).toContain('-374px'); end(-60); advance(260); expect(commit).not.toHaveBeenCalled();
});
it('ordinary tap passes; swipe ghost click is blocked; an immediate fresh tap passes', () => {
  touch('touchstart',160); touch('touchend',161); expect(click().defaultPrevented).toBe(false);
  pull(-50); end(-50); expect(click().defaultPrevented).toBe(true); advance(260); expect(click().defaultPrevented).toBe(true);
  touch('touchstart',160); touch('touchend',160); expect(click().defaultPrevented).toBe(false);
});
it('a new physical tap can interrupt the cancel animation without waiting out its suppression', () => {
  pull(-50); end(-50); expect(root.dataset.weekPhase).toBe('settling');
  touch('touchstart',160); touch('touchend',160);
  expect(root.dataset.weekPhase).toBe('idle'); expect(click().defaultPrevented).toBe(false);
  advance(260); expect(commit).not.toHaveBeenCalled(); expect(track.style.transform).toContain('-314px');
});
it('a fresh tap during cancel uses the touched date, even if the browser re-hit-tests a neighbour after centering', () => {
  const intended = viewport.querySelector('button'), neighbour = document.createElement('button');
  viewport.append(neighbour); const intendedClick = vi.fn(), neighbourClick = vi.fn();
  intended.addEventListener('click', intendedClick); neighbour.addEventListener('click', neighbourClick);
  pull(-50); end(-50);
  intended.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true,clientX:160,clientY:40}));
  neighbour.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,detail:1}));
  expect(intendedClick).toHaveBeenCalledOnce(); expect(neighbourClick).not.toHaveBeenCalled();
  advance(1000); expect(commit).not.toHaveBeenCalled();
});
it.each([-1, 1])('bounds %s resist by less than 28px and never commit or allow arrows', direction => {
  options[direction < 0 ? 'canGoBack' : 'canGoForward'] = false;
  pull(-direction * 180); advance(17); const x = Number(track.style.transform.match(/translate3d\(([-\d.]+)/)[1]);
  expect(Math.abs(x + 314)).toBeLessThan(28); expect(Math.abs(x + 314)).toBeGreaterThan(0);
  end(-direction * 180); advance(260); expect(commit).not.toHaveBeenCalled(); expect(controller.arrow(direction)).toBe(false);
});
it('arrows share settle, ignore overlapping inputs, and allow a fresh next swipe', () => {
  expect(controller.arrow(-1)).toBe(true); expect(track.style.transform).toContain('0px'); expect(commit).not.toHaveBeenCalled();
  expect(controller.arrow(-1)).toBe(false); pull(-150); end(-150); advance(260); expect(commit).toHaveBeenCalledExactlyOnceWith(-1);
  pull(-150); end(-150); advance(260); expect(commit.mock.calls).toEqual([[-1],[1]]);
});
it.each(['resize','orientationchange','blur','pagehide','visibilitychange','touchcancel','multitouch'])('%s interruption resets and clears stale click suppression', name => {
  pull(-150); advance(17);
  if (name === 'multitouch') touch('touchstart',100,40,2);
  else if (name === 'touchcancel') touch('touchcancel',10);
  else (name === 'visibilitychange' ? document : window).dispatchEvent(new Event(name));
  expect(track.style.transform).toContain('-314px'); expect(root.dataset.weekPhase).toBe('idle'); end(-150); advance(260); expect(commit).not.toHaveBeenCalled(); expect(click().defaultPrevented).toBe(false);
});
it('resize cancels an already settling commit, and unmount clears pending timers/frames', () => {
  controller.arrow(1); window.dispatchEvent(new Event('resize')); advance(260); expect(commit).not.toHaveBeenCalled();
  controller.arrow(1); controller.destroy(); advance(1000); expect(commit).not.toHaveBeenCalled();
});
it.each(['pointercancel','lostpointercapture'])('captures a mouse/pen only after lock and cleans up %s', type => {
  let captured = false;
  root.setPointerCapture = vi.fn(() => {captured = true;}); root.hasPointerCapture = () => captured; root.releasePointerCapture = vi.fn(() => {captured = false;});
  const pointer = (type, x) => {const e = new MouseEvent(type, {bubbles:true,cancelable:true,clientX:x,clientY:40,button:0}); Object.defineProperties(e, {pointerType:{value:'pen'},pointerId:{value:2}}); viewport.dispatchEvent(e);};
  pointer('pointerdown',160); expect(root.setPointerCapture).not.toHaveBeenCalled(); pointer('pointermove',50); advance(17); expect(root.setPointerCapture).toHaveBeenCalledWith(2);
  pointer(type,50); advance(260); expect(captured).toBe(false); expect(commit).not.toHaveBeenCalled(); expect(track.style.transform).toContain('-314px');
});
it('reduced motion tracks the finger, then snaps; arrows commit directly', () => {
  reduced = true; pull(-150); advance(17); expect(track.style.transform).toContain('-464px'); end(-150);
  expect(commit).toHaveBeenCalledExactlyOnceWith(1); expect(track.style.transition).toBe('none'); expect(track.style.transform).toContain('-314px');
  controller.arrow(-1); expect(commit.mock.calls).toEqual([[1],[-1]]);
});
it.each([12,14,16])('uses viewport width plus the actual %spx CSS page gap for both arrow endpoints', gap => {
  track.style.columnGap = `${gap}px`; controller.reset(); reduced = true;
  expect(track.style.transform).toContain(`${-300-gap}px`);
  reduced = false; controller.arrow(1);
  expect(track.style.transform).toContain(`${-2*(300+gap)}px`);
  expect(Number(labelTrack.style.transform.match(/translate3d\(([-\d.]+)/)[1])).toBeCloseTo(-200/3);
  advance(260); expect(track.style.transform).toContain(`${-300-gap}px`);
  controller.arrow(-1); expect(track.style.transform).toContain('0px');
  expect(Number(labelTrack.style.transform.match(/translate3d\(([-\d.]+)/)[1])).toBeCloseTo(0);
});
it.each([[83,false],[85,true]])('keeps the original viewport-based distance threshold at %spx (commit: %s)', (distance,committed) => {
  pull(-distance,500); end(-distance); advance(260);
  expect(commit).toHaveBeenCalledTimes(committed ? 1 : 0);
});
it('clamps a full drag to one page stride, including its gutter', () => {
  pull(-500,1000); advance(17);
  expect(track.style.transform).toContain('-628px');
  expect(Number(labelTrack.style.transform.match(/translate3d\(([-\d.]+)/)[1])).toBeCloseTo(-200/3);
});
it.each(['centered','dragging','settling','committed'])('remeasures the stride on resize while %s without a stale commit or offset', phase => {
  if(phase==='dragging') {pull(-60); advance(17);}
  if(phase==='settling'||phase==='committed') controller.arrow(1);
  if(phase==='committed') advance(260);
  pageWidth = 390; window.dispatchEvent(new Event('resize'));
  expect(track.style.transform).toContain('-404px');
  expect(Number(labelTrack.style.transform.match(/translate3d\(([-\d.]+)/)[1])).toBeCloseTo(-100/3);
  end(-150); advance(260); expect(commit).toHaveBeenCalledTimes(phase==='committed'?1:0);
  controller.arrow(1); expect(track.style.transform).toContain('-808px'); advance(260);
  expect(track.style.transform).toContain('-404px');
});
