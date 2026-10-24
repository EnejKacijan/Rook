import React, {forwardRef, useCallback, useLayoutEffect, useRef} from 'react';
import './scrollBoundary.css';

// Optional inner scrollers must hand a gesture to their parent while they fit.
// Once they overflow, stop at their own edge without a local rubber-band effect.
// No touch interception, scroll-position writes or viewport/zoom restrictions.
export function bindOverflowScrollBoundary(element) {
  const attribute = 'data-rook-overflow-scroll';
  const previous = element.getAttribute(attribute);
  const view = element.ownerDocument.defaultView;
  const measure = () => {
    const overflowing = element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1;
    if (overflowing && !element.hasAttribute(attribute)) element.setAttribute(attribute, '');
    else if (!overflowing && element.hasAttribute(attribute)) element.removeAttribute(attribute);
  };
  const sizes = view.ResizeObserver ? new view.ResizeObserver(measure) : null;
  const children = new Set();
  const observeChildren = () => {
    for (const child of children) if (child.parentElement !== element) {
      sizes?.unobserve(child); children.delete(child);
    }
    for (const child of element.children) if (!children.has(child)) {
      children.add(child); sizes?.observe(child);
    }
  };
  sizes?.observe(element);
  observeChildren();
  const mutations = new view.MutationObserver(() => { observeChildren(); measure(); });
  mutations.observe(element, {childList:true, subtree:true, characterData:true});
  element.addEventListener('load', measure, true);
  view.addEventListener('resize', measure);
  measure();
  return () => {
    sizes?.disconnect(); mutations.disconnect();
    element.removeEventListener('load', measure, true);
    view.removeEventListener('resize', measure);
    if (previous === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, previous);
  };
}

export const ScrollBoundary = forwardRef(function ScrollBoundary({as:Tag = 'div', ...props}, forwardedRef) {
  const element = useRef(null);
  const attach = useCallback(node => {
    element.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  useLayoutEffect(() => bindOverflowScrollBoundary(element.current), [Tag]);
  return <Tag {...props} ref={attach}/>;
});
