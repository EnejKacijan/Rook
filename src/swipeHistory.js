import { capturePageSurface } from './pageStackMotion.js';

// Remembers what a navigation surface looked like just before a tap moved it
// somewhere else, so a Back swipe can reveal that view under the finger.
// Memory only: inert DOM copies, capped per stack, never persisted.
const LIMIT = 12, MAX_NODES = 1600;
const stacks = new WeakMap();
const BACK = 'button[aria-label]';
const isBack = node => /^Back(?:\s|$)/i.test(node?.getAttribute?.('aria-label') || '');

// Sheets keep their own stack; full pages share the document's.
const owner = surface => surface.closest('.modal-layer,[role="dialog"]') || surface.ownerDocument;

export function surfaceSignature(surface) {
  const heading = surface.querySelector('h1,h2')?.textContent.trim() || '';
  const back = [...surface.querySelectorAll(BACK)].find(isBack)?.getAttribute('aria-label') || '';
  return `${heading}|${back}`;
}

function capture(surface) {
  if (surface.querySelectorAll('*').length > MAX_NODES) return null;
  const snapshot = capturePageSurface(surface);
  if (!snapshot) return null;
  for (const node of [snapshot.copy, ...snapshot.copy.querySelectorAll('[data-row-pressed],[data-row-touch]')]) {
    node.removeAttribute('data-row-pressed'); node.removeAttribute('data-row-touch');
  }
  return snapshot;
}

function stackFor(surface) {
  const key = owner(surface);
  let stack = stacks.get(key);
  if (!stack) stacks.set(key, stack = []);
  return stack;
}

// Newest entry that shows a different view than the current one.
function previousIndex(stack, signature) {
  for (let index = stack.length - 1; index >= 0; index--) if (stack[index].signature !== signature) return index;
  return -1;
}

export function recordSurface(surface) {
  if (!surface?.isConnected) return;
  const signature = surfaceSignature(surface), stack = stackFor(surface);
  const snapshot = capture(surface);
  if (!snapshot) return;
  if (stack.at(-1)?.signature === signature) stack.pop();
  stack.push({ signature, snapshot });
  if (stack.length > LIMIT) stack.shift();
}

export function previousSurfaceSnapshot(surface) {
  if (!surface?.isConnected) return null;
  const stack = stacks.get(owner(surface));
  if (!stack) return null;
  const index = previousIndex(stack, surfaceSignature(surface));
  return index < 0 ? null : stack[index].snapshot;
}

// After Back, the view we returned to is the newest entry again.
export function popSurface(surface) {
  if (!surface) return;
  const stack = stacks.get(owner(surface));
  if (!stack) return;
  const index = previousIndex(stack, surfaceSignature(surface));
  if (index >= 0) stack.splice(index + 1);
  else stack.length = 0;
}

// Only touch devices can swipe, so only they pay for the copies.
const touchDevice = win => (win.navigator?.maxTouchPoints || 0) > 0 || Boolean(win.matchMedia?.('(pointer: coarse)').matches);

export function bindSwipeHistory(doc, surfaceSelector) {
  const win = doc.defaultView;
  const click = event => {
    const target = event.target instanceof Element ? event.target : null;
    const surface = target?.closest(surfaceSelector);
    if (!surface || surface.closest('[inert],[aria-hidden="true"]')) return;
    const button = target.closest('button,a,[role="button"]');
    if (!button || button.disabled) return;
    if (isBack(button)) popSurface(surface);
    else if (touchDevice(win)) recordSurface(surface);
  };
  doc.addEventListener('click', click, true);
  return () => doc.removeEventListener('click', click, true);
}
