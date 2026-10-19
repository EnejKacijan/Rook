import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_BASES, THEME_PRESETS, personalThemeModel, personalThemeShades, personalThemeSurfaces, themeContrast } from './personalThemes.js';

const channels = color => color.slice(1).match(/../g).map(value => parseInt(value, 16));
const distance = (left, right) => Math.hypot(...channels(left).map((value, index) => value - channels(right)[index]));

describe('Year-round palette character', () => {
  it.each(THEME_PRESETS)('$name has a described, art-directed signature ladder', preset => {
    expect(preset.description).toMatch(/^\w+ · \w+$/);
    for (const appearance of ['light', 'dark']) {
      const ladder = personalThemeSurfaces(preset.id, preset.base, appearance);
      expect(ladder).toEqual([...preset.surfaces[appearance]]);
      // Page, card and muted surfaces are distinct, visible steps.
      expect(new Set(ladder).size).toBe(3);
    }
  });
  it('gives every family its own page color in both appearances', () => {
    for (const appearance of ['light', 'dark']) {
      const pages = THEME_PRESETS.map(preset => personalThemeModel({ basePalette: preset.id, appearance }).tokens['--rook-bg']);
      expect(new Set(pages).size).toBe(THEME_PRESETS.length);
    }
  });
  it.each(THEME_PRESETS)('$name shades are visibly distinct choices with unique names', preset => {
    const shades = personalThemeShades(preset.id);
    expect(new Set(shades.map(shade => shade.name)).size).toBe(shades.length);
    for (const appearance of ['light', 'dark']) for (let i = 0; i < shades.length; i++) for (let j = i + 1; j < shades.length; j++)
      expect(distance(shades[i][appearance], shades[j][appearance]), `${shades[i].name} / ${shades[j].name} ${appearance}`).toBeGreaterThan(14);
  });
});

describe('Depth and ink roles', () => {
  const all = THEME_PRESETS.flatMap(preset => personalThemeShades(preset.id).flatMap(shade => THEME_BASES.flatMap(base =>
    ['light', 'dark'].map(appearance => ({ basePalette: preset.id, accent: shade.id, base: base.id, appearance })))));
  it('keeps text, secondary and accent text readable on the elevated surface', () => {
    for (const config of all) {
      const t = personalThemeModel(config).tokens;
      for (const role of ['text', 'secondary', 'accent-text']) expect(themeContrast(t[`--rook-${role}`], t['--rook-surface-elevated'])).toBeGreaterThanOrEqual(4.5);
      expect(themeContrast(t['--rook-control-border'], t['--rook-surface-elevated'])).toBeGreaterThanOrEqual(3);
    }
  });
  it('raises Dark sheets one step above cards and keeps Light cards on the card surface', () => {
    for (const preset of THEME_PRESETS) {
      const dark = personalThemeModel({ basePalette: preset.id, appearance: 'dark' }).tokens;
      const light = personalThemeModel({ basePalette: preset.id, appearance: 'light' }).tokens;
      expect(dark['--rook-surface-elevated']).not.toBe(dark['--rook-surface']);
      expect(light['--rook-surface-elevated']).toBe(light['--rook-surface']);
    }
  });
  it('emits family-tinted shadow, scrim and primary-action lift roles', () => {
    for (const config of all) {
      const t = personalThemeModel(config).tokens;
      for (const role of ['shadow', 'shadow-soft', 'scrim', 'accent-shadow']) expect(t[`--rook-${role}`]).toMatch(/^rgba\(\d+, \d+, \d+, \.?\d*\.?\d+\)$/);
    }
    const ocean = personalThemeModel({ basePalette: 'ocean', appearance: 'light' }).tokens['--rook-scrim'];
    const terracotta = personalThemeModel({ basePalette: 'terracotta', appearance: 'light' }).tokens['--rook-scrim'];
    expect(ocean).not.toBe(terracotta);
  });
  it('tints text on pale fills with the fill hue instead of generic black', () => {
    const t = personalThemeModel({ basePalette: 'ocean', appearance: 'dark' }).tokens;
    const [r, g, b] = channels(t['--rook-on-accent-fill']);
    expect(b).toBeGreaterThan(r);
    expect(themeContrast(t['--rook-on-accent-fill'], t['--rook-accent-fill'])).toBeGreaterThanOrEqual(4.5);
    expect(g).toBeLessThan(80);
  });
});

describe('Primary action depth', () => {
  const css = readFileSync('src/theme.css', 'utf8');
  it('lifts only enabled primary actions and flattens the pressed state', () => {
    expect(css).toMatch(/\.button\.primary:not\(:disabled\) \{\s*box-shadow:[^}]*var\(--rook-accent-shadow\)/);
    expect(css).toContain('.button.primary:not(:disabled):active { box-shadow: none; }');
  });
});
