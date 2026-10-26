import { useLayoutEffect, useRef } from 'react';
import { bindSheetVisibleViewport, observeVisibleViewport } from './sheetVisibleViewport.js';
import './sheetActionFooter.css';

/** Shared commit area. Retains the established sheet scroll owner and swipe handling. */
export function SheetActionFooter({ children, className = '', enabled = true, separate = false, gutter = 0, pageScroll = false, containViewport = false, importViewport = false, anchorPlanViewport = false, hideWhileSearching = false, hidden = false, keyboardBehavior = 'flow' }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const footer = ref.current;
    const screen = footer?.closest('.detail-screen, .sheet');
    // PlanEditor is also reused by full-page onboarding, which is not a sheet.
    if (!screen) { footer.style.display = hidden ? 'none' : 'contents'; return; }
    const layer = screen.parentElement?.classList.contains('modal-layer') ? screen.parentElement : null;
    let viewportState, field, editingInput;
    const scrollerFor = input => input?.closest('[data-sheet-form-scroll], .sheet-scroll, .profile-setting-scroll, .superset-partner-options, .import-decision-scroll') || screen;
    const ownsFocus = input => !screen.inert && screen.contains(input) && input.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select') && input.closest('.detail-screen, .sheet') === screen;
    const keyboardLayout = () => {
      const active = document.activeElement;
      // Focusing Save must not expand/move the footer between pointerdown and
      // click. Retain the field's layout context while a footer action has focus.
      const input = ownsFocus(active) ? active : footer.contains(active) && editingInput;
      const typing = viewportState?.keyboardOpen && input && ownsFocus(input);
      footer.toggleAttribute('data-keyboard-active', Boolean(typing));
      if (!typing) { footer.removeAttribute('data-keyboard-layout'); return; }
      let layout = 'flow';
      if (keyboardBehavior === 'pin-if-room') {
        const scroller = scrollerFor(input), box = scroller.getBoundingClientRect();
        const inputBox = input.getBoundingClientRect(), style = getComputedStyle(input);
        const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.5;
        const padding = ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
        const fieldHeight = input.matches('textarea') ? Math.min(inputBox.height, line * 4 + padding) : inputBox.height;
        const label = input.closest('label');
        let context = label ? Math.max(0, label.getBoundingClientRect().height - inputBox.height) : line;
        if (input.getAttribute('aria-invalid') === 'true') for (const id of (input.getAttribute('aria-describedby') || '').split(/\s+/)) {
          const error = document.getElementById(id);
          if (error && !label?.contains(error)) context += error.getBoundingClientRect().height;
        }
        const header = screen.querySelector('.detail-header, .sheet-header-chrome');
        const top = Math.max(box.top, viewportState.offsetTop, header?.getBoundingClientRect().bottom || 0);
        const bottom = Math.min(box.bottom, viewportState.offsetTop + viewportState.height);
        if (bottom - top - footer.getBoundingClientRect().height >= fieldHeight + context + 24) layout = 'pin';
      }
      footer.dataset.keyboardLayout = layout;
    };
    const reveal = () => {
      // Search chrome is outside the results scroller and already positioned by
      // the viewport owner. A footer must not pan its outer panel to reveal it.
      if (footer.hidden || screen.classList.contains('is-search-browsing')) return;
      const input = document.activeElement;
      if (!ownsFocus(input)) return;
      const scroller = scrollerFor(input);
      // Include the field's label; only its established body scrolls. A tall
      // textarea keeps native caret scrolling instead of being recentered.
      const bounds = (input.closest('label') || input).getBoundingClientRect();
      const boundsHeight = bounds.height ?? bounds.bottom - bounds.top;
      if (boundsHeight <= 0) return; // No geometry during an inert/hidden sheet transition.
      const flowing = footer.dataset.keyboardLayout === 'flow';
      const bottom = flowing ? Math.min(scroller.getBoundingClientRect().bottom, viewportState.offsetTop + viewportState.height) - 12 : footer.getBoundingClientRect().top - 12;
      if (pageScroll) {
        if (bounds.bottom > bottom || bounds.top < 12) input.scrollIntoView({block: 'center', behavior: 'instant'});
        return;
      }
      const top = (importViewport ? scroller.getBoundingClientRect().top : screen.querySelector('.detail-header, .sheet-header-chrome')?.getBoundingClientRect().bottom || screen.getBoundingClientRect().top) + 12;
      if (boundsHeight > bottom - top) return; // Native textarea/caret scrolling owns a very short viewport.
      if (bounds.bottom > bottom) scroller.scrollTop += bounds.bottom - bottom;
      else if (bounds.top < top) scroller.scrollTop = Math.max(0, scroller.scrollTop - (top - bounds.top));
    };
    const measure = () => {
      keyboardLayout();
      footer.hidden=hidden || (hideWhileSearching || keyboardBehavior === 'hide')&&viewportState?.keyboardOpen;
      screen.classList.toggle('has-sheet-action-footer',!footer.hidden);
      screen.style.setProperty('--sheet-action-height', `${footer.getBoundingClientRect().height}px`);
      footer.style.setProperty('--sheet-action-gutter', getComputedStyle(screen).paddingLeft);
    };
    screen.classList.add('has-sheet-action-footer');
    if (anchorPlanViewport) screen.classList.add('has-anchored-plan-footer');
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); reveal(); }) : null;
    observer?.observe(footer);
    observer?.observe(screen);
    const focused = () => {
      const input = document.activeElement;
      if (ownsFocus(input)) {
        if (field) observer?.unobserve?.(field);
        editingInput = input;
        field = input.closest('label') || input;
        observer?.observe(field);
      }
      measure(); reveal();
    };
    screen.addEventListener('focusin', focused);
    const changed = state => { viewportState = state; measure(); reveal(); };
    const releaseViewport = layer || importViewport || anchorPlanViewport
      ? bindSheetVisibleViewport(screen, changed, {fullPage:importViewport || anchorPlanViewport, keyboardOnly:!containViewport && !importViewport && !anchorPlanViewport})
      : observeVisibleViewport(changed);
    reveal();
    return () => {
      observer?.disconnect();
      screen.classList.remove('has-sheet-action-footer');
      if (anchorPlanViewport) screen.classList.remove('has-anchored-plan-footer');
      screen.style.removeProperty('--sheet-action-height');
      screen.removeEventListener('focusin', focused);
      releaseViewport();
    };
  }, [enabled, pageScroll, containViewport, importViewport, anchorPlanViewport, hideWhileSearching, hidden, keyboardBehavior]);
  if (!enabled) return children;
  return <footer ref={ref} hidden={hidden} data-separate={separate || undefined} style={{'--sheet-action-inner-gutter': typeof gutter === 'number' ? `${gutter}px` : gutter}} className={`sheet-action-footer ${className}`}>{children}</footer>;
}
