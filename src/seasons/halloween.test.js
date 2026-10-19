import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, personalThemeModel } from '../personalThemes.js';
import { availableSeasonalThemes } from '../seasonalThemes.js';

it('registers Halloween after the year-round palettes with its proposed window', () => {
  const season = ALL_THEME_PRESETS.find(item => item.id === 'halloween');
  expect(season).toMatchObject({ name: 'Halloween', seasonal: true, window: { start: '10-01', end: '11-02' } });
  expect(ALL_THEME_PRESETS.indexOf(season)).toBeGreaterThanOrEqual(6);
  expect(personalThemeModel({ basePalette: 'halloween' }).accentName).toBe('Pumpkin');
});

it('offers Halloween only inside its window even when previously chosen', () => {
  const [month, day] = '10-01'.split('-').map(Number);
  const inside = new Date(2026, month - 1, day, 12), before = new Date(2026, month - 1, day - 1, 12);
  expect(availableSeasonalThemes('forest', inside, undefined, false).map(item => item.id)).toContain('halloween');
  expect(availableSeasonalThemes('forest', before, undefined, false).map(item => item.id)).not.toContain('halloween');
  expect(availableSeasonalThemes('halloween', before, undefined, false).map(item => item.id)).not.toContain('halloween');
});

it('stages its decoration band through the root season attribute only', () => {
  const css = readFileSync('src/seasons/halloween.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'halloween' }).season).toBe('halloween');
});
