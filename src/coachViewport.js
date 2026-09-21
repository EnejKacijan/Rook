import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';

// Coach opts into the existing visible-viewport owner; it does not install a
// second keyboard/gesture manager. CSS keeps its document/ancestors non-scrolling.
export function bindCoachViewport(screen) {
  const compact = window.matchMedia('(max-width: 500px)');
  const keyboardAttribute = 'data-coach-keyboard-open';
  const priorKeyboard = screen.getAttribute(keyboardAttribute);
  let releaseViewport = () => {};
  const viewportChanged = ({ keyboardOpen }) => {
    // Focus may change before the keyboard closes (or remain after it closes).
    // The viewport owner replaces the full nav + safe-area footprint atomically.
    screen.toggleAttribute(keyboardAttribute, keyboardOpen);
  };
  // The transcript's single scroll owner observes the resulting geometry.
  // Keyboard focus/resize must never decide whether a reader follows latest.
  const refresh = () => {
    releaseViewport();
    screen.removeAttribute(keyboardAttribute);
    releaseViewport = compact.matches
      ? bindSheetVisibleViewport(screen, viewportChanged, { fullPage: true })
      : () => {};
  };
  compact.addEventListener('change', refresh);
  refresh();
  return () => {
    releaseViewport();
    if (priorKeyboard === null) screen.removeAttribute(keyboardAttribute);
    else screen.setAttribute(keyboardAttribute, priorKeyboard);
    compact.removeEventListener('change', refresh);
  };
}
