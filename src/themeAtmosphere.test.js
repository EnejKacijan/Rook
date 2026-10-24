import { expect, it } from 'vitest';
import { ALL_THEME_PRESETS, THEME_BASES, mixThemeColor, personalThemeModel, personalThemeShades, themeAtmosphere, themeContrast } from './personalThemes.js';

// The wash at the top of the main tabs is decoration. Text over its strongest
// point must stay as readable as over the plain page, for every family
// (year-round and every merged season), shade, tone and appearance.
it('the palette wash never takes text, secondary or accent text below 4.5:1', () => {
  for (const preset of ALL_THEME_PRESETS) for (const shade of personalThemeShades(preset.id)) for (const base of THEME_BASES) for (const appearance of ['light', 'dark']) {
    const model = personalThemeModel({ basePalette: preset.id, accent: shade.id, base: base.id, appearance });
    const t = model.tokens, label = `${preset.id} ${shade.id} ${base.id} ${appearance}`;
    const wash = themeAtmosphere(preset.atmosphere, t['--rook-accent-fill'], appearance);
    if (!wash) { expect(t['--rook-atmosphere'], label).toBe('none'); continue; }
    expect(t['--rook-atmosphere'], label).toBe(wash.image);
    expect(wash.strength, label).toBeLessThanOrEqual(.16);
    const peak = mixThemeColor(t['--rook-bg'], wash.color, wash.strength);
    for (const role of ['--rook-text', '--rook-secondary', '--rook-accent-text'])
      expect(themeContrast(t[role], peak), `${label} ${role}`).toBeGreaterThanOrEqual(4.5);
  }
});

it('Slate stays flat by design; the other year-round families each have a wash', () => {
  const tokens = id => personalThemeModel({ basePalette: id, appearance: 'light' }).tokens['--rook-atmosphere'];
  expect(tokens('slate')).toBe('none');
  for (const id of ['forest', 'champagne', 'ocean', 'plum', 'terracotta']) expect(tokens(id)).toMatch(/gradient\(/);
});
