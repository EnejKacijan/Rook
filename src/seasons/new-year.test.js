import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, personalThemeModel } from '../personalThemes.js';
import { availableSeasonalThemes } from '../seasonalThemes.js';

it('registers New Year after the year-round palettes with its proposed window', () => {
  const season = ALL_THEME_PRESETS.find(item => item.id === 'new-year');
  expect(season).toMatchObject({ name: 'New Year', seasonal: true, window: { start: '12-28', end: '01-07' } });
  expect(ALL_THEME_PRESETS.indexOf(season)).toBeGreaterThanOrEqual(6);
  expect(personalThemeModel({ basePalette: 'new-year' }).accentName).toBe('Midnight Indigo');
});

it('offers New Year only inside its window even when previously chosen', () => {
  const [month, day] = '12-28'.split('-').map(Number);
  const inside = new Date(2026, month - 1, day, 12), before = new Date(2026, month - 1, day - 1, 12);
  expect(availableSeasonalThemes('forest', inside, undefined, false).map(item => item.id)).toContain('new-year');
  expect(availableSeasonalThemes('forest', before, undefined, false).map(item => item.id)).not.toContain('new-year');
  expect(availableSeasonalThemes('new-year', before, undefined, false).map(item => item.id)).not.toContain('new-year');
});

it('stages its decoration band through the root season attribute only', () => {
  const css = readFileSync('src/seasons/new-year.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'new-year' }).season).toBe('new-year');
});
