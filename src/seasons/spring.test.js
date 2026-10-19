import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, personalThemeModel } from '../personalThemes.js';
import { availableSeasonalThemes } from '../seasonalThemes.js';

it('registers Spring after the year-round palettes with its proposed window', () => {
  const season = ALL_THEME_PRESETS.find(item => item.id === 'spring');
  expect(season).toMatchObject({ name: 'Spring', seasonal: true, window: { start: '03-20', end: '05-31' } });
  expect(ALL_THEME_PRESETS.indexOf(season)).toBeGreaterThanOrEqual(6);
  expect(personalThemeModel({ basePalette: 'spring' }).accentName).toBe('Blossom');
});

it('offers Spring only inside its window unless already chosen', () => {
  const [month, day] = '03-20'.split('-').map(Number);
  const inside = new Date(2026, month - 1, day, 12), before = new Date(2026, month - 1, day - 1, 12);
  expect(availableSeasonalThemes('forest', inside, undefined, false).map(item => item.id)).toContain('spring');
  expect(availableSeasonalThemes('forest', before, undefined, false).map(item => item.id)).not.toContain('spring');
  expect(availableSeasonalThemes('spring', before, undefined, false).map(item => item.id)).toContain('spring');
});

it('stages its decoration band through the root season attribute only', () => {
  const css = readFileSync('src/seasons/spring.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'spring' }).season).toBe('spring');
});
