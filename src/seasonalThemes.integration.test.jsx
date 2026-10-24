import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Exercise the seasonal plumbing with a fixture season, independent of which
// real seasons a branch has merged.
vi.mock('./seasonalThemes.js', async importOriginal => {
  const actual = await importOriginal();
  const shades = [
    { id: 'fixture', name: 'Lantern', light: '#1f6aa1', dark: '#7ab8ee' },
    { id: 'fixture-two', name: 'Two', light: '#476a86', dark: '#9ebfd8' },
    { id: 'fixture-three', name: 'Three', light: '#136d72', dark: '#6dcac4' },
    { id: 'fixture-four', name: 'Four', light: '#1f4f78', dark: '#5f97c8' },
    { id: 'fixture-five', name: 'Five', light: '#1170b0', dark: '#66c6fa' },
  ];
  const fixture = { id: 'fixture', name: 'Fixture', description: 'Test · season', window: { start: '01-01', end: '12-31' }, base: 'cool',
    surfaces: { light: ['#f1f5f9', '#fbfdff', '#e3ebf3'], dark: ['#0c131a', '#152029', '#1e2b37'] }, shades };
  const ended = { ...fixture, id: 'ended', name: 'Ended', window: { start: '02-29', end: '02-29' }, shades: shades.map(item => ({ ...item, id: item.id.replace('fixture', 'ended') })) };
  return { ...actual, SEASONAL_THEMES: actual.createSeasonalRegistry([fixture, ended]) };
});

const { ALL_THEME_PRESETS, THEME_PRESETS, applyPreviewTheme, normalizePersonalTheme, personalThemeModel, personalThemeSummary, resetPersonalThemePalette, selectPersonalThemePalette, updatePersonalTheme } = await import('./personalThemes.js');
const { PERSONAL_THEME_PREFERENCE, readPersonalThemePreference, savePersonalThemePreference } = await import('./personalThemePreference.js');
const { PersonalThemeStudio } = await import('./PersonalThemeStudio.jsx');

afterEach(() => localStorage.removeItem(PERSONAL_THEME_PREFERENCE));

describe('Seasonal families in the theme engine', () => {
  it('registers seasons after the six year-round palettes', () => {
    expect(THEME_PRESETS).toHaveLength(6);
    expect(ALL_THEME_PRESETS.map(item => item.id)).toEqual([...THEME_PRESETS.map(item => item.id), 'fixture', 'ended']);
  });
  it('keeps seasonal Fine-tune apart from year-round families and remembers the fallback', () => {
    let theme = updatePersonalTheme({ basePalette: 'ocean', appearance: 'dark' }, { accent: 'ocean-teal' });
    theme = updatePersonalTheme(selectPersonalThemePalette(theme, 'fixture'), { accent: 'fixture-three', base: 'warm' });
    expect(theme).toMatchObject({ basePalette: 'fixture', accent: 'fixture-three', base: 'warm', fallbackPalette: 'ocean' });
    expect(theme.paletteCustomizations.ocean).toEqual({ accent: 'ocean-teal', base: 'cool' });
    expect(Object.keys(theme.paletteCustomizations)).toHaveLength(6);
    expect(theme.seasonalCustomizations.fixture).toEqual({ accent: 'fixture-three', base: 'warm' });
    expect(selectPersonalThemePalette(theme, 'ocean')).toMatchObject({ accent: 'ocean-teal', fallbackPalette: 'ocean' });
    expect(resetPersonalThemePalette(theme)).toMatchObject({ accent: 'fixture', base: 'cool' });
    expect(personalThemeSummary(theme)).toBe('Fixture · Customized · Warm · Dark');
  });
  it('resolves a direct seasonal configuration like a year-round one', () => {
    expect(normalizePersonalTheme({ basePalette: 'fixture', accent: 'fixture-four', base: 'warm' })).toMatchObject({ accent: 'fixture-four', base: 'warm' });
    expect(personalThemeModel({ basePalette: 'fixture', accent: 'fixture-four', appearance: 'light' }).tokens['--rook-accent-fill']).toBe('#1f4f78');
  });
  it('rejects another family\'s shade for a season', () => {
    expect(updatePersonalTheme(selectPersonalThemePalette({}, 'fixture'), { accent: 'ocean-teal' }).accent).toBe('fixture');
  });
  it('stages and releases the season attribute with the preview', () => {
    const root = document.createElement('div');
    root.dataset.season = 'previous';
    const release = applyPreviewTheme(root, { personal: { basePalette: 'fixture', appearance: 'dark' } });
    expect(root.dataset.season).toBe('fixture');
    expect(personalThemeModel({ basePalette: 'fixture' }).season).toBe('fixture');
    release();
    expect(root.dataset.season).toBe('previous');
    const plain = applyPreviewTheme(root, { personal: { basePalette: 'ocean', appearance: 'dark' } });
    expect(root.hasAttribute('data-season')).toBe(false);
    plain();
  });
});

describe('Seasonal persistence', () => {
  it('round-trips an active season with its fallback and leaves year-round payloads unchanged', () => {
    savePersonalThemePreference(updatePersonalTheme({ basePalette: 'plum', appearance: 'light' }, { accent: 'plum-mauve' }));
    expect(Object.keys(JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE)))).toEqual(['schemaVersion', 'basePalette', 'appearance', 'paletteCustomizations']);
    const seasonal = updatePersonalTheme(selectPersonalThemePalette(readPersonalThemePreference(), 'fixture'), { accent: 'fixture-two' });
    savePersonalThemePreference(seasonal);
    const stored = JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE));
    expect(stored).toMatchObject({ basePalette: 'fixture', fallbackPalette: 'plum', seasonalCustomizations: { fixture: { accent: 'fixture-two', base: 'cool' } } });
    expect(readPersonalThemePreference()).toEqual(seasonal);
  });
  it('restores the year-round fallback when a saved season is no longer in the build', () => {
    localStorage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: 'retired', appearance: 'dark', fallbackPalette: 'terracotta',
      paletteCustomizations: { terracotta: { accent: 'terracotta-clay', base: 'warm' } }, seasonalCustomizations: { retired: { accent: 'retired-two', base: 'cool' } } }));
    expect(readPersonalThemePreference()).toMatchObject({ basePalette: 'terracotta', accent: 'terracotta-clay', appearance: 'dark', fallbackPalette: 'terracotta' });
  });
  it('still rejects an unknown palette without a year-round fallback, and damaged seasonal data', () => {
    localStorage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: 'retired', appearance: 'dark', paletteCustomizations: {} }));
    expect(readPersonalThemePreference()).toBeNull();
    localStorage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: 'fixture', appearance: 'dark', fallbackPalette: 'ocean', paletteCustomizations: {}, seasonalCustomizations: { fixture: { accent: 'url(x)' } } }));
    expect(readPersonalThemePreference()).toBeNull();
    localStorage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: 'fixture', appearance: 'dark', paletteCustomizations: {}, seasonalCustomizations: [] }));
    expect(readPersonalThemePreference()).toBeNull();
  });
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
describe('Seasonal group in the picker', () => {
  let host, root;
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  const render = async initial => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const Header = ({ onClose, closeLabel }) => <button onClick={onClose}>{closeLabel}</button>;
    const preview = vi.fn();
    await act(async () => root.render(<PersonalThemeStudio Header={Header} close={() => {}} apply={() => {}} preview={preview} initial={initial} />));
    return preview;
  };
  it('lists seasons in their window apart from the six curated palettes and previews a choice', async () => {
    const preview = await render({ basePalette: 'forest', appearance: 'light' });
    expect(host.querySelectorAll('.pro-theme-presets button')).toHaveLength(6);
    const group = host.querySelector('.pro-theme-seasonal');
    expect(group.querySelector('legend').textContent).toBe('Seasonal');
    // One shared, quiet note says seasons come back; no scarcity or extra badge per tile.
    expect(group.querySelector('.pro-theme-group-note').textContent).toBe('Returns every year');
    expect(group.getAttribute('aria-describedby')).toBe(group.querySelector('.pro-theme-group-note').id);
    expect(group.textContent).not.toMatch(/limited|exclusive|last chance/i);
    expect([...group.querySelectorAll('button')].map(button => button.getAttribute('aria-label'))).toEqual(['Fixture']);
    expect(group.querySelector('.pro-theme-season-window').textContent).toBe('Jan 1 – Dec 31');
    await act(async () => group.querySelector('button').click());
    expect(preview).toHaveBeenLastCalledWith(normalizePersonalTheme({ basePalette: 'fixture', appearance: 'light' }));
    expect(host.querySelector('summary').textContent).toBe('Fine-tune Fixture');
    expect([...host.querySelectorAll('.pro-theme-accents button')].map(button => button.getAttribute('aria-label'))).toEqual(['Lantern', 'Two', 'Three', 'Four', 'Five']);
  });
  it('does not offer a saved season outside its window', async () => {
    await render({ basePalette: 'ended', appearance: 'dark' });
    const tile = host.querySelector('.pro-theme-seasonal [aria-label="Ended"]');
    expect(tile).toBeNull();
  });
});
