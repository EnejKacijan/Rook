import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PersonalThemesProvider, usePersonalThemes } from './PersonalThemesContext.jsx';
import { ActiveWorkout, Progress, ModalLayer, SheetHeader } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { startWorkout } from './domain.js';
import { useResolvedTheme } from './useResolvedTheme.js';
import { PERSONAL_THEME_PREFERENCE, readPersonalThemePreference } from './personalThemePreference.js';
import { normalizePersonalTheme, selectPersonalThemePalette, updatePersonalTheme, personalThemeModel } from './personalThemes.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const legacyOriginal = { accent: 'ocean', base: 'warm', appearance: 'system' };
const original = normalizePersonalTheme(legacyOriginal);
const customized = (palette, base, appearance, accent) => updatePersonalTheme(selectPersonalThemePalette(original, palette), {base, appearance, ...(accent ? {accent} : {})});
let host, root, review, media, mounts, meta, baselineRoot;
const tick = async (ms = 300) => act(async () => vi.advanceTimersByTimeAsync(ms));
const click = async label => act(async () => {
  const button = [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label);
  expect(button, label).toBeTruthy(); button.click();
});
function AppProbe() {
  review = usePersonalThemes();
  useResolvedTheme('system', 'standard', review.renderedPersonalTheme);
  const [route, setRoute] = useState('Coach');
  useEffect(() => { mounts++; }, []);
  const [state] = useState(() => createReturningUserFixture(0));
  return <main className="app-shell"><button onClick={() => setRoute('Today')}>Change route</button><span>{route}</span><input aria-label="Logger draft" defaultValue="53," /><Progress state={state} update={() => {}} setPage={() => {}} setDetail={() => {}} /></main>;
}
async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><AppProbe /></PersonalThemesProvider>));
}
async function open() {
  await act(async () => review.openThemes());
  await tick(); expect(document.querySelector('.pro-theme-studio')).toBeTruthy();
}
function rootTheme() { return [document.documentElement.dataset.appearance, document.documentElement.dataset.style, document.documentElement.dataset.personalTheme, document.documentElement.style.cssText, meta.content]; }
beforeEach(async () => {
  vi.useFakeTimers(); mounts = 0;
  const listeners = new Set();
  media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), change(dark) { this.matches = dark; listeners.forEach(fn => fn({ matches: dark })); } };
  vi.stubGlobal('matchMedia', query => query.includes('color-scheme') ? media : { matches: false, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 390, height: 600, right: 390, bottom: 600 });
  baselineRoot = document.documentElement.getAttribute('style');
  meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta);
  localStorage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify(legacyOriginal));
  await mount();
});
afterEach(async () => {
  await act(async () => root?.unmount()); host?.remove(); meta.remove(); localStorage.removeItem(PERSONAL_THEME_PREFERENCE);
  for (const name of ['data-theme', 'data-style', 'data-appearance', 'data-personal-theme', 'data-premium-scheme']) document.documentElement.removeAttribute(name);
  if (baselineRoot === null) document.documentElement.removeAttribute('style'); else document.documentElement.setAttribute('style', baselineRoot);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
it('previews every real root control, retains mounted state and never writes the draft', async () => {
  const before = rootTheme(), write = vi.spyOn(Storage.prototype, 'setItem');
  await open(); expect(rootTheme()).toEqual(before);
  const panel = document.querySelector('.pro-theme-studio'), input = host.querySelector('input');
  input.value = '72.5'; panel.scrollTop = 144;
  document.querySelector('.pro-theme-custom').open = true;
  await click('Terracotta'); expect(document.documentElement.dataset.personalTheme).toBe('terracotta-warm');
  await click('Dark'); expect(document.documentElement.dataset.appearance).toBe('dark');
  await click('Light'); expect(document.documentElement.dataset.appearance).toBe('light');
  await act(async () => panel.querySelector('.pro-theme-accents [aria-label="Clay"]').click()); expect(document.documentElement.style.getPropertyValue('--rook-accent-fill')).toBe('#9a6653');
  await click('Cool'); expect(document.documentElement.style.getPropertyValue('--rook-bg')).toBe(personalThemeModel(customized('terracotta','cool','light','terracotta-clay')).tokens['--rook-bg']);
  expect(document.querySelector('.pro-theme-studio')).toBe(panel); expect(panel.scrollTop).toBe(144);
  expect(panel.querySelector('details').open).toBe(true); expect(host.querySelector('input')).toBe(input); expect(input.value).toBe('72.5');
  expect(mounts).toBe(1); expect(host.textContent).toContain('Coach');
  expect(review.personalTheme).toEqual(original); expect(readPersonalThemePreference()).toEqual(original); expect(write).not.toHaveBeenCalled();
  await click('Cancel'); expect(rootTheme()).toEqual(before); await tick();
});
it.each(['Cancel', 'Close personal themes', 'Escape', 'drag', 'Back', 'backdrop'])('%s restores all original root tokens and preference before the close animation finishes', async action => {
  const before = rootTheme(); await open(); await click('ROOK Gold'); await click('Dark'); await click('Terracotta'); await click('Neutral');
  if (['Cancel', 'Close personal themes'].includes(action)) await click(action);
  else if (action === 'Escape') await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  else if (action === 'Back') await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
  else if (action === 'backdrop') await act(async () => document.querySelector('.modal-layer').click());
  else {
    const handle = document.querySelector('.modal-drag-handle');
    const touch = (type, y) => act(() => { const event = new Event(type, { bubbles: true, cancelable: true }); const point = { identifier: 1, clientX: 180, clientY: y, target: handle }; Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point] }, changedTouches: { value: [point] } }); handle.dispatchEvent(event); });
    touch('touchstart', 100); await tick(250); touch('touchmove', 340); await tick(16); touch('touchend', 340);
  }
  expect(rootTheme()).toEqual(before); expect(readPersonalThemePreference()).toEqual(original);
  await tick(); expect(document.querySelector('.modal-layer')).toBeNull();
});
it('Apply commits the whole combination, keeps it after route changes and a fresh provider mount, without any subscription state', async () => {
  await open(); await click('Terracotta'); await click('Dark'); await click('Cool');
  document.querySelector('.pro-theme-custom').open = true; await click('Clay'); await click('Apply theme'); await tick();
  const next = customized('terracotta','cool','dark','terracotta-clay'), applied = rootTheme();
  expect(review.personalTheme).toEqual(next); expect(readPersonalThemePreference()).toEqual(next);
  await click('Change route'); expect(rootTheme()).toEqual(applied); expect(host.textContent).toContain('Today');
  await act(async () => root.unmount()); host.remove(); await mount();
  expect(rootTheme()).toEqual(applied); expect(document.documentElement.dataset.personalTheme).toBe('terracotta-clay-cool');
  expect(review.personalTheme).toEqual(next);
  expect(document.querySelector('.rook-pro-paywall')).toBeNull();
});
it('previews readable text, progress and warning roles before Apply and Cancel restores every pair',async()=>{
 const before=rootTheme(),surface=host.querySelector('.progress-screen');
 await open();
 for(const [button,palette] of [['ROOK Green','forest'],['ROOK Gold','champagne'],['Ocean','ocean'],['Plum','plum']]){
  await click(button);await click('Dark');
  const expected=personalThemeModel(updatePersonalTheme(selectPersonalThemePalette(original,palette),{appearance:'dark'})).tokens;
  for(const role of ['accent-text','progress','warning-text','error-text','secondary','timer-text','timer'])
   expect(document.documentElement.style.getPropertyValue('--rook-'+role)).toBe(expected['--rook-'+role]);
  expect(host.querySelector('.progress-screen')).toBe(surface);
  expect(review.personalTheme).toEqual(original);
 }
 await click('Cancel');expect(rootTheme()).toEqual(before);
 expect(readPersonalThemePreference()).toEqual(original);
});
it('stages the mounted Weekly Review progress role live and restores it on Cancel without saving', async () => {
  const progress = host.querySelector('.weekly-review-card'), before = rootTheme();
  const color = () => document.documentElement.style.getPropertyValue('--rook-progress');
  const originalColor = color(), write = vi.spyOn(Storage.prototype, 'setItem');
  await open();
  for (const [label, palette] of [['Plum','plum'], ['ROOK Gold','champagne'], ['Ocean','ocean']]) {
    await click(label);
    expect(color()).toBe(personalThemeModel(selectPersonalThemePalette(original,palette)).tokens['--rook-progress']);
    expect(host.querySelector('.weekly-review-card')).toBe(progress);
    expect(review.personalTheme).toEqual(original);
  }
  expect(write).not.toHaveBeenCalled();
  await click('Cancel'); expect(color()).toBe(originalColor); expect(rootTheme()).toEqual(before); await tick();
});
it('foreground, focus and pageshow retain applied colors and never rewrite preferences or subscription state', async () => {
  await act(async () => root.unmount()); host.remove(); await mount();
  const before = rootTheme(), stored = localStorage.getItem(PERSONAL_THEME_PREFERENCE), write = vi.spyOn(Storage.prototype, 'setItem');
  expect(review).not.toHaveProperty('active'); expect(review.renderedPersonalTheme).toEqual(original);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(rootTheme()).toEqual(before); expect(readPersonalThemePreference()).toEqual(original);
  expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(stored); expect(write).not.toHaveBeenCalled();

});
it('reopening during an unapplied preview restores the saved theme and discards the draft', async () => {
  const before = rootTheme(), stored = localStorage.getItem(PERSONAL_THEME_PREFERENCE);
  await open(); await click('Terracotta'); await click('Dark'); await click('Cool');
  expect(rootTheme()).not.toEqual(before);
  await act(async () => root.unmount()); host.remove(); await mount();
  expect(rootTheme()).toEqual(before); expect(review.renderedPersonalTheme).toEqual(original);
  expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(stored);
  expect(document.querySelector('.pro-theme-studio')).toBeNull();
});
it('reopens an applied customized Plum with its base selected, previews new defaults and cancels back exactly', async () => {
  await open(); await click('Plum'); await click('Warm'); await click('Dark'); await click('Apply theme'); await tick();
  const applied = rootTheme();
  expect(JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE))).toEqual({schemaVersion:2,basePalette:'plum',appearance:'dark',paletteCustomizations:customized('plum','warm','dark').paletteCustomizations});
  await act(async () => root.unmount()); host.remove(); await mount(); await open();
  const panel = document.querySelector('.pro-theme-studio'); panel.querySelector('details').open = true;
  const selected = () => panel.querySelector('.pro-theme-presets [aria-pressed="true"]').getAttribute('aria-label');
  expect(selected()).toBe('Plum'); expect(panel.querySelector('summary').textContent).toBe('Fine-tune Plum');
  expect(panel.querySelector('[role="status"]').textContent).toBe('Plum · Customized · Warm · Dark');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  await click('Terracotta');
  expect(selected()).toBe('Terracotta'); expect(document.documentElement.dataset.personalTheme).toBe('terracotta-warm');
  expect(document.documentElement.style.getPropertyValue('--rook-accent-fill')).toBe('#efa084');
  expect(panel.querySelector('summary').textContent).toBe('Fine-tune Terracotta');
  expect(panel.querySelector('[role="status"]').textContent).toBe('Terracotta · Dark');
  await click('Cool'); await click('Reset Terracotta');
  expect(panel.querySelector('[role="status"]').textContent).toBe('Terracotta · Dark');
  expect(document.documentElement.dataset.personalTheme).toBe('terracotta-warm');
  await click('Plum'); expect(document.documentElement.dataset.personalTheme).toBe('plum-warm');
  expect(panel.querySelector('[role="status"]').textContent).toBe('Plum · Customized · Warm · Dark');
  expect(write).not.toHaveBeenCalled();
  await click('Cancel'); expect(rootTheme()).toEqual(applied); await tick();
  expect(readPersonalThemePreference()).toEqual(customized('plum','warm','dark'));
});
it('System follows a media change during preview without losing staged palette or the saved System preference', async () => {
  await open(); await click('Plum'); await act(async () => media.change(true));
  expect(document.documentElement.dataset.appearance).toBe('dark'); expect(document.documentElement.dataset.personalTheme).toBe('plum-neutral');
  expect(document.querySelector('.pro-theme-appearance button[aria-checked="true"]').textContent).toBe('System');
  await click('Cancel'); expect(document.documentElement.dataset.appearance).toBe('dark'); expect(review.personalTheme).toEqual(original);
});
it('a failed Apply stays open with the draft visible and the committed preference intact', async () => {
  await open(); await click('Slate'); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  await click('Apply theme'); expect(document.querySelector('[role="alert"]').textContent).toContain('Couldn’t save');
  expect(document.querySelector('.pro-theme-studio')).toBeTruthy(); expect(review.personalTheme).toEqual(original);
  await click('Cancel'); expect(readPersonalThemePreference()).toEqual(original);
});
it('rapid choices keep all fields and repeated Apply during exit writes once', async () => {
  await open(); const write = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => {
    const panel = document.querySelector('.pro-theme-studio');
    panel.querySelector('[aria-label="Terracotta"]').click();
    [...panel.querySelectorAll('.pro-theme-appearance button')].find(node => node.textContent === 'Dark').click();
    [...panel.querySelectorAll('.pro-theme-bases button')].find(node => node.textContent.trim() === 'Cool').click();
  });
  await act(async () => { const apply = [...document.querySelectorAll('button')].find(node => node.textContent === 'Apply theme'); apply.click(); apply.click(); });
  expect(readPersonalThemePreference()).toEqual(customized('terracotta','cool','dark'));
  expect(write).toHaveBeenCalledOnce(); await tick();
});
it('Reduced Motion rolls back synchronously and closes without a motion delay', async () => {
  vi.stubGlobal('matchMedia', query => query.includes('color-scheme') ? media : { matches: query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} });
  const before = rootTheme(); await open(); await click('Terracotta'); await click('Dark'); await click('Cancel');
  expect(rootTheme()).toEqual(before); await tick(0); expect(document.querySelector('.modal-layer')).toBeNull();
});
it('keeps the actual active logger, timer and unsaved input mounted throughout preview and cancellation', async () => {
  const state = createReturningUserFixture(0);
  state.profile.showExerciseImages = false; state.profile.restTimerEnabled = true;
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.exercises.forEach(exercise => exercise.sets.forEach(set => { set.weight = 52.5; set.reps = 12; }));
  state.activeWorkout.rest = { startedAt: Date.now(), endsAt: Date.now() + 600000, duration: 600 };
  const before = structuredClone(state.activeWorkout), navigate = vi.fn(), update = vi.fn();
  function LoggerProbe() {
    review = usePersonalThemes(); useResolvedTheme('system', 'standard', review.renderedPersonalTheme);
    return <div className="app-shell"><ActiveWorkout state={state} update={update} setPage={navigate} setDetail={() => {}} onLiveFinish={() => {}} /></div>;
  }
  await act(async () => root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><LoggerProbe /></PersonalThemesProvider>));
  const logger = host.querySelector('[data-active-workout]'), input = logger.querySelector('input[data-workout-draft]:not(:disabled)');
  const timer = logger.querySelector('.rest-timer'); expect(timer).toBeTruthy(); expect(input).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '53,'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  logger.scrollTop = 120;
  await open(); await click('Terracotta'); await click('Dark');
  expect(host.querySelector('[data-active-workout]')).toBe(logger); expect(input.isConnected).toBe(true);
  expect(logger.querySelector('.rest-timer')).toBe(timer);
  expect(input.value).toBe('53,'); expect(logger.scrollTop).toBe(120);
  expect(state.activeWorkout).toEqual(before); expect(update).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  await click('Cancel'); await tick(); expect(input.value).toBe('53,'); expect(host.querySelector('[data-active-workout]')).toBe(logger);
});
it('Apply/reload keeps Ocean and Plum independently, and Cancel rolls back edits to both families',async()=>{
  await open();await click('Teal');await click('Cool');await click('Plum');await click('Mauve');await click('Warm');await click('Ocean');await click('Dark');
  expect(document.documentElement.dataset.personalTheme).toBe('ocean-teal-cool');await click('Apply theme');await tick();
  const committed=readPersonalThemePreference(),raw=localStorage.getItem(PERSONAL_THEME_PREFERENCE),applied=rootTheme();
  expect(committed.paletteCustomizations.ocean).toEqual({accent:'ocean-teal',base:'cool'});
  expect(committed.paletteCustomizations.plum).toEqual({accent:'plum-mauve',base:'warm'});
  await act(async()=>root.unmount());host.remove();await mount();expect(rootTheme()).toEqual(applied);
  await open();await click('Azure');await click('Neutral');await click('Plum');await click('Violet');await click('Cool');
  await click('Cancel');expect(rootTheme()).toEqual(applied);expect(readPersonalThemePreference()).toEqual(committed);expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(raw);await tick();
});
