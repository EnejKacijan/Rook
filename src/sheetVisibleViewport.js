// One observer shared by Coach, sheets, and their footer/search consumers.
const viewports = new WeakMap();
const panels = new WeakMap();

export function observeVisibleViewport(onChange = () => {}) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  let owner = viewports.get(viewport);
  if (!owner) {
    const listeners = new Set();
    const heights = new Map();
    const read = () => {
      const width = window.innerWidth;
      const unscaledHeight = viewport.height * (viewport.scale || 1);
      // WebKit can shrink both viewports; retain unobscured geometry across
      // panel changes. Focus, browser chrome (<100px), and zoom aren't keyboards.
      const reference = Math.max(heights.get(width) || 0, window.innerHeight, document.documentElement.clientHeight, unscaledHeight);
      heights.set(width, reference);
      return { height: viewport.height, offsetTop: viewport.offsetTop, referenceHeight: reference, keyboardOpen: reference - unscaledHeight > 100 };
    };
    const refresh = () => {
      const next=read();
      if(Object.keys(next).every(key=>next[key]===owner.state[key]))return;
      owner.state=next;listeners.forEach(listener=>listener(next));
    };
    const foreground = () => { if (!document.hidden) refresh(); };
    owner = { listeners, state: read(), refresh, foreground };
    viewports.set(viewport, owner);
    viewport.addEventListener('resize', refresh);
    viewport.addEventListener('scroll', refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', foreground);
  }
  owner.listeners.add(onChange);
  onChange(owner.state);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owner.listeners.delete(onChange);
    if (owner.listeners.size) return;
    viewport.removeEventListener('resize', owner.refresh);
    viewport.removeEventListener('scroll', owner.refresh);
    window.removeEventListener('resize', owner.refresh);
    window.removeEventListener('orientationchange', owner.refresh);
    window.removeEventListener('pageshow', owner.refresh);
    document.removeEventListener('visibilitychange', owner.foreground);
    viewports.delete(viewport);
  };
}

/** One geometry writer per panel, even when modal, footer and search subscribe.
 * Ordinary sheets retain their existing closed-keyboard size. */
export function bindSheetVisibleViewport(screen, onChange = () => {}, { fullPage = false, keyboardOnly = false, stableTop = false } = {}) {
  const layer = screen?.parentElement?.classList.contains('modal-layer') ? screen.parentElement : null;
  if ((!layer && !fullPage) || !window.visualViewport) return () => {};
  let owner = panels.get(screen);
  if (!owner) {
    const surface = layer || screen;
    const geometry = [[surface, 'height'], [surface, 'top'], [surface, 'bottom'], [screen, 'max-height'], [screen, '--sheet-visible-height'], [screen, '--sheet-reference-height'],
      ...(layer ? [[layer, 'padding-top'], [layer, 'padding-bottom'], [layer, '--sheet-obscured-bottom']] : []),
      ...(layer && stableTop ? [[layer, 'align-items'], [screen, 'height']] : [])];
    const properties = [...geometry, [screen, '--sheet-action-safe-bottom'], [screen, '--rook-sheet-safe-bottom']];
    const prior = properties.map(([node, name]) => [node.style.getPropertyValue(name), node.style.getPropertyPriority(name)]);
    const priorKeyboard = screen.getAttribute('data-sheet-keyboard-open');
    const restore = entries => entries.forEach(([node, name], index) => {
      if (prior[index][0]) node.style.setProperty(name, ...prior[index]);
      else node.style.removeProperty(name);
    });
    // Opt-in tall information/editor sheets keep their resting top. Capture
    // layout offsets (not the entrance/drag transform) before native focus can
    // resize dynamic viewport units. The same owner writes ALL geometry.
    let resting = null, pinned = false, changed = false, revealed = false, revealTimer = null, revealFrame = null;
    const captureResting = () => {
      if (!layer || !stableTop || pinned) return;
      resting = { top: screen.offsetTop, height: screen.offsetHeight };
    };
    const cancelReveal = () => { clearTimeout(revealTimer); cancelAnimationFrame(revealFrame); revealTimer = revealFrame = null; };
    const reveal = () => {
      cancelReveal();
      if (!stableTop || !owner.state?.keyboardOpen) return;
      // Debounce geometry, not focus/typing. Native reveal gets the opening
      // frames; one minimal internal correction follows settled geometry.
      revealTimer = setTimeout(() => {
        revealTimer = null;
        revealFrame = requestAnimationFrame(() => {
          revealFrame = null;
          const input = document.activeElement;
          if (!owner.state?.keyboardOpen || screen.inert || !screen.contains(input) || !input.matches('textarea, input')) return;
          const bounds = input.getBoundingClientRect(), panel = screen.getBoundingClientRect();
          const top = (screen.querySelector('.detail-header')?.getBoundingClientRect().bottom || panel.top) + 12;
          const bottom = Math.min(panel.bottom, owner.state.offsetTop + owner.state.height) - 12;
          revealed = true;
          if (bottom - top < bounds.height) return; // Native caret scrolling owns very short/zoomed viewports.
          if (bounds.bottom > bottom) screen.scrollTop += bounds.bottom - bottom;
          else if (bounds.top < top) screen.scrollTop -= top - bounds.top;
        });
      }, 120);
    };
    captureResting();
    owner = { consumers: new Set(), state: null, apply: () => {
      const state = owner.state;
      if (!state) return;
      const reduced = state.referenceHeight - state.height > 2 && (window.visualViewport.scale || 1) === 1;
      if (stableTop && layer) {
        // Geometry, not activeElement, ends keyboard mode (Done can retain focus).
        if (reduced) { pinned = true; changed = true; }
        else if (changed) { pinned = changed = false; restore(geometry); }
        if (!pinned) captureResting();
      }
      if (pinned || state.keyboardOpen || [...owner.consumers].some(consumer => !consumer.keyboardOnly)) {
        if (layer) {
          // The fixed backdrop must cover the layout viewport, including behind
          // translucent keyboard chrome. Only its flex content box follows the
          // visible viewport. Leave the panel's transform to drag/navigation.
          const visibleBottom = state.offsetTop + state.height;
          const coverageHeight = Math.max(state.referenceHeight, visibleBottom);
          const obscuredBottom = coverageHeight - visibleBottom;
          layer.style.height = `${coverageHeight}px`;
          layer.style.top = '0px';
          layer.style.paddingTop = `${state.offsetTop}px`;
          layer.style.paddingBottom = `${obscuredBottom}px`;
          layer.style.setProperty('--sheet-obscured-bottom', `${obscuredBottom}px`);
          if (stableTop && resting) {
            // Preserve the visual top; if extremely short, reserve enough room
            // for the existing header and field instead of walking downwards.
            const top = Math.min(resting.top, Math.max(0, state.height - 200));
            const height = Math.max(1, Math.min(resting.height, state.height - top));
            layer.style.alignItems = 'flex-start';
            layer.style.paddingTop = `${state.offsetTop + top}px`;
            screen.style.height = `${height}px`;
          }
        } else {
          // Full-page Coach/import editors own their visible surface directly.
          screen.style.height = `${state.height}px`;
          screen.style.top = `${state.offsetTop}px`;
        }
        surface.style.bottom = 'auto';
        screen.style.maxHeight = stableTop && layer ? screen.style.height : `${Math.max(1, state.height - (layer ? 12 : 0))}px`;
        screen.style.setProperty('--sheet-visible-height', `${state.height}px`);
        screen.style.setProperty('--sheet-reference-height', `${state.referenceHeight}px`);
      } else restore(geometry);
      screen.toggleAttribute('data-sheet-keyboard-open', state.keyboardOpen);
      screen.style.setProperty('--sheet-action-safe-bottom', state.keyboardOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)');
      // Resolve locally: a computed token inherited from :root would retain
      // the closed-keyboard home-indicator inset even after its input changes.
      screen.style.setProperty('--rook-sheet-safe-bottom', 'calc(var(--rook-sheet-content-bottom, 20px) + var(--sheet-action-safe-bottom))');
      owner.consumers.forEach(consumer => consumer.onChange(state));
    }, restore: () => {
      restore(properties);
      if (priorKeyboard === null) screen.removeAttribute('data-sheet-keyboard-open');
      else screen.setAttribute('data-sheet-keyboard-open', priorKeyboard);
    } };
    const focus = event => {
      if (!stableTop || !event.target.matches('textarea, input') || screen.inert) return;
      captureResting(); pinned = true; revealed = false; owner.apply(); reveal();
    };
    const prepareFocus = event => {
      if (!event.target.matches('textarea, input')) return;
      captureResting();
      // Tapping the same field after keyboard Done need not fire focusin again.
      if (document.activeElement === event.target) focus(event);
    };
    const blur = () => {
      if (!changed && !owner.state?.keyboardOpen) { pinned = false; owner.apply(); }
      cancelReveal();
    };
    if (stableTop) {
      screen.addEventListener('pointerdown', prepareFocus);
      screen.addEventListener('focusin', focus);
      screen.addEventListener('focusout', blur);
    }
    panels.set(screen, owner);
    const releaseViewport = observeVisibleViewport(state => {
      const previous = owner.state;
      owner.state = state; owner.apply();
      // Once revealed, growing space (including keyboard close) never pulls
      // the user's latest scroll position back to the note.
      if (!revealed || !previous || state.height < previous.height || state.offsetTop !== previous.offsetTop) reveal();
      else cancelReveal();
    });
    owner.release = () => {
      cancelReveal(); releaseViewport();
      screen.removeEventListener('pointerdown', prepareFocus);
      screen.removeEventListener('focusin', focus);
      screen.removeEventListener('focusout', blur);
    };
  }
  const consumer = { onChange, keyboardOnly };
  owner.consumers.add(consumer);
  owner.apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owner.consumers.delete(consumer);
    if (owner.consumers.size) { owner.apply(); return; }
    owner.release();
    owner.restore();
    panels.delete(screen);
  };
}
