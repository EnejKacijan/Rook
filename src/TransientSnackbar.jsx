import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './transientSnackbar.css';

const DURATION_MS = 5000;
const ENTER_MS = 190;
const SETTLE_MS = 170;
const MOTION_PX = 16;
const INTENT_PX = 10;
const DIRECTION_RATIO = 1.3;
const DOWN_DISMISS_PX = 48;
const VELOCITY_PX_MS = 0.65;

export function Snackbar({ message, onUndo, onDismiss, onPause, onResume, className = '', undoScope, autoDismiss = false }) {
  const root = useRef(null);
  const entryMotion = useRef(null);
  const gesture = useRef(null);
  const finishTimer = useRef(null);
  const settleTimer = useRef(null);
  const suppressClick = useRef(false);
  const dismissing = useRef(false);
  const listeners = useRef(null);
  const pauseOwners = useRef(new Set());
  const callbacks = useRef({ onDismiss, onPause, onResume });
  callbacks.current = { onDismiss, onPause, onResume };

  // Animate once per feedback item, without delaying Undo or restarting when
  // the workout clock rerenders. Pointer tracking takes over the painted pose.
  useLayoutEffect(() => {
    const node = root.current;
    if (autoDismiss || !node.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const motion = node.animate([
      { transform: `translate3d(0, ${MOTION_PX}px, 0)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ], { duration: ENTER_MS, easing: 'cubic-bezier(.2,0,0,1)' });
    entryMotion.current = motion;
    motion.onfinish = () => { if (entryMotion.current === motion) entryMotion.current = null; };
    return () => { motion.onfinish = null; motion.cancel(); entryMotion.current = null; };
  }, []);
  const takeOverEntry = useCallback(() => {
    const node = root.current, motion = entryMotion.current;
    if (!node || !motion) return { transform: '', opacity: 1 };
    const painted = getComputedStyle(node);
    const transform = painted.transform === 'none' ? '' : painted.transform;
    const opacity = Number.parseFloat(painted.opacity);
    const pose = { transform, opacity: Number.isFinite(opacity) ? opacity : 1 };
    node.style.transition = 'none';
    node.style.transform = pose.transform;
    node.style.opacity = String(pose.opacity);
    motion.onfinish = null; motion.cancel(); entryMotion.current = null;
    return pose;
  }, []);
  useLayoutEffect(() => {
    if (!autoDismiss || dismissing.current) return;
    dismissing.current = true;
    takeOverEntry();
    const node = root.current;
    if (!node?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { callbacks.current.onDismiss(); return; }
    const painted = getComputedStyle(node);
    const transform = painted.transform === 'none' ? '' : painted.transform;
    const motion = node.animate([
      { transform: transform || 'translate3d(0, 0, 0)', opacity: painted.opacity || 1 },
      { transform: `translate3d(0, ${MOTION_PX}px, 0)${transform ? ` ${transform}` : ''}`, opacity: 0 },
    ], { duration: SETTLE_MS, easing: 'ease-out', fill: 'forwards' });
    motion.onfinish = () => callbacks.current.onDismiss();
    return () => { motion.onfinish = null; motion.cancel(); };
  }, [autoDismiss, takeOverEntry]);

  // A logger has no bottom navigation. Only lift Undo when an actual rest
  // timer occupies the bottom edge; its measured bounds include the safe area.
  useLayoutEffect(() => {
    const node = root.current, screen = node.closest('.workout-screen');
    if (!screen) return;
    let timer;
    const measure = () => {
      const bounds = timer?.getBoundingClientRect();
      const inset = bounds?.height > 0 ? Math.max(0, window.innerHeight - bounds.top) + 8 : 0;
      node.style.setProperty('--snackbar-rest-inset', `${inset}px`);
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    const refresh = () => {
      const next = screen.querySelector('.rest-timer');
      if (next !== timer) { resize?.disconnect(); timer = next; if (timer) resize?.observe(timer); }
      measure();
    };
    refresh();
    const mutations = new MutationObserver(refresh);
    mutations.observe(screen, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => { mutations.disconnect(); resize?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Pointer tracking and keyboard focus may overlap. Capture the remaining
  // lifetime once; neither owner may restart it while the other is still active.
  const hold = useCallback(owner => {
    if (pauseOwners.current.has(owner)) return;
    const first = pauseOwners.current.size === 0;
    pauseOwners.current.add(owner);
    if (first) callbacks.current.onPause();
  }, []);
  const unhold = useCallback(owner => {
    if (!pauseOwners.current.delete(owner)) return;
    if (pauseOwners.current.size === 0 && !dismissing.current) callbacks.current.onResume();
  }, []);

  const reset = useCallback((animate = true) => {
    const node = root.current;
    if (!node) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    node.style.transition = animate && !reduced ? `transform ${SETTLE_MS}ms cubic-bezier(.2,0,0,1), opacity ${SETTLE_MS}ms ease-out` : 'none';
    node.style.transform = '';
    node.style.opacity = '';
  }, []);
  const release = useCallback(() => {
    const installed = listeners.current;
    if (!installed) return;
    window.removeEventListener('pointermove', installed.move);
    window.removeEventListener('pointerup', installed.end);
    window.removeEventListener('pointercancel', installed.cancel);
    window.removeEventListener('lostpointercapture', installed.cancel);
    if (installed.target?.hasPointerCapture?.(installed.id)) installed.target.releasePointerCapture(installed.id);
    listeners.current = null;
  }, []);
  const settle = useCallback(animate => {
    const duration = animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? SETTLE_MS : 0;
    if (duration) hold('settle');
    reset(animate);
    unhold('pointer');
    clearTimeout(settleTimer.current);
    if (duration) settleTimer.current = setTimeout(() => unhold('settle'), duration);
    else unhold('settle');
    setTimeout(() => { suppressClick.current = false; }, 0);
  }, [hold, reset, unhold]);
  const cancel = useCallback(event => {
    const active = gesture.current;
    if (!active || (event?.pointerId != null && event.pointerId !== active.id)) return;
    gesture.current = null;
    release();
    settle(Boolean(active.axis && active.axis !== 'ignored') || Boolean(active.base.transform) || active.base.opacity < 1);
  }, [release, settle]);
  const move = useCallback(event => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (Math.hypot(dx, dy) >= INTENT_PX) suppressClick.current = true;
    if (!active.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_PX) return;
      if (Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO) active.axis = 'horizontal';
      else if (Math.abs(dy) > Math.abs(dx) * DIRECTION_RATIO) active.axis = dy > 0 ? 'down' : 'ignored';
      else return;
    }
    if (active.axis === 'ignored') return;
    event.preventDefault();
    active.distance = active.axis === 'horizontal' ? dx : Math.max(0, dy);
    active.samples.push({ distance: active.distance, at: event.timeStamp });
    active.samples = active.samples.filter(sample => sample.at >= event.timeStamp - 100);
    const node = root.current;
    if (!node) return;
    node.style.transition = 'none';
    const base = active.base.transform ? ` ${active.base.transform}` : '';
    node.style.transform = (active.axis === 'horizontal' ? `translate3d(${dx}px, 0, 0)` : `translate3d(0, ${active.distance}px, 0)`) + base;
    const fadeDistance = active.axis === 'horizontal' ? (node.offsetWidth || 300) * 1.7 : DOWN_DISMISS_PX * 2;
    node.style.opacity = String(active.base.opacity * Math.max(.55, 1 - Math.abs(active.distance) / fadeDistance));
  }, []);
  const end = useCallback(event => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    gesture.current = null;
    release();
    if (!active.axis || active.axis === 'ignored') { settle(Boolean(active.base.transform) || active.base.opacity < 1); return; }
    const node = root.current;
    const elapsed = Math.max(1, event.timeStamp - active.at);
    const recent = active.samples.find(sample => sample.at >= event.timeStamp - 100);
    const velocity = active.axis === 'horizontal' ? Math.abs(active.distance) / elapsed :
      recent ? (active.distance - recent.distance) / Math.max(1, event.timeStamp - recent.at) : 0;
    const threshold = active.axis === 'horizontal' ? Math.min(112, Math.max(72, (node?.offsetWidth || 300) * .28)) : DOWN_DISMISS_PX;
    if (Math.abs(active.distance) < threshold && !(Math.abs(active.distance) >= 32 && velocity >= VELOCITY_PX_MS)) {
      settle(true);
      return;
    }
    dismissing.current = true;
    if (!node || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { callbacks.current.onDismiss(); return; }
    node.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(.2,0,0,1), opacity ${SETTLE_MS}ms ease-out`;
    node.style.transform = (active.axis === 'horizontal' ?
      `translate3d(${(Math.sign(active.distance) || 1) * (node.offsetWidth + 24)}px, 0, 0)` :
      `translate3d(0, ${active.distance + Math.max(node.offsetHeight + 24, window.innerHeight - node.getBoundingClientRect().top + 24)}px, 0)`) + (active.base.transform ? ` ${active.base.transform}` : '');
    node.style.opacity = '0';
    finishTimer.current = setTimeout(() => callbacks.current.onDismiss(), SETTLE_MS);
  }, [release, settle]);
  const begin = event => {
    if (dismissing.current || gesture.current || !event.isPrimary || event.button > 0) return;
    clearTimeout(finishTimer.current);
    clearTimeout(settleTimer.current);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, distance: 0, axis: null, base: takeOverEntry(), samples: [{ distance: 0, at: event.timeStamp }] };
    suppressClick.current = false;
    hold('pointer');
    unhold('settle');
    // Capture on the original button when tapped, so a plain Undo tap retains
    // its click target. Window listeners also support devices without capture.
    const target = event.target.closest('button') || root.current;
    try { target.setPointerCapture?.(event.pointerId); } catch { /* Pointer already cancelled by the platform. */ }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('lostpointercapture', cancel);
    listeners.current = { move, end, cancel, target, id: event.pointerId };
  };
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); release(); clearTimeout(finishTimer.current); clearTimeout(settleTimer.current); };
  }, [cancel, release]);
  return <aside ref={root} className={`today-undo rook-snackbar${className ? ` ${className}` : ''}`}
    role="status" aria-live="polite" onPointerDown={begin}
    onFocusCapture={() => hold('focus')}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) unhold('focus'); }}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    <span>{message}</span>
    {onUndo && <button type="button" data-workout-replaces={undoScope} data-workout-options={undoScope ? true : undefined} onClick={onUndo}>Undo</button>}
  </aside>;
}

export function useTransientSnackbar({ className = '', beforeUndo, afterUndo } = {}) {
  const [notice, setNotice] = useState(null);
  const current = useRef(null);
  const timer = useRef(null);
  const deadline = useRef(0);
  const remaining = useRef(DURATION_MS);
  const sequence = useRef(0);
  const clear = useCallback((id = current.current?.id) => {
    if (id !== current.current?.id) return;
    clearTimeout(timer.current);
    current.current = null;
    setNotice(null);
  }, []);
  const expire = useCallback(id => {
    if (id !== current.current?.id || current.current.autoDismiss) return;
    remaining.current = 0;
    current.current = { ...current.current, autoDismiss: true };
    setNotice(current.current);
  }, []);
  const schedule = useCallback(id => {
    clearTimeout(timer.current);
    if (id !== current.current?.id || current.current.autoDismiss) return;
    deadline.current = Date.now() + remaining.current;
    timer.current = setTimeout(() => expire(id), remaining.current);
  }, [expire]);
  const show = useCallback(value => {
    const next = { ...value, id: ++sequence.current };
    current.current = next;
    remaining.current = DURATION_MS;
    setNotice(next);
    schedule(next.id);
  }, [schedule]);
  const pause = useCallback(id => {
    if (id !== current.current?.id) return;
    clearTimeout(timer.current);
    remaining.current = Math.max(0, deadline.current - Date.now());
  }, []);
  const resume = useCallback(id => {
    if (id === current.current?.id) schedule(id);
  }, [schedule]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (notice?.valid && !notice.valid()) clear(notice.id); });
  const undo = () => {
    const active = current.current;
    if (!active?.undo) return;
    beforeUndo?.();
    if (active.undo() !== false) { clear(active.id); afterUndo?.(); }
  };
  return { show, clear, surface: notice && <Snackbar key={notice.id} message={notice.message}
    className={[className, notice.className].filter(Boolean).join(' ')} onUndo={notice.undo ? undo : null}
    undoScope={notice.undoScope} autoDismiss={notice.autoDismiss}
    onPause={() => pause(notice.id)} onResume={() => resume(notice.id)}
    onDismiss={() => clear(notice.id)} /> };
}
