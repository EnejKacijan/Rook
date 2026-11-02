import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {followDisclosure, markUserActivation, revealDistance, visibleArea} from './disclosureFollow.js';

const area = {top: 60, bottom: 700};

describe('revealDistance', () => {
  it('stays still when the opened content is already visible', () => {
    expect(revealDistance({anchorTop: 200, nodeTop: 240, finalHeight: 300, area, maxScroll: 2000})).toBe(0);
  });
  it('scrolls only as far as the new content needs', () => {
    expect(revealDistance({anchorTop: 520, nodeTop: 560, finalHeight: 200, area, maxScroll: 2000})).toBe(60);
  });
  it('keeps the trigger as the top orientation point for long sections', () => {
    expect(revealDistance({anchorTop: 500, nodeTop: 540, finalHeight: 1600, area, maxScroll: 2000})).toBe(440);
  });
  it('never scrolls past the end of the container or above the trigger', () => {
    expect(revealDistance({anchorTop: 520, nodeTop: 560, finalHeight: 400, area, maxScroll: 90})).toBe(90);
    expect(revealDistance({anchorTop: 40, nodeTop: 80, finalHeight: 900, area, maxScroll: 2000})).toBe(0);
  });
});

describe('followDisclosure', () => {
  let scroller, node, trigger, frames, height;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('matchMedia', () => ({matches: false}));
    scroller = document.createElement('main');
    scroller.style.overflowY = 'auto';
    trigger = document.createElement('button');
    trigger.setAttribute('aria-expanded', 'true');
    node = document.createElement('div');
    scroller.append(trigger, node);
    document.body.append(scroller);
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', {configurable: true, get: () => top, set: value => { top = Math.max(0, Math.min(value, 1000)); }});
    Object.defineProperty(scroller, 'scrollHeight', {configurable: true, value: 1800});
    Object.defineProperty(scroller, 'clientHeight', {configurable: true, value: 800});
    scroller.getBoundingClientRect = () => ({top: 0, bottom: 800, left: 0, right: 393});
    trigger.getBoundingClientRect = () => ({top: 600 - top, bottom: 644 - top, height: 44, width: 393});
    height = 0;
    node.getBoundingClientRect = () => ({top: 644 - top, bottom: 644 - top + height, height, left: 0, right: 393});
    vi.stubGlobal('innerHeight', 800);
    markUserActivation(undefined, trigger);
  });
  afterEach(() => { scroller.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const step = h => { height = h; frames.shift()?.(); };

  it('moves with the expansion and lands where the content is visible', () => {
    const follow = followDisclosure(node, {from: 0, to: 300, animated: true});
    expect(follow).not.toBeNull();
    step(150); const halfway = scroller.scrollTop;
    step(300);
    expect(halfway).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(156);
    follow.finish();
    expect(scroller.scrollTop).toBe(156);
  });

  it('hands control to the user on their first scroll gesture', () => {
    const onTakeover = vi.fn();
    const follow = followDisclosure(node, {from: 0, to: 300, animated: true, onTakeover});
    step(100); const before = scroller.scrollTop;
    scroller.dispatchEvent(new Event('touchstart'));
    step(300); follow.finish();
    expect(scroller.scrollTop).toBe(before);
    expect(onTakeover).toHaveBeenCalledOnce();
  });

  it('lets native document scrolling take over the page', () => {
    scroller.style.overflowY = 'visible';
    const page = document.documentElement;
    vi.spyOn(page, 'scrollHeight', 'get').mockReturnValue(1800);
    vi.spyOn(page, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(page, 'scrollTop', 'get').mockImplementation(() => scroller.scrollTop);
    vi.spyOn(page, 'scrollTop', 'set').mockImplementation(value => { scroller.scrollTop = value; });
    const onTakeover = vi.fn();
    const follow = followDisclosure(node, {from: 0, to: 300, animated: true, onTakeover});
    step(100);page.scrollTop += 30;const manual = page.scrollTop;
    document.dispatchEvent(new Event('scroll'));
    step(300);follow.finish();
    expect(page.scrollTop).toBe(manual);
    expect(onTakeover).toHaveBeenCalledOnce();
  });

  it('jumps straight to the final place with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({matches: true}));
    height = 300;
    followDisclosure(node, {from: 0, to: 300, animated: true});
    expect(scroller.scrollTop).toBe(156);
    frames.shift()?.();
    expect(scroller.scrollTop).toBe(156);
  });

  it('ignores openings the user did not cause, unless forced', () => {
    markUserActivation(-10000);
    expect(followDisclosure(node, {from: 0, to: 300, animated: true})).toBeNull();
    expect(followDisclosure(node, {from: 0, to: 300, animated: true, force: true})).not.toBeNull();
  });

  it('ignores an unrelated action in the same page scroll area', () => {
    const snackbar = document.createElement('aside'), undo = document.createElement('button');
    undo.textContent = 'Undo';snackbar.append(undo);scroller.append(snackbar);
    markUserActivation(undefined, undo);
    expect(followDisclosure(node, {from: 0, to: 300, animated: true})).toBeNull();
  });

  it('uses the section trigger when a forced opening follows an unrelated action', () => {
    const snackbar = document.createElement('aside'), undo = document.createElement('button');
    undo.textContent = 'Undo';snackbar.append(undo);scroller.append(snackbar);
    snackbar.getBoundingClientRect = () => ({top: 750, bottom: 790, height: 40, width: 393});
    markUserActivation(undefined, undo);
    const follow = followDisclosure(node, {from: 0, to: 300, animated: true, force: true});
    step(300);follow.finish();
    expect(scroller.scrollTop).toBe(156);
  });

  it('holds the pressed trigger while a section above collapses', () => {
    let collapse = 200;
    scroller.scrollTop = 300;
    trigger.getBoundingClientRect = () => ({top: 700 + collapse - scroller.scrollTop, bottom: 0, height: 44, width: 393});
    node.getBoundingClientRect = () => ({top: 744 + collapse - scroller.scrollTop, bottom: 0, height, left: 0, right: 393});
    collapse = 200; markUserActivation(undefined, trigger);
    const follow = followDisclosure(node, {from: 0, to: 300, animated: true});
    collapse = 100; step(150);
    collapse = 0; step(300); follow.finish();
    // Without the hold the trigger would rise by the collapsed 200px as well.
    expect(trigger.getBoundingClientRect().top).toBe(600 - 156);
  });

  it('treats the on-screen keyboard as the bottom edge', () => {
    vi.stubGlobal('visualViewport', {offsetTop: 0, height: 420});
    expect(visibleArea(scroller, node).bottom).toBe(408);
  });

  it('keeps clear of a sticky footer', () => {
    const footer = document.createElement('div');
    footer.style.position = 'sticky';
    footer.getBoundingClientRect = () => ({top: 720, bottom: 800});
    scroller.append(footer);
    vi.stubGlobal('document', Object.assign(document, {elementsFromPoint: (x, y) => y > 720 ? [footer, scroller] : [scroller]}));
    expect(visibleArea(scroller, node)).toEqual({top: 12, bottom: 708});
    delete document.elementsFromPoint;
  });
});
