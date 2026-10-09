import { describe, expect, it } from 'vitest';
import { THEME_BASES, THEME_PRESETS, DEFAULT_PERSONAL_THEME, normalizePersonalTheme, personalThemeModel, personalThemeFromProfile, personalThemeSummary, themeContrast, applyPreviewTheme, personalThemeShades, selectPersonalThemePalette, updatePersonalTheme, resetPersonalThemePalette, mixThemeColor } from './personalThemes.js';

describe('Curated personal theme contrast and isolation', () => {
  it.each(THEME_PRESETS.flatMap(palette => personalThemeShades(palette.id).flatMap(accent => THEME_BASES.flatMap(base => ['light', 'dark'].map(appearance => ({ basePalette: palette.id, accent: accent.id, base: base.id, appearance }))))))('keeps the $accent / $base / $appearance palette readable', config => {
    const { tokens: t } = personalThemeModel(config);
    const surfaces = ['bg', 'surface', 'surface-muted', 'accent-soft', 'selected'];
    for (const text of ['text', 'secondary', 'muted', 'accent-text']) for (const surface of surfaces) expect(themeContrast(t[`--rook-${text}`], t[`--rook-${surface}`])).toBeGreaterThanOrEqual(4.5);
    for (const fill of ['accent-fill', 'accent-fill-strong']) expect(themeContrast(t['--rook-on-accent-fill'], t[`--rook-${fill}`])).toBeGreaterThanOrEqual(4.5);
    for (const surface of surfaces) for (const control of ['control-border', 'focus-ring', 'week-selected-line']) expect(themeContrast(t[`--rook-${control}`], t[`--rook-${surface}`])).toBeGreaterThanOrEqual(3);
    for(const semantic of ['warning-text','error-text','success']) for(const surface of ['bg','surface','surface-raised']) expect(themeContrast(t['--rook-'+semantic],t['--rook-'+surface])).toBeGreaterThanOrEqual(4.5);
    for(const [text,surface] of [['timer-text','timer'],['timer-secondary','timer'],['timer-button-text','timer-button']]) expect(themeContrast(t['--rook-'+text],t['--rook-'+surface])).toBeGreaterThanOrEqual(4.5);
    expect(themeContrast(t['--rook-accent-text'],mixThemeColor(t['--rook-bg'],t['--rook-accent-text'],.08))).toBeGreaterThanOrEqual(4.5);
    for (const [text, surface] of [['warning-text', 'warning-surface'], ['error-text', 'error-surface'], ['success', 'success-soft'], ['on-success', 'success']]) expect(themeContrast(t[`--rook-${text}`], t[`--rook-${surface}`])).toBeGreaterThanOrEqual(4.5);
    for(const [fg,bg] of [['disabled-text','disabled-surface'],['on-selected','selected']]) expect(themeContrast(t[`--rook-${fg}`],t[`--rook-${bg}`])).toBeGreaterThanOrEqual(4.5);
  });
  it('does not recolor error, warning or completion to match a decorative accent', () => {
    for (const palette of THEME_PRESETS) for (const base of THEME_BASES) for (const appearance of ['light', 'dark']) {
      const models = personalThemeShades(palette.id).map(accent => personalThemeModel({ basePalette:palette.id,accent: accent.id, base: base.id, appearance }).tokens);
      for (const role of ['success', 'on-success', 'success-soft', 'warning-text', 'warning-surface', 'error-text', 'error-surface']) expect(new Set(models.map(model => model[`--rook-${role}`])).size).toBe(1);
    }
  });
  it('rejects raw CSS input and preserves the configuration object', () => {
    const value = Object.freeze({ accent: 'url(https://invalid.example)', base: '__proto__', appearance: 'unset', unrelated: 'ignored' });
    expect(normalizePersonalTheme(value)).toEqual(DEFAULT_PERSONAL_THEME);
    expect(normalizePersonalTheme(null)).toEqual(DEFAULT_PERSONAL_THEME);
    expect(Object.keys(normalizePersonalTheme(value))).toEqual(['schemaVersion','basePalette','appearance','paletteCustomizations','accent','base']);
  });
  it('resolves System appearance deterministically without replacing the user choice', () => {
    const value = Object.freeze({ accent: 'ocean', base: 'warm', appearance: 'system' });
    expect(personalThemeModel(value, true).appearance).toBe('dark');
    expect(personalThemeModel(value, false).appearance).toBe('light');
    expect(personalThemeModel(value, true).config.appearance).toBe('system');
    expect(personalThemeModel(value, true)).toEqual(personalThemeModel(value, true));
  });
  it('keeps curated family identity for customized surface tones', () => {
    for (const preset of THEME_PRESETS) expect(personalThemeModel(preset).name).toBe(preset.name);
    expect(personalThemeModel({ accent: 'ocean', base: 'warm' }).name).toBe('Ocean');
  });
  it('releases all owned root tokens and restores existing values on cancellation/unmount', () => {
    const root = document.createElement('div');
    root.dataset.style = 'premium'; root.dataset.appearance = 'light'; root.dataset.unrelated = 'keep';
    root.style.setProperty('--rook-accent', '#123456', 'important'); root.style.setProperty('--unrelated', 'keep');
    const before = root.outerHTML;
    const release = applyPreviewTheme(root, { personal: { accent: 'ocean', base: 'cool', appearance: 'dark' } });
    expect(root.dataset.personalTheme).toBe('ocean-cool'); expect(root.dataset.style).toBe('standard');
    expect(root.style.getPropertyValue('--rook-accent')).not.toBe('#123456');
    release(); expect(root.outerHTML).toBe(before);
  });
  it('switches back to existing themes without leaving personal tokens behind', () => {
    const root = document.createElement('div');
    const releasePersonal = applyPreviewTheme(root, { personal: { accent: 'plum', base: 'neutral', appearance: 'dark' } });
    releasePersonal();
    const releaseClassic = applyPreviewTheme(root, { style: 'premium', appearance: 'light' });
    expect(root.dataset.personalTheme).toBeUndefined(); expect(root.dataset.style).toBe('premium');
    expect(root.style.getPropertyValue('--rook-accent')).toBe('');
    releaseClassic(); expect(root.style.cssText).toBe('');
  });
  it('keeps canonical Green and Gold identities with tested personal semantic tokens', () => {
    for (const [accent, base, style] of [['forest', 'neutral', 'standard'], ['champagne', 'warm', 'premium']]) for (const appearance of ['light', 'dark']) {
      const root = document.createElement('div');
      const release = applyPreviewTheme(root, { personal: { accent, base, appearance } });
      expect(root.dataset.style).toBe(style); expect(root.dataset.appearance).toBe(appearance);
      expect(root.style.getPropertyValue('--rook-accent-fill')).toBe(personalThemeModel({accent,base,appearance}).tokens['--rook-accent-fill']);
      expect(root.dataset.premiumScheme).toBe(style === 'premium' ? appearance : undefined);
      release(); expect(root.hasAttribute('data-theme')).toBe(false);
    }
  });
  it('inherits saved System and legacy Premium preferences without resolving away the choice', () => {
    expect(personalThemeFromProfile({ appearancePreference: 'system', stylePreference: 'premium' })).toEqual(normalizePersonalTheme({ accent: 'champagne', base: 'warm', appearance: 'system' }));
    expect(personalThemeFromProfile({ themePreference: 'premium' })).toEqual(normalizePersonalTheme({ accent: 'champagne', base: 'warm', appearance: 'system' }));
    expect(personalThemeSummary({ accent: 'ocean', base: 'cool', appearance: 'dark' })).toBe('Ocean · Dark');
    expect(personalThemeSummary({ accent: 'ocean', base: 'warm', appearance: 'system' })).toBe('Ocean · Customized · Warm · System');
  });
  it('migrates an out-of-family accent to the known base default without switching family', () => {
    const known = { basePalette: 'plum', accent: 'ocean', base: 'cool', appearance: 'dark' };
    const model = personalThemeModel(known);
    expect(model.basePalette.id).toBe('plum'); expect(model.name).toBe('Plum'); expect(model.customized).toBe(true);
    expect(personalThemeSummary(known)).toBe('Plum · Customized · Cool · Dark');
    expect(model.config.accent).toBe('plum');
    expect(normalizePersonalTheme(known).basePalette).toBe('plum');
    expect(normalizePersonalTheme({ ...known, basePalette: null }).basePalette).toBe('ocean');
  });
  it.each(THEME_PRESETS)('$name has five exclusive shades and rejects other family accents',preset=>{
    const family=personalThemeShades(preset.id);expect(family).toHaveLength(5);expect(family.some(s=>s.id===preset.accent)).toBe(true);
    for(const other of THEME_PRESETS.filter(p=>p.id!==preset.id)) {expect(family.some(s=>s.id===other.accent)).toBe(false);expect(updatePersonalTheme(preset,{accent:other.accent}).accent).toBe(preset.accent);}
  });
  it('retains Ocean and Plum edits, scoped reset and one appearance preference',()=>{
    let theme=updatePersonalTheme({basePalette:'ocean',appearance:'system'},{accent:'ocean-teal',base:'cool'});
    theme=updatePersonalTheme(selectPersonalThemePalette(theme,'plum'),{accent:'plum-mauve',base:'warm'});theme=selectPersonalThemePalette(theme,'ocean');
    expect(theme).toMatchObject({basePalette:'ocean',accent:'ocean-teal',base:'cool',appearance:'system'});
    expect(personalThemeModel(theme,true).config).toEqual(personalThemeModel(theme,false).config);
    const reset=resetPersonalThemePalette(theme);expect(reset).toMatchObject({accent:'ocean',base:'cool',appearance:'system'});
    expect(selectPersonalThemePalette(reset,'plum')).toMatchObject({accent:'plum-mauve',base:'warm'});expect(theme.accent).toBe('ocean-teal');
  });
});
