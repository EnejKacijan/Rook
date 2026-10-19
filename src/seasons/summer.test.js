import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, personalThemeModel } from '../personalThemes.js';
import { availableSeasonalThemes } from '../seasonalThemes.js';

it('registers Summer after the year-round palettes with its proposed window', () => {
  const season = ALL_THEME_PRESETS.find(item => item.id === 'summer');
  expect(season).toMatchObject({ name: 'Summer', seasonal: true, window: { start: '06-21', end: '08-31' } });
  expect(ALL_THEME_PRESETS.indexOf(season)).toBeGreaterThanOrEqual(6);
  expect(personalThemeModel({ basePalette: 'summer' }).accentName).toBe('Lagoon');
});

it('offers Summer only inside its window unless already chosen', () => {
  const [month, day] = '06-21'.split('-').map(Number);
  const inside = new Date(2026, month - 1, day, 12), before = new Date(2026, month - 1, day - 1, 12);
  expect(availableSeasonalThemes('forest', inside, undefined, false).map(item => item.id)).toContain('summer');
  expect(availableSeasonalThemes('forest', before, undefined, false).map(item => item.id)).not.toContain('summer');
  expect(availableSeasonalThemes('summer', before, undefined, false).map(item => item.id)).toContain('summer');
});

it('stages its decoration band through the root season attribute only', () => {
  const css = readFileSync('src/seasons/summer.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'summer' }).season).toBe('summer');
});
