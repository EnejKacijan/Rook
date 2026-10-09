import {useLayoutEffect, useRef} from 'react';
import './activeTabNavigation.css';

// Existing root surfaces, never new routes or copies of tab/domain state.
export const TAB_ROOTS = Object.freeze({
  today: {selector: '.today-screen', scroll: 'top'},
  coach: {selector: '.coach-screen', scroll: 'conversation'},
  progress: {selector: '.progress-screen', scroll: 'top'},
  profile: {selector: '.profile-screen', scroll: 'top'},
});
const RETAP = 'rook:active-tab-retap';

export function useActiveTabRetap(surfaceRef, onRetap) {
  const latest = useRef(onRetap);
  latest.current = onRetap;
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const handle = event => { if (latest.current?.()) event.preventDefault(); };
    surface?.addEventListener(RETAP, handle);
    return () => surface?.removeEventListener(RETAP, handle);
  }, [surfaceRef]);
}

export function rootScrollOwner(surface) {
  if (!surface) return null;
  const doc = surface.ownerDocument;
  for (let node = surface; node && node !== doc.body; node = node.parentElement) {
    const {overflowY} = doc.defaultView.getComputedStyle(node);
    if (/^(auto|scroll)$/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return doc.scrollingElement || doc.documentElement;
}

export function scrollTabRootToTop(surface, {immediate = false} = {}) {
  const owner = rootScrollOwner(surface);
  if (!owner || owner.scrollTop <= 1) return false;
  const reduced = owner.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Native smooth scrolling for nearby content; a very long page must not keep
  // travelling past old content for seconds. Keep nested scrollers untouched.
  const short = owner.scrollTop <= Math.max(owner.clientHeight, 600) * 2;
  owner.scrollTo({top: 0, behavior: !immediate && !reduced && short ? 'smooth' : 'instant'});
  return true;
}

export function tabNavigationBlocked(container, allowedPage = null) {
  if (!container || (container.closest('[inert],[aria-hidden="true"]') && !allowedPage)) return true;
  return [...container.ownerDocument.querySelectorAll('.modal-layer,[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')]
    .some(layer => layer !== allowedPage
      && !layer.matches('[data-tab-route="coach"]')
      && !layer.closest('[inert],[aria-hidden="true"],[hidden]')
      && layer.getClientRects().length > 0);
}

export function retapActiveTab(tab, container) {
  const contract = TAB_ROOTS[tab];
  if (!contract || tabNavigationBlocked(container)) return false;
  const surface = container.querySelector(`:scope > ${contract.selector}`);
  if (!surface) return false;
  const event = new CustomEvent(RETAP, {cancelable: true});
  if (!surface.dispatchEvent(event)) return true; // The root owns its child stack.
  return contract.scroll === 'top' ? scrollTabRootToTop(surface) : false;
}
