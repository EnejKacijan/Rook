/** Shared opt-in sheet containment: visualViewport uses layout-viewport coordinates.
 * Keyboard resize and Safari pan are independent; neither depends on content size.
 */
export function bindSheetVisibleViewport(screen, onChange = () => {}, { fullPage = false } = {}) {
  const layer = screen?.parentElement?.classList.contains('modal-layer') ? screen.parentElement : null;
  const viewport = window.visualViewport;
  if ((!layer && !fullPage) || !viewport) return () => {};
  const surface = layer || screen;
  const properties = [[surface, 'height'], [surface, 'top'], [surface, 'bottom'], [screen, 'max-height'],
    [screen, '--sheet-visible-height'], [screen, '--sheet-action-safe-bottom']];
  const prior = properties.map(([node, name]) => node.style.getPropertyValue(name));
  const resize = () => {
    const keyboardOpen = window.innerHeight - viewport.height > 100;
    surface.style.height = `${viewport.height}px`;
    surface.style.top = `${viewport.offsetTop}px`;
    surface.style.bottom = 'auto';
    screen.style.maxHeight = `${Math.max(1, viewport.height - (layer ? 12 : 0))}px`;
    screen.style.setProperty('--sheet-visible-height', `${viewport.height}px`);
    screen.style.setProperty('--sheet-action-safe-bottom', keyboardOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)');
    // Consumers that replace navigation need the same inset decision, not a
    // second focus-based keyboard detector. Existing sheet callbacks ignore it.
    onChange({ keyboardOpen });
  };
  viewport.addEventListener('resize', resize);
  viewport.addEventListener('scroll', resize);
  resize();
  return () => {
    viewport.removeEventListener('resize', resize);
    viewport.removeEventListener('scroll', resize);
    properties.forEach(([node, name], index) => {
      if (prior[index]) node.style.setProperty(name, prior[index]);
      else node.style.removeProperty(name);
    });
  };
}
