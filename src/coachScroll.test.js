import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { bindCoachScroll, FOLLOWING_LATEST, READING_HISTORY } from './coachScroll.js';

let scroller, content, owner, resize, mutation, frames, now, ui, memory, metrics, writes, disconnects;
beforeEach(() => {
  now = 0; frames = new Map(); let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', fn => { frames.set(++frameId, fn); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  disconnects = [];
  vi.stubGlobal('ResizeObserver', class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnects.push('resize'); } });
  vi.stubGlobal('MutationObserver', class { constructor(fn) { mutation = fn; } observe() {} disconnect() { disconnects.push('mutation'); } });
  scroller = document.createElement('div'); content = document.createElement('div'); scroller.append(content); document.body.append(scroller);
  metrics = { height: 2400, viewport: 600, top: 0 }; writes = [];
  Object.defineProperties(scroller, {
    scrollTop: { get: () => metrics.top, set: value => { metrics.top = value; writes.push(value); } },
    scrollHeight: { get: () => metrics.height }, clientHeight: { get: () => metrics.viewport },
  });
  scroller.getBoundingClientRect = () => ({ top: 50 });
  for (let i = 0; i < 24; i++) leaf(`message-${i}`, i * 100);
  memory = new Map(); ui = {};
});
afterEach(() => { owner?.dispose(); owner = null; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function leaf(key, y) {
  const node = document.createElement('p'); node.dataset.coachAnchor = key; node.y = y;
  node.getBoundingClientRect = () => ({ top: node.y - metrics.top + 50, bottom: node.y - metrics.top + 150 });
  content.append(node); return node;
}
function bind() { owner = bindCoachScroll(scroller, content, { memory, conversationId: 'chat', onChange: state => { ui = state; } }); }
function frame(ms = 16) { now += ms; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now); }
function scroll(top, delta) { if (delta) scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: delta })); metrics.top = top; scroller.dispatchEvent(new Event('scroll')); frame(); }
function grow(by = 100) { metrics.height += by; mutation(); resize(); }
function read() { scroll(600, -120); expect(ui.mode).toBe(READING_HISTORY); }

it('A/C explicit send/retry/jump uses distance-aware movement, then follows growth', () => {
  bind(); read(); owner.latest(); expect(ui.mode).toBe(FOLLOWING_LATEST);
  frame(110); expect(metrics.top).toBeGreaterThan(600); expect(metrics.top).toBeLessThan(1800);
  grow(); frame(170); expect(metrics.top).toBe(1900); expect(ui.showLatest).toBe(false);
  grow(); frame(); expect(metrics.top).toBe(2000);
});
it('B intentional upward input cancels follow immediately, even within the tolerance', () => {
  bind(); scroll(1790, -10); expect(ui.mode).toBe(READING_HISTORY); expect(ui.showLatest).toBe(true);
  grow(800); frame(); expect(metrics.top).toBe(1790); expect(ui.mode).toBe(READING_HISTORY);
});
it('continued manual momentum wins over a simultaneous content update without a new touchmove', () => {
  bind(); read(); grow(); metrics.top = 550; scroller.dispatchEvent(new Event('scroll')); frame();
  expect(metrics.top).toBe(550); expect(ui.mode).toBe(READING_HISTORY);
});
it('D tolerates 100px when returning down, and never mistakes its own corrections for user intent', () => {
  bind(); read(); scroll(1720, 100); expect(ui.mode).toBe(FOLLOWING_LATEST); expect(metrics.top).toBe(1800);
  scroller.dispatchEvent(new Event('scroll')); grow(); frame(); expect(metrics.top).toBe(1900); expect(ui.mode).toBe(FOLLOWING_LATEST);
});
it('a reader more than 100px away stays reading', () => {
  bind(); read(); scroll(1690, 100); expect(ui.mode).toBe(READING_HISTORY);
  grow(); frame(); expect(metrics.top).toBe(1690);
});
it.each([false, true])('E prepending preserves the same leaf with native anchoring=%s (no double compensation)', native => {
  bind(); read(); for (const node of content.children) node.y += 300;
  const before = leaf('older', 0); content.prepend(before); grow(300);
  if (native) { metrics.top += 300; scroller.dispatchEvent(new Event('scroll')); }
  frame(); expect(metrics.top).toBe(900);
  expect(content.querySelector('[data-coach-anchor="message-6"]').getBoundingClientRect().top).toBe(50);
});
it('asynchronous content expansion above the reading anchor compensates only its height', () => {
  bind(); read(); for (const node of content.children) if (node.y >= 400) node.y += 137;
  grow(137); frame(); expect(metrics.top).toBe(737);
});
it('anchors inside a tall action/result block, including restoration after its DOM is remounted', () => {
  content.innerHTML = '<div class="message-pair" data-coach-message="tool"><div class="action-card"></div></div>';
  let y = 200;
  const rect = () => ({ top: y - metrics.top + 50, bottom: y + 1800 - metrics.top + 50 });
  content.querySelector('.action-card').getBoundingClientRect = rect;
  bind(); read(); y += 240; grow(240); frame(); expect(metrics.top).toBe(840);
  owner.dispose(); const replacement = document.createElement('div'); replacement.className = 'action-card'; replacement.getBoundingClientRect = rect;
  content.querySelector('.action-card').replaceWith(replacement); metrics.top = 0; bind(); expect(metrics.top).toBe(840);
});
it('F/G keyboard and composer resize obey the current policy, never focus', () => {
  bind(); metrics.viewport = 330; resize(); frame(); expect(metrics.top).toBe(2070);
  read(); metrics.viewport = 230; resize(); frame(); expect(metrics.top).toBe(600);
  scroller.dispatchEvent(new Event('focusin')); frame(); expect(metrics.top).toBe(600);
  owner.latest(); frame(280); expect(metrics.top).toBe(2170);
  metrics.viewport = 600; resize(); frame(); expect(metrics.top).toBe(1800);
});
it('H many content/resize notifications coalesce into at most one write per frame', () => {
  bind(); writes.length = 0;
  for (let i = 0; i < 500; i++) { grow(1); owner.changed(); }
  expect(frames.size).toBe(1); expect(writes).toEqual([]);
  frame(); expect(writes).toHaveLength(1); expect(metrics.top).toBe(2300);
  expect(frames.size).toBe(0);
});
it('unmount cancels frames/listeners/observers and remount restores reading intention and anchor', () => {
  bind(); read(); grow(); owner.dispose(); expect(frames.size).toBe(0); expect(disconnects).toEqual(['resize', 'mutation']);
  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 })); resize(); mutation(); expect(frames.size).toBe(0);
  metrics.top = 0; bind(); expect(metrics.top).toBe(600); expect(ui.mode).toBe(READING_HISTORY);
  grow(); frame(); expect(metrics.top).toBe(600);
});
it('restores latest intention on remount with new content, without persisting to disk', () => {
  bind(); owner.dispose(); metrics.height += 200; metrics.top = 0; bind(); expect(metrics.top).toBe(2000); expect(ui.mode).toBe(FOLLOWING_LATEST);
});
it('I error/result/stop growth follows only while following; explicit retry resumes latest', () => {
  bind(); grow(); frame(); expect(metrics.top).toBe(1900);
  read(); grow(); frame(); expect(metrics.top).toBe(600);
  owner.latest(); frame(280); expect(metrics.top).toBe(2000);
  owner.changed(); frame(); expect(metrics.top).toBe(2000);
});
it('reduced motion jumps in one frame without animation', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true })); bind(); read(); owner.latest(); frame(); expect(metrics.top).toBe(1800); expect(frames.size).toBe(0);
});
it('manual touch/wheel/key interrupts an explicit jump; horizontal touch is left alone', () => {
  bind(); read(); owner.latest(); frame(40);
  const touch = (type, x, y) => { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] }); scroller.dispatchEvent(event); expect(event.defaultPrevented).toBe(false); };
  touch('touchstart', 100, 300); touch('touchmove', 150, 301); expect(ui.mode).toBe(FOLLOWING_LATEST);
  touch('touchmove', 151, 400); expect(ui.mode).toBe(READING_HISTORY); const stopped = metrics.top; grow(); frame(); expect(metrics.top).toBe(stopped);
  owner.latest(); frame(40); scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' })); expect(ui.mode).toBe(READING_HISTORY);
});
it('short conversations need no button, and reading state survives unavailable/removed anchor', () => {
  metrics.height = 200; bind(); expect(metrics.top).toBe(0); expect(ui.showLatest).toBe(false);
  metrics.height = 2400; resize(); frame(); read(); content.innerHTML = ''; mutation(); frame(); expect(metrics.top).toBe(600);
});
it('scroll keys on message actions break follow, but Space still activates the button normally', () => {
  bind(); const button = document.createElement('button'); content.append(button);
  button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); expect(ui.mode).toBe(FOLLOWING_LATEST);
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); expect(ui.mode).toBe(READING_HISTORY);
});
