import { useLayoutEffect } from 'react';
import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';
import './exerciseSearchSheet.css';

/** Only the modal exercise-search states opt into a stable expanded surface. */
export function useExerciseSearchSheet(ref, enabled = true, { focusedSearch = false } = {}) {
  useLayoutEffect(() => {
    const screen = ref.current;
    if (!screen || !enabled) return;
    screen.classList.add('exercise-search-sheet');
    const release = bindSheetVisibleViewport(screen);
    const releaseFocus = focusedSearch ? bindExerciseSearchFocus(screen) : () => {};
    return () => { releaseFocus(); release(); screen.classList.remove('exercise-search-sheet'); };
  }, [ref, enabled, focusedSearch]);
}

/** Opt-in picker chrome only. No input replacement, query state or search work. */
export function bindExerciseSearchFocus(screen) {
  const input = screen.querySelector('.rook-search-field > input[type="search"]');
  if (!input) return () => {};
  const field = input.parentElement;
  const results = screen.querySelector('[data-exercise-search-scroll]');
  const targets = [field, results].filter(Boolean);
  const viewport = window.visualViewport;
  let focused = false, blurFrame = null;
  let keyboard = Boolean(viewport && innerHeight - viewport.height > 100);
  const animations = new Map();
  const update = next => {
    if (focused === next) return;
    const before = targets.map(node => node.getBoundingClientRect().top);
    animations.forEach(animation => animation.cancel()); animations.clear();
    focused = next;
    screen.classList.toggle('is-search-focused', next);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const easing = getComputedStyle(screen).getPropertyValue('--rook-ease-standard').trim() || 'cubic-bezier(.2, 0, 0, 1)';
    targets.forEach((node, index) => {
      const offset = before[index] - node.getBoundingClientRect().top;
      if (Math.abs(offset) < .5 || !node.animate) return;
      // Layout reaches its final state immediately; transform-only FLIP settles
      // the same live input/results without delaying focus or keyboard input.
      const animation = node.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing });
      animations.set(node, animation);
      animation.finished.then(() => { if (animations.get(node) === animation) animations.delete(node); }, () => {});
    });
  };
  const enter = () => { cancelAnimationFrame(blurFrame); update(true); };
  const leave = event => {
    if (field.contains(event.relatedTarget)) return; // Clear is still searching.
    cancelAnimationFrame(blurFrame);
    blurFrame = requestAnimationFrame(() => { if (!field.contains(document.activeElement)) update(false); });
  };
  const viewportChanged = () => {
    const next = innerHeight - viewport.height > 100;
    if (keyboard && !next) update(false);
    keyboard = next;
  };
  input.addEventListener('focus', enter);
  input.addEventListener('pointerdown', enter); // Re-enter after keyboard Done.
  input.addEventListener('blur', leave);
  viewport?.addEventListener('resize', viewportChanged);
  return () => {
    cancelAnimationFrame(blurFrame);
    animations.forEach(animation => animation.cancel());
    input.removeEventListener('focus', enter);
    input.removeEventListener('pointerdown', enter);
    input.removeEventListener('blur', leave);
    viewport?.removeEventListener('resize', viewportChanged);
    screen.classList.remove('is-search-focused');
  };
}
