import { capturePageSurface, createPageBackMotion, createLivePageBackMotion } from './pageStackMotion.js';
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
  if (!surface.matches('.profile-management-screen') && !editor && !workout) return null;
  const snapshot = workout ? workoutParent : editor ? snapshotParent(document.querySelector('.profile-management-screen')) : profileParent;
  if (!snapshot && !workout) return null;
  return createPageBackMotion(surface, snapshot);
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
