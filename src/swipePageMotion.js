// Cache only lightweight navigation pages, never editor/component trees.
let profileParent = null;
function snapshotParent(surface) {
  if (!surface || surface.querySelectorAll('*').length > 200) return;
  const copy = surface.cloneNode(true);
  for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
  copy.setAttribute('inert', '');
  copy.setAttribute('aria-hidden', 'true');
  copy.style.animation = 'none';
  return { copy, top: surface.getBoundingClientRect().top };
}
export function rememberSwipeParent(surface) { profileParent = snapshotParent(surface); }

export function pageBackMotion(surface) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const editor = surface.closest('.edit-plan-page-layer');
  if (!surface.matches('.profile-management-screen') && !editor) return null;
  const snapshot = editor ? snapshotParent(document.querySelector('.profile-management-screen')) : profileParent;
  if (!snapshot) return null;
  const bounds = surface.getBoundingClientRect();
  const parent = document.createElement('div');
  parent.setAttribute('aria-hidden', 'true'); parent.setAttribute('inert', '');
  parent.dataset.swipeParent = 'true';
  Object.assign(parent.style, { position:'fixed', left:`${bounds.left}px`, top:'0', width:`${bounds.width}px`, height:'100dvh', overflow:'hidden', pointerEvents:'none', background:'var(--rook-bg)', zIndex:'1', willChange:'transform' });
  const copy = snapshot.copy.cloneNode(true);
  Object.assign(copy.style, { transform:`translateY(${snapshot.top}px)`, margin:'0', width:'100%', minHeight:'100dvh' });
  parent.append(copy);
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
