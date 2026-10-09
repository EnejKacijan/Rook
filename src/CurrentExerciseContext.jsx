import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {rootScrollOwner} from './activeTabNavigation.js';
import './currentExerciseContext.css';

// Visibility is presentation only. The active logger remains the sole owner of
// the exercise name/index and drafts; this shortcut changes scroll, never data.
export function CurrentExerciseContext({name, identity, screenRef, titleRef}) {
  const contextRef = useRef(null);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => { setShown(false); }, [identity]);
  // The title is a later sibling of the toolbar. Attach only after all sibling
  // refs have committed; hide synchronously on exercise changes before paint.
  useEffect(() => {
    const title = titleRef.current, header = contextRef.current?.closest('.workout-header');
    const owner = rootScrollOwner(screenRef.current);
    if (!title || !header || !owner) return;
    const doc = title.ownerDocument, win = doc.defaultView;
    const root = [doc.scrollingElement, doc.documentElement, doc.body].includes(owner) ? null : owner;
    let observer, inset = -1, extent = -1, frame = null, disposed = false;
    const measure = () => {
      frame = null;
      if (disposed || !title.isConnected) return;
      const top = (root?.getBoundingClientRect().top || 0) + inset;
      setShown(title.getBoundingClientRect().bottom <= top);
    };
    const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(measure); };
    const observe = () => {
      const next = header.getBoundingClientRect().height + (parseFloat(win.getComputedStyle(header).top) || 0);
      const nextExtent = owner.scrollHeight;
      if (next === inset && nextExtent === extent) { if (!observer) schedule(); return; }
      inset = next; extent = nextExtent;
      observer?.disconnect();
      if (typeof win.IntersectionObserver === 'function') {
        // Extend the lower bound through this scroll owner's content. The title
        // stays intersecting while below the viewport; even a fast jump from
        // below to above the toolbar therefore crosses an observed boundary.
        observer = new win.IntersectionObserver(entries => {
          const entry = entries.find(item => item.target === title);
          if (disposed || !title.isConnected || !entry) return;
          // Offscreen BELOW a long warm-up is not a scrolled-away exercise.
          const top = entry.rootBounds?.top ?? (root?.getBoundingClientRect().top || 0) + inset;
          setShown(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
        }, {root, rootMargin: `-${inset}px 0px ${extent}px 0px`, threshold: 0});
        observer.observe(title);
        // Establish restored-scroll/reflow visibility once; scrolling itself is
        // observer-driven and never takes a synchronous layout measurement.
        measure();
      } else schedule();
    };
    observe();
    const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(observe) : null;
    resize?.observe(header); resize?.observe(screenRef.current);
    const scrollTarget = root || doc;
    if (typeof win.IntersectionObserver !== 'function') scrollTarget.addEventListener('scroll', schedule, {passive: true});
    win.addEventListener('resize', observe);
    return () => {
      disposed = true;
      observer?.disconnect(); resize?.disconnect();
      scrollTarget.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', observe);
      if (frame !== null) win.cancelAnimationFrame(frame);
    };
  }, [identity, screenRef, titleRef]);

  const returnToExercise = event => {
    const title = titleRef.current, header = contextRef.current?.closest('.workout-header');
    const owner = rootScrollOwner(screenRef.current);
    if (!title || !header || !owner) return;
    const hero = title.closest('.exercise-heading') || title;
    const top = Math.max(0, owner.scrollTop + hero.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    const reduced = title.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    owner.scrollTo({top, behavior: reduced ? 'instant' : 'smooth'});
    // Keyboard activation must not strand focus in the context as it hides.
    // Touch retains any raw logger input draft/focus instead of committing it.
    if (event.detail === 0) title.focus({preventScroll: true});
  };
  return <div ref={contextRef} className={`logger-exercise-context${shown ? ' is-visible' : ''}`}
    aria-hidden={shown ? undefined : true} inert={shown ? undefined : ''}>
    <ExerciseNavigationButton type="button" data-workout-scroll
      className="logger-exercise-context-button" disabled={!shown} tabIndex={shown ? 0 : -1}
      aria-label={`Return to ${name}`} title={name}
      onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
      onClick={returnToExercise}>
      <span>{name}</span>
    </ExerciseNavigationButton>
  </div>;
}
