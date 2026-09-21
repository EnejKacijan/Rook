import { useLayoutEffect, useRef } from 'react';
import { bindSheetVisibleViewport, observeVisibleViewport } from './sheetVisibleViewport.js';
import './sheetActionFooter.css';

/** Shared commit area. Retains the established sheet scroll owner and swipe handling. */
export function SheetActionFooter({ children, className = '', enabled = true, separate = false, gutter = 0, pageScroll = false, containViewport = false, importViewport = false, anchorPlanViewport = false, hideWhileSearching = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const footer = ref.current;
    const screen = footer?.closest('.detail-screen, .sheet');
    // PlanEditor is also reused by full-page onboarding, which is not a sheet.
    if (!screen) { footer.style.display = 'contents'; return; }
    const layer = screen.parentElement?.classList.contains('modal-layer') ? screen.parentElement : null;
    const reveal = () => {
      // Search chrome is outside the results scroller and already positioned by
      // the viewport owner. A footer must not pan its outer panel to reveal it.
      if (screen.classList.contains('is-search-browsing')) return;
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
    const measure = () => {
      footer.hidden=hideWhileSearching&&screen.hasAttribute('data-sheet-keyboard-open');
      screen.classList.toggle('has-sheet-action-footer',!footer.hidden);
      screen.style.setProperty('--sheet-action-height', `${footer.getBoundingClientRect().height}px`);
      footer.style.setProperty('--sheet-action-gutter', getComputedStyle(screen).paddingLeft);
    };
    screen.classList.add('has-sheet-action-footer');
    if (anchorPlanViewport) screen.classList.add('has-anchored-plan-footer');
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(footer);
    screen.addEventListener('focusin', reveal);
    const releaseViewport = layer || importViewport || anchorPlanViewport
      ? bindSheetVisibleViewport(screen, () => { measure(); reveal(); }, {fullPage:importViewport || anchorPlanViewport, keyboardOnly:!containViewport && !importViewport && !anchorPlanViewport})
      : observeVisibleViewport(() => { measure(); reveal(); });
    reveal();
    return () => {
      observer?.disconnect();
      screen.classList.remove('has-sheet-action-footer');
      if (anchorPlanViewport) screen.classList.remove('has-anchored-plan-footer');
      screen.style.removeProperty('--sheet-action-height');
      screen.removeEventListener('focusin', reveal);
      releaseViewport();
    };
  }, [enabled, pageScroll, containViewport, importViewport, anchorPlanViewport, hideWhileSearching]);
  if (!enabled) return children;
  return <footer ref={ref} data-separate={separate || undefined} style={{'--sheet-action-inner-gutter': `${gutter}px`}} className={`sheet-action-footer ${className}`}>{children}</footer>;
}
