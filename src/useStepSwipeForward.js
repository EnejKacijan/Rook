import {useEffect, useRef} from 'react';
import {bindEdgeNavigation, standaloneNavigation} from './edgeBack.js';
import {pageBackMotion} from './swipePageMotion.js';

// Explicit opt-in by Build questionnaire / Import decisions only. Never infer
// Forward from a primary button. Each caller supplies its navigation-only guard.
export function useStepSwipeForward(rootRef, {active, step, enabled, onForward, edgeSurface}) {
  const latest = useRef(null);
  latest.current = {step, enabled, onForward};
  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return;
    const edgeRoot = edgeSurface?.(root) || root;
    let motion = null, pointerAllowed = null;
    const allowed = event => standaloneNavigation() && root.isConnected &&
      latest.current.step === step && (typeof latest.current.enabled === 'function' ? latest.current.enabled() : latest.current.enabled) &&
      !root.closest('[inert],[aria-hidden="true"]') &&
      (!event || !event.target.closest('[data-no-edge-back]') &&
        event.target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],.modal-layer') ===
        root.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],.modal-layer'));
    // An outside pointerdown can close the age picker before touchstart arrives.
    // That first touch belongs to dismissing the picker, not advancing a question.
    const pointerStart = event => { if (event.pointerType === 'touch') pointerAllowed = allowed(event); };
    edgeRoot.addEventListener('pointerdown', pointerStart, true);
    const dispose = bindEdgeNavigation(edgeRoot, {
      edge: 'right', enabled: event => {
        const startedAllowed = pointerAllowed;
        if (event) pointerAllowed = null;
        return (!event || startedAllowed !== false) && allowed(event);
      },
      getBounds: () => edgeRoot.getBoundingClientRect(),
      duration: (gesture, commit) => motion ? Math.min(200, Math.max(40, 200 *
        (commit ? gesture.width - gesture.distance : gesture.distance) / gesture.width)) : 0,
      render: (x, ms) => { motion ||= pageBackMotion(root); motion?.render(x, ms); },
      clear: () => { motion?.clear(); motion = null; },
      onNavigate: () => latest.current.onForward(),
    });
    return () => { edgeRoot.removeEventListener('pointerdown', pointerStart, true); dispose(); };
  }, [rootRef, active, step, edgeSurface]);
}
