import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bindNavigationFocus, focusNavigationTarget } from './navigationFocus.js';
let dispose;
const attr = 'data-rook-pointer-focus';
beforeEach(() => {
  document.body.innerHTML = '<button id="back">Back</button><button id="close">Close</button><button id="primary">Start</button><input id="search"><textarea></textarea><a href="#">Link</a><div tabindex="0" role="button">Action</div>';
  dispose = bindNavigationFocus();
});
afterEach(() => { dispose(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const el = id => document.getElementById(id);
const pointer = () => document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const key = value => document.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));

it('unknown initial/programmatic focus keeps native accessibility indication', () => {
  focusNavigationTarget(el('back')); expect(document.activeElement).toBe(el('back')); expect(el('back').hasAttribute(attr)).toBe(false);
});
it('only known-pointer managed action focus gets an explicit origin, without blur', () => {
  const spy = vi.spyOn(el('back'), 'focus'), blur = vi.spyOn(el('back'), 'blur');
  pointer(); focusNavigationTarget(el('back'));
  expect(spy).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(document.activeElement).toBe(el('back')); expect(el('back').getAttribute(attr)).toBe('true'); expect(blur).not.toHaveBeenCalled();
  focusNavigationTarget(el('close')); expect(el('back').hasAttribute(attr)).toBe(false); expect(el('close').hasAttribute(attr)).toBe(true);
});
it('touchstart fallback preserves the same semantics without pointer events', () => {
  document.dispatchEvent(new Event('touchstart')); focusNavigationTarget(el('back')); expect(el('back').hasAttribute(attr)).toBe(true);
});
it('another touch or scroll start does not erase the current managed focus origin', () => {
  pointer(); focusNavigationTarget(el('back')); pointer();
  document.dispatchEvent(new Event('touchstart')); expect(el('back').hasAttribute(attr)).toBe(true);
  expect(document.activeElement).toBe(el('back'));
});
it.each(['Tab', 'ArrowRight', 'Enter', ' ', 'Escape', 'a'])('real %s keyboard input clears the pointer exception immediately', name => {
  pointer(); focusNavigationTarget(el('back')); key(name);
  expect(el('back').hasAttribute(attr)).toBe(false); expect(document.activeElement).toBe(el('back'));
  focusNavigationTarget(el('close')); expect(el('close').hasAttribute(attr)).toBe(false);
});
it('app-switch modifiers and lifecycle events do not fabricate keyboard intent, move focus, or clear origin', () => {
  pointer(); focusNavigationTarget(el('back'));
  const focus = vi.spyOn(el('back'), 'focus'), blur = vi.spyOn(el('back'), 'blur');
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const name of ['Shift', 'Alt', 'Control', 'Meta']) key(name);
    document.dispatchEvent(new Event('visibilitychange'));
    for (const name of ['pagehide', 'blur', 'pageshow', 'focus']) window.dispatchEvent(new Event(name));
  }
  expect(document.activeElement).toBe(el('back')); expect(el('back').hasAttribute(attr)).toBe(true);
  expect(focus).not.toHaveBeenCalled(); expect(blur).not.toHaveBeenCalled();
});
it('virtual/assistive activation after touch removes the exception without assuming its input modality', () => {
  pointer(); focusNavigationTarget(el('back')); el('back').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  expect(el('back').hasAttribute(attr)).toBe(false); focusNavigationTarget(el('close')); expect(el('close').hasAttribute(attr)).toBe(false);
});
it('Escape clears pointer origin before a topmost viewer stops keyboard propagation', () => {
  pointer(); focusNavigationTarget(el('back'));
  const viewer = event => event.stopImmediatePropagation(); window.addEventListener('keydown', viewer, true);
  try { key('Escape'); expect(el('back').hasAttribute(attr)).toBe(false); }
  finally { window.removeEventListener('keydown', viewer, true); }
});
it('a normal pointer click preserves its origin for the ensuing managed focus', () => {
  pointer(); el('primary').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  focusNavigationTarget(el('close')); expect(el('close').hasAttribute(attr)).toBe(true);
});
it('focus moving independently to a different element clears stale target presentation', () => {
  pointer(); focusNavigationTarget(el('back')); el('primary').focus(); expect(el('back').hasAttribute(attr)).toBe(false);
  expect(el('primary').hasAttribute(attr)).toBe(false);
  focusNavigationTarget(el('close')); expect(el('close').hasAttribute(attr)).toBe(false);
});
it.each(['input', 'textarea'])('does not alter native focused %s indication', selector => {
  pointer(); const target = document.querySelector(selector); focusNavigationTarget(target);
  expect(document.activeElement).toBe(target); expect(target.hasAttribute(attr)).toBe(false);
});
it.each(['a', '[role="button"]'])('supports shared managed %s actions, not just Back/X names', selector => {
  pointer(); const target = document.querySelector(selector); focusNavigationTarget(target); expect(target.hasAttribute(attr)).toBe(true);
});
it('failed focus and cleanup remove the marker; unbound use remains native', () => {
  pointer(); el('back').disabled = true; focusNavigationTarget(el('back')); expect(el('back').hasAttribute(attr)).toBe(false);
  focusNavigationTarget(el('close')); dispose(); expect(el('close').hasAttribute(attr)).toBe(false);
  pointer(); focusNavigationTarget(el('primary')); expect(el('primary').hasAttribute(attr)).toBe(false);
});
it('same-target repeated restoration retains origin, options, and focus identity', () => {
  pointer(); focusNavigationTarget(el('back')); focusNavigationTarget(el('back'));
  expect(document.activeElement).toBe(el('back')); expect(el('back').hasAttribute(attr)).toBe(true);
  const focus = vi.spyOn(el('back'), 'focus'); focusNavigationTarget(el('back'), { preventScroll: true });
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});
it('CSS is opt-in for managed action focus and leaves inputs and forced-colors alone', () => {
  const css = readFileSync('src/navigationFocus.css', 'utf8');
  expect(css).toContain('@media (forced-colors: none)');
  expect(css).toContain('[data-rook-pointer-focus="true"]:focus-visible');
  expect(css).not.toMatch(/button:focus\s*\{|input:focus|textarea:focus/);
});
