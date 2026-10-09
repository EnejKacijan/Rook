import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ExerciseIllustration} from './ExerciseIllustration.jsx';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {PlanReviewIllustration} from './PlanReviewIllustration.jsx';
import {Detail, ExerciseVisualViewer} from './App.jsx';
import {blankState, exerciseCatalog, makeProgramExercise} from './domain.js';
import {exerciseArt} from './exerciseArt.js';
import {applyPreviewTheme, personalThemeModel, THEME_BASES, THEME_PRESETS, personalThemeShades, themeContrast} from './personalThemes.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const previousScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: vi.fn()});
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
});
afterEach(() => {
  act(() => root?.unmount()); host?.remove(); root = null; vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (previousScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previousScrollTo);
  else delete HTMLElement.prototype.scrollTo;
});
function render(content) {
  if (!root) {host = document.createElement('div'); document.body.append(host); root = createRoot(host);}
  act(() => root.render(content));
}
const configurations = THEME_PRESETS.flatMap(palette => personalThemeShades(palette.id).flatMap(accent => THEME_BASES.flatMap(base => ['light', 'dark'].map(appearance => ({basePalette: palette.id, accent: accent.id, base: base.id, appearance})))));

it('uses the readable theme accent for all 180 fine-tune combinations and both System resolutions', () => {
  expect(configurations).toHaveLength(180);
  for (const config of configurations) {
    const model = personalThemeModel(config), ink = model.tokens['--rook-illustration-ink'];
    expect(ink).toBe(model.tokens['--rook-accent-text']);
    for (const surface of ['bg', 'surface', 'surface-muted', 'accent-soft', 'selected'])
      expect(themeContrast(ink, model.tokens[`--rook-${surface}`])).toBeGreaterThanOrEqual(4.5);
    const system = personalThemeModel({...config, appearance: 'system'}, config.appearance === 'dark');
    expect(system.tokens['--rook-illustration-ink']).toBe(ink);
  }
});
it('repaints without changing the source, image instance or loading/error contract; preview cancellation restores ink', () => {
  const src = exerciseArt({exerciseId: 'barbell-bench-press'}), error = vi.fn(), load = vi.fn();
  render(<ExerciseIllustration src={src} alt="Bench Press illustration" width={48} height={48} loading="lazy" decoding="async" onError={error} onLoad={load} draggable={false}/>);
  const image = host.querySelector('img'), art = host.querySelector('.exercise-illustration');
  host.style.setProperty('--rook-illustration-ink', '#123456', 'important');
  const previousPriority = host.style.getPropertyPriority('--rook-illustration-ink');
  for (const personal of configurations) {
    const release = applyPreviewTheme(host, {personal});
    expect(host.style.getPropertyValue('--rook-illustration-ink')).toBe(personalThemeModel(personal).tokens['--rook-illustration-ink']);
    expect(host.querySelector('img')).toBe(image);
    expect(image.getAttribute('src')).toBe(src);
    release(); expect(host.style.getPropertyValue('--rook-illustration-ink')).toBe('#123456');
    expect(host.style.getPropertyPriority('--rook-illustration-ink')).toBe(previousPriority);
  }
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toBe('');
  expect(image.alt).toBe('Bench Press illustration'); expect(image.width).toBe(48);
  expect(image.loading || image.getAttribute('loading')).toBe('lazy');
  expect(image.getAttribute('decoding')).toBe('async'); expect(image.draggable).toBe(false);
  act(() => image.dispatchEvent(new Event('load'))); expect(load).toHaveBeenCalledOnce();
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toBe(`url(${JSON.stringify(src)})`);
  act(() => image.dispatchEvent(new Event('error'))); expect(error).toHaveBeenCalledOnce();
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toBe('');
});
it('keeps native lazy loading in charge and clears the previous mask when the image source changes', () => {
  render(<ExerciseIllustration src="/first.svg" loading="lazy" alt=""/>);
  const art = host.querySelector('.exercise-illustration'), image = art.querySelector('img');
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toBe('');
  act(() => image.dispatchEvent(new Event('load')));
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toContain('/first.svg');
  render(<ExerciseIllustration src="/second.svg" loading="lazy" alt=""/>);
  expect(art.querySelector('img')).toBe(image); expect(image.getAttribute('src')).toBe('/second.svg');
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toBe('');
  act(() => image.dispatchEvent(new Event('load')));
  expect(art.style.getPropertyValue('--exercise-illustration-source')).toContain('/second.svg');
});
it('shares theme ink across picker, compact/expanded review, detail and fullscreen viewer', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const state = blankState(), item = exerciseCatalog['barbell-bench-press'];
  state.profile.showExerciseImages = true;
  const exercise = makeProgramExercise(item, state.profile);
  render(<>
    <ExercisePickerIdentity item={item} deferOffscreen={false}/>
    <PlanReviewIllustration exercise={exercise} catalog={exerciseCatalog} resolveArt={exerciseArt} enabled name={item.name}/>
    <PlanReviewIllustration exercise={exercise} catalog={exerciseCatalog} resolveArt={exerciseArt} enabled expanded name={item.name}/>
    <Detail detail={{exercise}} state={state} update={() => {}} close={() => {}} setPage={() => {}} setDetail={() => {}}/>
    <ExerciseVisualViewer exercise={exercise}/>
  </>);
  expect(host.querySelectorAll('.exercise-illustration')).toHaveLength(5);
  expect(host.querySelectorAll('.exercise-illustration img')).toHaveLength(5);
  for (const image of host.querySelectorAll('.exercise-illustration img')) expect(image.getAttribute('src')).toBe(exerciseArt(exercise));
  expect(host.querySelector('.exercise-detail-art-button').getAttribute('aria-label')).toContain('View');
  expect(host.querySelector('.exercise-visual-stage').dataset.rookZoom).toBe('native');
});
it('applies alpha masking only to illustrations, with WebKit support and unfiltered surfaces', () => {
  const css = readFileSync('src/exerciseIllustration.css', 'utf8');
  const theme = readFileSync('src/theme.css', 'utf8');
  expect(css).toContain('-webkit-mask-image: var(--exercise-illustration-source)');
  expect(css).toContain('mask-mode: alpha'); expect(css).toContain('mask-origin: content-box');
  expect(css).toContain('pointer-events: none'); expect(css).toContain('@supports');
  expect(css).not.toMatch(/filter\s*:|transition\s*:/);
  expect(theme).not.toContain('--rook-art-filter'); expect(theme).not.toMatch(/img\[src\*="(?:\/assets\/)?wg-/);
  expect(theme).toContain('--rook-illustration-ink: var(--rook-accent-text)');
  render(<><ExerciseIllustration src="/art.svg" alt=""/><img src="blob:private-photo" alt="Private photo"/></>);
  expect(host.querySelector('[alt="Private photo"]').closest('.exercise-illustration')).toBeNull();
});
