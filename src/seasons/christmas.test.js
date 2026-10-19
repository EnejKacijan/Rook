import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, personalThemeModel } from '../personalThemes.js';
import { availableSeasonalThemes } from '../seasonalThemes.js';

it('registers Christmas after the year-round palettes with its proposed window', () => {
  const season = ALL_THEME_PRESETS.find(item => item.id === 'christmas');
  expect(season).toMatchObject({ name: 'Christmas', seasonal: true, window: { start: '12-01', end: '12-27' } });
  expect(ALL_THEME_PRESETS.indexOf(season)).toBeGreaterThanOrEqual(6);
  expect(personalThemeModel({ basePalette: 'christmas' }).accentName).toBe('Evergreen');
});

it('offers Christmas only inside its window unless already chosen', () => {
  const [month, day] = '12-01'.split('-').map(Number);
  const inside = new Date(2026, month - 1, day, 12), before = new Date(2026, month - 1, day - 1, 12);
  expect(availableSeasonalThemes('forest', inside, undefined, false).map(item => item.id)).toContain('christmas');
  expect(availableSeasonalThemes('forest', before, undefined, false).map(item => item.id)).not.toContain('christmas');
  expect(availableSeasonalThemes('christmas', before, undefined, false).map(item => item.id)).toContain('christmas');
});

it('stages its decoration band through the root season attribute only', () => {
  const css = readFileSync('src/seasons/christmas.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'christmas' }).season).toBe('christmas');
});
