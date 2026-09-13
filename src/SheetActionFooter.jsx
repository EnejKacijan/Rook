import { useLayoutEffect, useRef } from 'react';
import { bindSheetVisibleViewport } from './sheetVisibleViewport.js';
import './sheetActionFooter.css';

/** Shared commit area. Retains the established sheet scroll owner and swipe handling. */
export function SheetActionFooter({ children, className = '', enabled = true, separate = false, gutter = 0, pageScroll = false, containViewport = false, importViewport = false, anchorPlanViewport = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const footer = ref.current;
    const screen = footer?.closest('.detail-screen, .sheet');
    // PlanEditor is also reused by full-page onboarding, which is not a sheet.
    if (!screen) { footer.style.display = 'contents'; return; }
    const layer = screen.parentElement?.classList.contains('modal-layer') ? screen.parentElement : null;
    const viewport = window.visualViewport;
    const prior = layer ? { height:layer.style.height, top:layer.style.top, bottom:layer.style.bottom, maxHeight:screen.style.maxHeight } : null;
    const reveal = () => {
      const input = document.activeElement;
      if (!screen.contains(input) || !input.matches('input, textarea, select')) return;
      const scroller = (containViewport && input.closest('.sheet-scroll')) || input.closest('.profile-setting-scroll, .superset-partner-options, .import-decision-scroll') || screen;
      // Import's field label is part of the focus target. Only its inner body
      // scrolls; don't pan the document or recenter an already visible field.
      const bounds = (importViewport ? input.closest('label') || input : input).getBoundingClientRect();
      const bottom = footer.getBoundingClientRect().top - 12;
      if (pageScroll) {
        if (bounds.bottom > bottom || bounds.top < 12) input.scrollIntoView({block: 'center', behavior: 'instant'});
        return;
      }
      const top = (importViewport ? scroller.getBoundingClientRect().top : screen.querySelector('.detail-header, .sheet-header-chrome')?.getBoundingClientRect().bottom || screen.getBoundingClientRect().top) + 12;
      if (bounds.bottom > bottom) scroller.scrollTop += bounds.bottom - bottom;
      else if (bounds.top < top) scroller.scrollTop -= top - bounds.top;
    };
    const resize = () => {
      // A reduced visual viewport is keyboard evidence, not a physical-device claim.
      const keyboard = viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 100;
      if (layer) {
        layer.style.height = keyboard ? `${viewport.height}px` : '';
        layer.style.top = keyboard ? `${viewport.offsetTop}px` : '';
        screen.style.maxHeight = keyboard ? `${Math.max(160, viewport.height - 12)}px` : '';
      }
      reveal();
    };
    const measure = () => {
      screen.style.setProperty('--sheet-action-height', `${footer.getBoundingClientRect().height}px`);
      footer.style.setProperty('--sheet-action-gutter', getComputedStyle(screen).paddingLeft);
    };
    screen.classList.add('has-sheet-action-footer');
    if (anchorPlanViewport) screen.classList.add('has-anchored-plan-footer');
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(footer);
    screen.addEventListener('focusin', reveal);
    const contained = viewport && (anchorPlanViewport || importViewport || containViewport && layer);
    const releaseViewport = contained ? bindSheetVisibleViewport(screen, reveal, {fullPage:importViewport || anchorPlanViewport}) : null;
    if (!contained) { viewport?.addEventListener('resize', resize); resize(); }
    return () => {
      observer?.disconnect();
      screen.classList.remove('has-sheet-action-footer');
      if (anchorPlanViewport) screen.classList.remove('has-anchored-plan-footer');
      screen.style.removeProperty('--sheet-action-height');
      screen.removeEventListener('focusin', reveal);
      releaseViewport?.();
      if (!contained) viewport?.removeEventListener('resize', resize);
      if (layer) { layer.style.height = prior.height; layer.style.top = prior.top; layer.style.bottom = prior.bottom; screen.style.maxHeight = prior.maxHeight; }
    };
  }, [enabled, pageScroll, containViewport, importViewport, anchorPlanViewport]);
  if (!enabled) return children;
  return <footer ref={ref} data-separate={separate || undefined} style={{'--sheet-action-inner-gutter': `${gutter}px`}} className={`sheet-action-footer ${className}`}>{children}</footer>;
}
