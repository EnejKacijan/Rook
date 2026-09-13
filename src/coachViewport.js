import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';

// Coach opts into the existing visible-viewport owner; it does not install a
// second keyboard/gesture manager. CSS keeps its document/ancestors non-scrolling.
export function bindCoachViewport(screen, transcript) {
  const compact = window.matchMedia('(max-width: 500px)');
  const keyboardAttribute = 'data-coach-keyboard-open';
  const priorKeyboard = screen.getAttribute(keyboardAttribute);
  let releaseViewport = () => {};
  let atBottom = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 48;
  const recordPosition = () => { atBottom = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 48; };
  const changed = () => { if (atBottom) transcript.scrollTop = transcript.scrollHeight; };
  const viewportChanged = ({ keyboardOpen }) => {
    // Focus may change before the keyboard closes (or remain after it closes).
    // The viewport owner replaces the full nav + safe-area footprint atomically.
    screen.toggleAttribute(keyboardAttribute, keyboardOpen);
    changed();
  };
  // Also account for native multiline growth removing transcript space.
  // Never move a reader who has deliberately scrolled away from the bottom.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(changed) : null;
  observer?.observe(transcript);
  transcript.addEventListener('scroll', recordPosition, { passive: true });
  const refresh = () => {
    releaseViewport();
    screen.removeAttribute(keyboardAttribute);
    releaseViewport = compact.matches
      ? bindSheetVisibleViewport(screen, viewportChanged, { fullPage: true })
      : () => {};
  };
  const foreground = () => { if (!document.hidden) refresh(); };
  compact.addEventListener('change', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', foreground);
  refresh();
  return () => {
    observer?.disconnect();
    transcript.removeEventListener('scroll', recordPosition);
    releaseViewport();
    if (priorKeyboard === null) screen.removeAttribute(keyboardAttribute);
    else screen.setAttribute(keyboardAttribute, priorKeyboard);
    compact.removeEventListener('change', refresh);
    window.removeEventListener('pageshow', refresh);
    document.removeEventListener('visibilitychange', foreground);
  };
}
