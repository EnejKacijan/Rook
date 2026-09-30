import { useCallback, useEffect, useRef, useState } from 'react';
import './transientSnackbar.css';

const DURATION_MS = 5000;
const SETTLE_MS = 170;
const INTENT_PX = 9;
const VELOCITY_PX_MS = 0.65;

export function Snackbar({ message, onUndo, onDismiss, onPause, onResume, className = '' }) {
  const root = useRef(null);
  const gesture = useRef(null);
  const finishTimer = useRef(null);
  const suppressClick = useRef(false);
  const dismissing = useRef(false);
  const listeners = useRef(null);
  const callbacks = useRef({ onDismiss, onResume });
  callbacks.current = { onDismiss, onResume };

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
    listeners.current = null;
  }, []);
  const cancel = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    release();
    reset();
    callbacks.current.onResume();
    setTimeout(() => { suppressClick.current = false; }, 0);
  }, [release, reset]);
  const move = useCallback(event => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.horizontal) {
      if (Math.abs(dy) >= INTENT_PX && Math.abs(dy) > Math.abs(dx)) { cancel(); return; }
      if (Math.abs(dx) < INTENT_PX || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      active.horizontal = true;
      suppressClick.current = true;
    }
    event.preventDefault();
    active.dx = dx;
    const node = root.current;
    if (!node) return;
    node.style.transition = 'none';
    node.style.transform = `translate3d(${dx}px, 0, 0)`;
    node.style.opacity = String(Math.max(.55, 1 - Math.abs(dx) / (node.offsetWidth * 1.7)));
  }, [cancel]);
  const end = useCallback(event => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    gesture.current = null;
    release();
    if (!active.horizontal) { callbacks.current.onResume(); return; }
    const node = root.current;
    const elapsed = Math.max(1, event.timeStamp - active.at);
    const velocity = Math.abs(active.dx) / elapsed;
    const threshold = Math.min(112, Math.max(72, (node?.offsetWidth || 300) * .28));
    if (Math.abs(active.dx) < threshold && !(Math.abs(active.dx) >= 32 && velocity >= VELOCITY_PX_MS)) {
      reset(); callbacks.current.onResume();
      setTimeout(() => { suppressClick.current = false; }, 0);
      return;
    }
    dismissing.current = true;
    if (!node || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { callbacks.current.onDismiss(); return; }
    const direction = Math.sign(active.dx) || 1;
    node.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(.2,0,0,1), opacity ${SETTLE_MS}ms ease-out`;
    node.style.transform = `translate3d(${direction * (node.offsetWidth + 24)}px, 0, 0)`;
    node.style.opacity = '0';
    finishTimer.current = setTimeout(() => callbacks.current.onDismiss(), SETTLE_MS);
  }, [release, reset]);
  const begin = event => {
    if (dismissing.current || gesture.current || !event.isPrimary) return;
    clearTimeout(finishTimer.current);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, dx: 0, horizontal: false };
    onPause();
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    listeners.current = { move, end, cancel };
  };
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); release(); clearTimeout(finishTimer.current); };
  }, [cancel, release]);
  return <aside ref={root} className={`today-undo rook-snackbar${className ? ` ${className}` : ''}`}
    role="status" aria-live="polite" onPointerDown={begin}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    <span>{message}</span>
    {onUndo && <button type="button" onClick={onUndo}>Undo</button>}
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
  const schedule = useCallback(id => {
    clearTimeout(timer.current);
    if (id !== current.current?.id) return;
    deadline.current = Date.now() + remaining.current;
    timer.current = setTimeout(() => clear(id), remaining.current);
  }, [clear]);
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
    className={className} onUndo={notice.undo ? undo : null}
    onPause={() => pause(notice.id)} onResume={() => resume(notice.id)}
    onDismiss={() => clear(notice.id)} /> };
}
