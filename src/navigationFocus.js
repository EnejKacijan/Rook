// Preserve why ROOK moved focus, rather than trusting a resumed browser's
// focus-visible heuristic to reconstruct a prior touch interaction. This is
// opt-in for managed navigation focus, never a blanket pointer-mode CSS reset.
const bindings = new WeakMap();
const marker = 'data-rook-pointer-focus';
const action = 'button, a[href], [role="button"]';

export function bindNavigationFocus(doc = document) {
  if (bindings.has(doc)) return () => {};
  const keyboardRoot = doc.defaultView || doc;
  let modality = 'unknown';
  let marked = null;
  let managingFocus = false;
  const clear = () => { marked?.removeAttribute(marker); marked = null; };
  const pointer = () => { modality = 'pointer'; };
  const keyboard = event => {
    // OS/app-switch modifier keys alone are not in-app keyboard navigation.
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
    modality = 'keyboard'; clear();
  };
  const activation = event => {
    // A virtual/assistive activation is not proof of pointer intent. Preserve
    // native indication; do not assume VoiceOver is a keyboard or a pointer.
    if (event.detail === 0) { modality = 'unknown'; clear(); }
    else modality = 'pointer';
  };
  const focusChanged = event => {
    if (!managingFocus && event.target !== marked) {
      clear(); modality = 'unknown';
    }
  };
  const controller = {
    focus(target, options) {
      if (!target?.focus) return;
      clear();
      if (modality === 'pointer' && target.matches(action) && !target.isContentEditable) {
        marked = target; target.setAttribute(marker, 'true');
      }
      managingFocus = true;
      try { target.focus({ preventScroll: true, ...options }); }
      finally { managingFocus = false; }
      if (doc.activeElement !== target) clear();
    },
  };
  bindings.set(doc, controller);
  doc.addEventListener('pointerdown', pointer, true);
  doc.addEventListener('touchstart', pointer, { capture: true, passive: true });
  // Topmost viewers may stop Escape at window capture to protect their parent.
  // Observe intent first, without intercepting or changing those handlers.
  keyboardRoot.addEventListener('keydown', keyboard, true);
  doc.addEventListener('click', activation, true);
  doc.addEventListener('focusin', focusChanged, true);
  // No visibility/pageshow timer and no blur/refocus on resume. The origin of
  // the current managed focus survives app suspension; genuine navigation or
  // an assistive activation clears it immediately, before focus can move.
  return () => {
    clear(); bindings.delete(doc);
    doc.removeEventListener('pointerdown', pointer, true);
    doc.removeEventListener('touchstart', pointer, true);
    keyboardRoot.removeEventListener('keydown', keyboard, true);
    doc.removeEventListener('click', activation, true);
    doc.removeEventListener('focusin', focusChanged, true);
  };
}

export function focusNavigationTarget(target, options) {
  if (!target?.focus) return;
  const controller = bindings.get(target.ownerDocument);
  if (controller) controller.focus(target, options);
  else target.focus({ preventScroll: true, ...options });
}
