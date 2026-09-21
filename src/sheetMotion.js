const preparedPanels = new WeakMap();

// Full off-screen travel, with a bounded duration for compact through tall sheets.
export function sheetEntryDuration(height) {
  return Math.round(Math.min(240, Math.max(160, 120 + (height + 24) * 0.15)));
}

export function prepareSheetEntry(panel) {
  if (!panel?.matches('.screen, .sheet') ||
      panel.parentElement?.matches('.exercise-visual-layer, .edit-plan-page-layer')) return () => {};
  // Before paint, once per panel identity (including StrictMode). Content,
  // viewport and theme updates must not retime or replay an in-flight entrance.
  let entry = preparedPanels.get(panel);
  if (!entry) {
    panel.style.setProperty('--rook-sheet-enter-play-state', 'paused');
    const duration = `${sheetEntryDuration(panel.getBoundingClientRect().height)}ms`;
    panel.style.setProperty('--rook-sheet-enter-duration', duration);
    panel.parentElement.style.setProperty('--rook-sheet-enter-duration', duration);
    entry = { started: false, frame: null };
    preparedPanels.set(panel, entry);
  }
  // WebKit can advance a CSS animation during the mounting task. Keep its
  // zero pose until the presentation frame, then start panel and scrim together.
  // This is a paint boundary, not a delay waiting for Today/date state to settle.
  if (!entry.started && entry.frame === null) entry.frame = requestAnimationFrame(() => {
    entry.frame = null;
    if (!panel.isConnected) return;
    entry.started = true;
    panel.style.setProperty('--rook-sheet-enter-play-state', 'running');
    panel.parentElement.style.setProperty('--rook-sheet-enter-play-state', 'running');
  });
  const frame = entry.frame;
  return () => {
    if (frame !== null && entry.frame === frame) { cancelAnimationFrame(frame); entry.frame = null; }
  };
}

export function freezeSheetMotion(layer, panel) {
  const transform = getComputedStyle(panel).transform;
  const background = getComputedStyle(layer).backgroundColor;
  panel.style.transition = layer.style.transition = 'none';
  panel.style.transform = transform;
  layer.style.backgroundColor = background;
  panel.style.animation = layer.style.animation = 'none';
  // Commit the current painted pose before transitioning out, also when close
  // interrupts entry. Cancelling CSS animation first would jump to Y=0.
  return panel.getBoundingClientRect().height;
}
