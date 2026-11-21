import { capturePageSurface, createPageBackMotion, createLivePageBackMotion } from './pageStackMotion.js';
import { previousSurfaceSnapshot } from './swipeHistory.js';
// Cache only lightweight navigation pages, never editor/component trees.
let profileParent = null, workoutParent = null;
const scopedRenderers = new WeakMap();
export function registerPageBackMotion(host, renderer) {
  scopedRenderers.set(host, renderer);
  return () => scopedRenderers.delete(host);
}
function snapshotParent(surface, maxNodes = 200) {
  if (!surface || surface.querySelectorAll('*').length > maxNodes) return;
  return capturePageSurface(surface);
}
export function rememberSwipeParent(surface, destination = 'profile') {
  if(destination==='workout')workoutParent=snapshotParent(surface,1200);
  else {
    const previous = profileParent, current = snapshotParent(surface);
    profileParent = current;
    // A nested settings page can return to its parent without losing the
    // parent's own Back preview. Existing one-level callers need no cleanup.
    return () => { if (profileParent === current) profileParent = previous; };
  }
}

export function pageBackMotion(surface) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  for (let owner = surface; owner; owner = owner.parentElement) {
    const motion = scopedRenderers.get(owner)?.(surface);
    if (motion) return motion;
  }
  const content = surface.querySelector(':scope > [data-swipe-back-content]');
  if (content) return liveBackMotion(content);
  if (surface.matches('.coach-history-surface,.coach-content-surface')) return createLivePageBackMotion(surface,
    surface.parentElement.querySelector(surface.matches('.coach-content-surface') ? '.coach-history-parent' : '.coach-content-surface'));
  const editor = surface.closest('.edit-plan-page-layer');
  const workout=surface.hasAttribute('data-active-workout');
  if (surface.matches('.profile-management-screen') || editor || workout) {
    const snapshot = workout ? workoutParent : editor ? snapshotParent(document.querySelector('.profile-management-screen')) : profileParent;
    if (snapshot || workout) return createPageBackMotion(surface, snapshot);
  }
  // Every other Back surface: the page follows the finger over the view it
  // came from when we saw it, otherwise over a plain page of the same colour.
  const snapshot = previousSurfaceSnapshot(surface), sheet = isSheet(surface);
  // A sheet's first Back usually closes it: the sheet leaves sideways over
  // the page it covers instead of revealing an empty sheet.
  if (sheet && !snapshot) return sheetDismissMotion(surface);
  return createPageBackMotion(surface, snapshot, { framed: sheet });
}

function sheetDismissMotion(surface) {
  const layer = surface.closest('.modal-layer'), width = surface.getBoundingClientRect().width;
  const styles = [surface, layer].map(node => [node, node?.getAttribute('style') ?? null]);
  const match = layer && getComputedStyle(layer).backgroundColor.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = 1] = match ? match[1].split(',').map(Number) : [];
  let frame = 0, nextX = 0, mounted = false, lastX = 0;
  const restore = () => styles.forEach(([node, style]) => { if (!node) return; if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style); });
  const paint = (x, ms) => {
    const transition = ms ? `${ms}ms cubic-bezier(.2,.8,.2,1)` : '';
    surface.style.transition = transition ? `transform ${transition}` : 'none';
    surface.style.transform = `translate3d(${x}px,0,0)`;
    if (layer && match) {
      layer.style.transition = transition ? `background-color ${transition}` : 'none';
      layer.style.backgroundColor = `rgba(${r},${g},${b},${a * (1 - Math.min(1, x / width))})`;
    }
  };
  return {
    dismisses: true,
    render(x, ms) {
      if (!mounted) {
        mounted = true;
        for (const animation of surface.getAnimations?.() || []) animation.cancel();
        Object.assign(surface.style, { willChange: 'transform', boxShadow: '-12px 0 28px -10px rgba(0,0,0,.22)' });
      }
      nextX = lastX = x;
      if (ms) { cancelAnimationFrame(frame); frame = 0; paint(x, ms); }
      else if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(nextX, 0); });
    },
    // True while the sheet sits fully off screen after a committed swipe.
    get away() { return mounted && lastX >= width - 1; },
    // Back has run. A closing sheet stays hidden for its own exit; anything
    // else (a step change) gets its normal pose back immediately.
    afterBack() {
      const closing = !surface.isConnected || !layer?.isConnected || /translateY/.test(surface.style.transform) || layer.classList.contains('is-closing');
      if (closing && surface.isConnected) { surface.style.visibility = 'hidden'; return; }
      this.clear();
    },
    clear() { cancelAnimationFrame(frame); frame = 0; if (mounted) { mounted = false; restore(); } },
  };
}

function isSheet(surface) {
  if (!surface.closest('.modal-layer,[role="dialog"]')) return false;
  const bounds = surface.getBoundingClientRect();
  return bounds.top > 8 || bounds.height < window.innerHeight - 8;
}

// Inline wizard steps inside sheets keep their existing scoped-content motion.
// These are not full-screen page navigation or vertical sheet dismissal.
function liveBackMotion(surface) {
  const original = surface.getAttribute('style');
  let frame = 0, mounted = false, nextX = 0;
  const paint = (x, ms) => {
    const transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    surface.style.transition = transition;
    surface.style.transform = `translate3d(${x}px,0,0)`;
  };
  return {
    render(x, ms) {
      if (!mounted) {
        mounted = true;
        for (const animation of surface.getAnimations()) animation.cancel();
        // Cancelling the entrance animation releases transform ownership without
        // toggling animation:none (which would replay entrance on swipe cancel).
        Object.assign(surface.style, { willChange:'transform' });

      }
      nextX=x;
      if(ms) { cancelAnimationFrame(frame); frame=0; paint(x,ms); }
      else if(!frame) frame=requestAnimationFrame(()=>{frame=0;paint(nextX,0);});
    },
    clear() {
      cancelAnimationFrame(frame);
      if (!mounted) return;
      if(original===null)surface.removeAttribute('style');else surface.setAttribute('style',original);
    },
  };
}
