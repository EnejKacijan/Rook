import {useLayoutEffect, useRef} from 'react';

// The shared Disclosure owns the 200ms animation. Only keep the current exercise
// below the sticky header if collapsing a scrolled checklist would hide it.
export function useWarmupCollapseAnchor(open, regionRef) {
  const previous = useRef(open);
  useLayoutEffect(() => {
    const closing = previous.current && !open;
    previous.current = open;
    const region = regionRef.current;
    if (!closing || !region) return;
    const screen = region.closest('.workout-screen');
    const heading = screen?.querySelector('.exercise-heading');
    let scroller = region.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    scroller ||= region.ownerDocument.scrollingElement;
    const keepVisible = () => {
      if (!scroller || !heading) return;
      const top = Math.max(0, screen.querySelector('.workout-header')?.getBoundingClientRect().bottom || 0) + 12;
      const delta = heading.getBoundingClientRect().top - top;
      if (delta < 0) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    };
    keepVisible();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepVisible);
    observer?.observe(region);
    const timer = setTimeout(() => observer?.disconnect(), 220);
    return () => {clearTimeout(timer); observer?.disconnect();};
  }, [open, regionRef]);
}
