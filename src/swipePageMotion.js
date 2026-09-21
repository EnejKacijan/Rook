// Cache only lightweight navigation pages, never editor/component trees.
let profileParent = null, workoutParent = null;
const scopedRenderers = new WeakMap();
export function registerPageBackMotion(host, renderer) {
  scopedRenderers.set(host, renderer);
  return () => scopedRenderers.delete(host);
}
function snapshotParent(surface, maxNodes = 200) {
  if (!surface || surface.querySelectorAll('*').length > maxNodes) return;
  const copy = surface.cloneNode(true);
  for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
  copy.setAttribute('inert', '');
  copy.setAttribute('aria-hidden', 'true');
  copy.style.animation = 'none';
  return { copy, top: surface.getBoundingClientRect().top };
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
  if (surface.matches('.coach-history-surface,.coach-content-surface')) return liveBackMotion(surface);
  const editor = surface.closest('.edit-plan-page-layer');
  const workout=surface.hasAttribute('data-active-workout');
  if (!surface.matches('.profile-management-screen') && !editor && !workout) return null;
  const snapshot = workout ? workoutParent : editor ? snapshotParent(document.querySelector('.profile-management-screen')) : profileParent;
  if (!snapshot && !workout) return null;
  const bounds = surface.getBoundingClientRect();
  const parent = document.createElement('div');
  parent.setAttribute('aria-hidden', 'true'); parent.setAttribute('inert', '');
  parent.dataset.swipeParent = 'true';
  Object.assign(parent.style, { position:'fixed', left:`${bounds.left}px`, top:'0', width:`${bounds.width}px`, height:'100dvh', overflow:'hidden', pointerEvents:'none', background:'var(--rook-bg)', zIndex:'1', willChange:'transform' });
  if(snapshot) {
  const copy = snapshot.copy.cloneNode(true);
  Object.assign(copy.style, { transform:`translateY(${snapshot.top}px)`, margin:'0', width:'100%', minHeight:'100dvh' });
  parent.append(copy);
  }
  const original = surface.getAttribute('style');
  let frame = 0, mounted = false, nextX = 0;
  const paint = (x, ms) => {
    surface.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    parent.style.transition = surface.style.transition;
    surface.style.transform = `translate3d(${x}px,0,0)`;
    parent.style.transform = `translate3d(${-16 * (1 - x / bounds.width)}px,0,0)`;
  };
  return {
    render(x, ms) {
      if (!mounted) {
        for (const animation of surface.getAnimations()) animation.cancel();
        // ModalLayer owns its first child; never replace that panel identity.
        mounted = true; surface.after(parent);
        Object.assign(surface.style, { position:'relative', zIndex:'2', background:'var(--rook-bg)', willChange:'transform', animation:'none' });
      }
      nextX = x;
      if (ms) { cancelAnimationFrame(frame); frame = 0; paint(x, ms); }
      else if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(nextX, 0); });
    },
    clear() {
      cancelAnimationFrame(frame); parent.remove();
      if (mounted) { if (original === null) surface.removeAttribute('style'); else surface.setAttribute('style', original); }
    },
  };
}

// Animate live content, never copies of form/message state. A scoped content
// target keeps the surrounding shell stable and clips the drag inside it.
// Coach additionally keeps its history parent mounted behind the conversation.
function liveBackMotion(surface) {
  const parent = surface.matches('.coach-content-surface') ? surface.parentElement.querySelector('.coach-history-parent') : null;
  const original = surface.getAttribute('style'), parentStyle = parent?.getAttribute('style');
  const width = surface.getBoundingClientRect().width;
  let frame = 0, mounted = false, nextX = 0;
  const paint = (x, ms) => {
    const transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    surface.style.transition = transition;
    surface.style.transform = `translate3d(${x}px,0,0)`;
    if (parent) { parent.style.transition = transition; parent.style.transform = `translate3d(${-16 * (1-x/width)}px,0,0)`; }
  };
  return {
    render(x, ms) {
      if (!mounted) {
        mounted = true;
        for (const animation of surface.getAnimations()) animation.cancel();
        // Cancelling the entrance animation releases transform ownership without
        // toggling animation:none (which would replay entrance on swipe cancel).
        Object.assign(surface.style, { willChange:'transform' });
        if (parent) {
          Object.assign(surface.style, { position:'relative', zIndex:'62', background:'var(--rook-bg)' });
          Object.assign(parent.style, { visibility:'visible', zIndex:'61', animation:'none', willChange:'transform' });
        }
      }
      nextX=x;
      if(ms) { cancelAnimationFrame(frame); frame=0; paint(x,ms); }
      else if(!frame) frame=requestAnimationFrame(()=>{frame=0;paint(nextX,0);});
    },
    clear() {
      cancelAnimationFrame(frame);
      if (!mounted) return;
      if(original===null)surface.removeAttribute('style');else surface.setAttribute('style',original);
      if(parent) { if(parentStyle===null)parent.removeAttribute('style');else parent.setAttribute('style',parentStyle); }
    },
  };
}
