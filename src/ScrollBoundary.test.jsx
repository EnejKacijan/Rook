// @vitest-environment jsdom
import React, {act, createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {bindOverflowScrollBoundary, ScrollBoundary} from './ScrollBoundary.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let element, height, content, observers, release, root;
beforeEach(() => {
  height = 200; content = 100; observers = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.notify = callback; observers.push(this); }
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  });
  element = document.createElement('div'); document.body.append(element);
  Object.defineProperties(element, {
    clientHeight: {get:() => height}, scrollHeight: {get:() => content},
  });
});
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  release?.(); release = null; element.remove(); vi.unstubAllGlobals();
});
const bounded = () => element.hasAttribute('data-rook-overflow-scroll');

it('lets a fitting or hidden inner list pass scrolling to its page', () => {
  release = bindOverflowScrollBoundary(element);
  expect(bounded()).toBe(false);
  height = 0; content = 300; observers[0].notify();
  expect(bounded()).toBe(false);
});

it('contains a long list without changing its scroll position or intercepting gestures', () => {
  content = 600; element.scrollTop = 120;
  release = bindOverflowScrollBoundary(element);
  expect(bounded()).toBe(true); expect(element.scrollTop).toBe(120);
  for (const type of ['touchstart', 'touchmove', 'pointermove', 'wheel']) {
    const event = new Event(type, {bubbles:true, cancelable:true});
    element.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
});

it('releases the inner boundary when a larger viewport makes the list fit', () => {
  content = 600; release = bindOverflowScrollBoundary(element);
  expect(bounded()).toBe(true);
  height = 700; observers[0].notify(); expect(bounded()).toBe(false);
  height = 300; observers[0].notify(); expect(bounded()).toBe(true);
});

it('responds to additions, removals and text updates without observing its own marker', async () => {
  release = bindOverflowScrollBoundary(element);
  const row = document.createElement('p'); row.textContent = 'Exercise';
  content = 500; element.append(row);
  await Promise.resolve(); expect(bounded()).toBe(true);
  expect(observers[0].observe).toHaveBeenCalledWith(row);
  content = 100; row.firstChild.data = 'Short';
  await Promise.resolve(); expect(bounded()).toBe(false);
  row.remove(); await Promise.resolve();
  expect(observers[0].unobserve).toHaveBeenCalledWith(row);
});

it('handles late image sizing and resize when ResizeObserver is unavailable', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  release = bindOverflowScrollBoundary(element);
  const image = document.createElement('img'); element.append(image);
  content = 500; image.dispatchEvent(new Event('load'));
  expect(bounded()).toBe(true);
  height = 700; window.dispatchEvent(new Event('resize'));
  expect(bounded()).toBe(false);
});

it('disconnects on exit and restores the prior DOM marker', () => {
  element.setAttribute('data-rook-overflow-scroll', 'prior');
  content = 500; const stop = bindOverflowScrollBoundary(element);
  stop(); expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(element.getAttribute('data-rook-overflow-scroll')).toBe('prior');
  window.dispatchEvent(new Event('resize'));
  expect(element.getAttribute('data-rook-overflow-scroll')).toBe('prior');
});

it('preserves the actual DOM node, forwarded ref and text semantics for existing callers', () => {
  const ref = createRef(); root = createRoot(element);
  act(() => root.render(<ScrollBoundary ref={ref} as="pre" className="export-preview" tabIndex={0} aria-label="Plan preview">Plan text</ScrollBoundary>));
  expect(element.childElementCount).toBe(1);
  expect(ref.current).toBe(element.firstElementChild);
  expect(ref.current.tagName).toBe('PRE');
  expect(ref.current.textContent).toBe('Plan text');
  expect(ref.current.getAttribute('aria-label')).toBe('Plan preview');
  act(() => root.render(<ScrollBoundary ref={ref} className="up-next-queue">Exercise</ScrollBoundary>));
  expect(element.childElementCount).toBe(1); expect(ref.current.tagName).toBe('DIV');
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
});
