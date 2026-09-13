import { useLayoutEffect, useRef, useState } from "react";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function acknowledgementDuration(token) {
  // Production CSS may minify 120ms to .12s; Web Animations takes milliseconds.
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(String(token).trim());
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : 120;
}

// One acknowledgement lifecycle: draft is committed by the click handler; only
// navigation waits for the selected card's presentation. Back cancels that work.
export function useSelectionAcknowledgement(step) {
  const [pending, setPending] = useState(null);
  const accepted = useRef(null);
  const burstUntil = useRef(0);
  useLayoutEffect(() => {
    accepted.current = null;
    setPending(null);
    return () => { accepted.current = null; };
  }, [step]);
  useLayoutEffect(() => {
    if (!pending || pending.step !== step) return;
    let disposed = false;
    let animation;
    let paintFrame;
    const finish = () => {
      if (disposed) return;
      disposed = true;
      pending.advance();
    };
    // Two frames ensure the committed selected fill/check has a paint opportunity,
    // also with reduced motion (no timed wait in that case).
    const frame = requestAnimationFrame(() => {
      paintFrame = requestAnimationFrame(() => {
        if (reducedMotion() || !pending.element.animate) { finish(); return; }
        const style = getComputedStyle(pending.element);
        const easing = style.getPropertyValue("--rook-ease-release").trim() || "ease-out";
        const duration = acknowledgementDuration(style.getPropertyValue("--rook-motion-press-out"));
        animation = pending.element.animate([{ transform: "scale(.99)" }, { transform: "scale(1)" }], { duration, easing });
        animation.finished.then(finish, finish);
      });
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paintFrame);
      animation?.cancel();
    };
  }, [pending, step]);
  return {
    acknowledging: pending?.step === step && accepted.current === step,
    begin(event, advance) {
      // Restrict burst suppression to these two auto-advancing choices, never
      // scrolling, Back, or the remaining onboarding controls.
      if (event.detail > 1 || accepted.current === step || performance.now() < burstUntil.current) return false;
      accepted.current = step;
      burstUntil.current = performance.now() + 350;
      setPending({ step, element: event.currentTarget, advance });
      return true;
    },
  };
}

export function onboardingScrollContainer(element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return document.scrollingElement;
}

export function useScheduleContinueReveal(step, rootRef) {
  const used = useRef(false);
  const cancel = useRef(() => {});
  useLayoutEffect(() => {
    used.current = false;
    return () => cancel.current();
  }, [step]);
  return valid => {
    if (!valid || used.current) return;
    cancel.current();
    const root = rootRef.current;
    let container;
    let scrolling = false;
    const stop = () => {
      cancelAnimationFrame(frame);
      if (scrolling) container.scrollTo({ top: container.scrollTop, behavior: "instant" });
      cleanup();
    };
    const inputs = ["touchstart", "pointerdown", "wheel", "keydown"];
    const cleanup = () => {
      inputs.forEach(type => root?.removeEventListener(type, stop, true));
      container?.removeEventListener("scrollend", cleanup);
      scrolling = false;
    };
    const frame = requestAnimationFrame(() => {
      const button = root?.querySelector(".onboarding-footer > .primary");
      if (!button || button.disabled || !root.isConnected) { cleanup(); return; }
      container = onboardingScrollContainer(button);
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || innerHeight);
      const bounds = container === document.scrollingElement ? { top, bottom } : container.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(button).scrollMarginBottom) || 12;
      const visibleBottom = Math.min(bottom, bounds.bottom) - inset;
      const visibleTop = Math.max(top, bounds.top) + 12;
      const delta = rect.bottom > visibleBottom ? rect.bottom - visibleBottom : rect.top < visibleTop ? rect.top - visibleTop : 0;
      if (Math.abs(delta) < 1) { cleanup(); return; }
      used.current = true;
      scrolling = true;
      container.addEventListener("scrollend", cleanup, { once: true });
      container.scrollTo({ top: container.scrollTop + delta, behavior: reducedMotion() ? "instant" : "smooth" });
    });
    inputs.forEach(type => root?.addEventListener(type, stop, { capture: true, passive: true }));
    cancel.current = stop;
  };
}
