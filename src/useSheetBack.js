import { useLayoutEffect, useRef } from 'react';
import { bindEdgeBack, standaloneNavigation } from './edgeBack.js';

function snapshot(surface) {
  const copy = surface.cloneNode(true);
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  return { node: copy, scroll: surface.scrollTop };
}

// Snapshots are inert, transient DOM, never durable data. Only the three opted-in
// navigation flows use this hook; no listeners are installed on other surfaces.
export function useSheetBack(ref, key, parentKey, onBack, allowed = true) {
  const cache = useRef(new Map());
  const action = useRef(onBack);
  action.current = onBack;
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface || !standaloneNavigation()) return;
    surface.dataset.edgeBackSurface = 'true';
    let overlay = null, front = null;
    const save = () => {
      if (!overlay) {
        cache.current.set(key, snapshot(surface));
        if (cache.current.size > 12) cache.current.delete([...cache.current.keys()].find(candidate => candidate !== key && candidate !== parentKey));
      }
    };
    save();
    surface.addEventListener('click', save, true);
    const clear = () => {
      overlay?.remove(); overlay = null; front = null;
      surface.style.removeProperty('visibility');
    };
    const enabled = () => allowed && parentKey != null && cache.current.has(parentKey) && !!action.current && standaloneNavigation() && surface.isConnected && surface.getAttribute('aria-busy') !== 'true';
    const render = (distance, duration) => {
      if (!overlay) {
        const rect = surface.getBoundingClientRect(), previous = cache.current.get(parentKey);
        if (!previous) return;
        overlay = document.createElement('div');
        overlay.className = 'modal-layer rook-edge-back-preview';
        overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
        Object.assign(overlay.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto', width: `${rect.width}px`, height: `${rect.height}px`, overflow: 'hidden', pointerEvents: 'none', borderRadius: getComputedStyle(surface).borderRadius, zIndex: '1', background: 'transparent', animation: 'none', display: 'block', padding: '0' });
        const back = previous.node.cloneNode(true);
        front = snapshot(surface).node;
        for (const panel of [back, front]) {
          Object.assign(panel.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', maxHeight: 'none', margin: '0', visibility: 'visible', transform: 'none', animation: 'none', borderRadius: '0', boxShadow: 'none' });
          overlay.append(panel);
          panel.querySelector('.modal-drag-handle')?.remove();
        }
        const handle = surface.querySelector('.modal-drag-handle i');
        if (handle) {
          const mark = handle.cloneNode(true), bounds = handle.getBoundingClientRect();
          Object.assign(mark.style, { position: 'absolute', left: `${bounds.left - rect.left}px`, top: `${bounds.top - rect.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, background: getComputedStyle(handle).backgroundColor, borderRadius: '999px', zIndex: '2' });
          overlay.append(mark);
        }
        surface.parentElement.append(overlay);
        back.scrollTop = previous.scroll; front.scrollTop = surface.scrollTop;
        surface.style.visibility = 'hidden';
      }
      front.style.transition = duration ? `transform ${duration}ms var(--rook-ease-standard, ease-out)` : 'none';
      front.style.transform = `translateX(${distance}px)`;
    };
    const dispose = bindEdgeBack(surface, {
      enabled, render, clear,
      onBack: () => {
        action.current?.();
        requestAnimationFrame(() => {
          const heading = ref.current?.querySelector('h1, .detail-header strong');
          if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
        });
      },
    });
    return () => { surface.removeEventListener('click', save, true); dispose(); delete surface.dataset.edgeBackSurface; };
  }, [ref, key, parentKey, allowed]);
}
