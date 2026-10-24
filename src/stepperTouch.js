// Safari can still recognize double-tap zoom on touch-action: manipulation
// controls (WebKit 319664). In an installed PWA, finish a short stepper tap
// ourselves: cancel its browser default and send exactly one normal click.
// Starts/moves stay passive so scrolling and intentional pinch keep ownership.
const repeatButtons = '.stepper > button,.stepper-row-controls > button:not(.stepper-row-value)';
const unavailable = button => !button?.isConnected || button.matches(':disabled,[aria-disabled="true"]') ||
  button.closest('[inert],[hidden],[aria-hidden="true"]');

export function bindStepperTouch(doc) {
  const win = doc.defaultView;
  let tap = null;
  const cancel = () => { tap = null; };
  const moved = point => Math.hypot(point.clientX - tap.x, point.clientY - tap.y) > 8;
  const start = event => {
    cancel();
    const button = event.target?.closest?.(repeatButtons), point = event.touches[0];
    if (event.defaultPrevented || event.touches.length !== 1 || unavailable(button)) return;
    tap = { button, id: point.identifier, x: point.clientX, y: point.clientY, at: win.performance.now() };
  };
  const move = event => {
    if (!tap) return;
    const point = [...event.touches].find(touch => touch.identifier === tap.id);
    if (event.touches.length !== 1 || !point || moved(point)) cancel();
  };
  const end = event => {
    if (!tap) return;
    const current = tap, point = [...event.changedTouches].find(touch => touch.identifier === current.id);
    const valid = point && !moved(point) && win.performance.now() - current.at < 500;
    cancel();
    if (!valid || event.touches.length || event.defaultPrevented || !event.cancelable || unavailable(current.button)) return;
    // Touch targets remain the starting element even after leaving its bounds.
    const rect = current.button.getBoundingClientRect();
    if (point.clientX < rect.left || point.clientX >= rect.right || point.clientY < rect.top || point.clientY >= rect.bottom) return;
    event.preventDefault();
    // A cancelled touchend suppresses the compatibility click. Reuse onClick
    // for normalization, draft handling and persistence; never step on down.
    current.button.dispatchEvent(new win.MouseEvent('click', {
      bubbles: true, cancelable: true, detail: 1,
      clientX: point.clientX, clientY: point.clientY,
    }));
  };
  const handlers = [
    ['touchstart', start, true], ['touchmove', move, true],
    ['touchend', end, false], ['touchcancel', cancel, true],
    ['scroll', cancel, true], ['contextmenu', cancel, true],
  ];
  handlers.forEach(([name, handler, passive]) => doc.addEventListener(name, handler, { capture: true, passive }));
  win.addEventListener('blur', cancel);
  win.addEventListener('pagehide', cancel);
  return () => {
    cancel();
    handlers.forEach(([name, handler]) => doc.removeEventListener(name, handler, true));
    win.removeEventListener('blur', cancel);
    win.removeEventListener('pagehide', cancel);
  };
}
