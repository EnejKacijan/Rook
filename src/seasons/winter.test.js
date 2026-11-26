import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, THEME_PRESETS, personalThemeModel, selectPersonalThemePalette } from '../personalThemes.js';
import { availableSeasonalThemes, createSeasonalRegistry, seasonalThemeInWindow, seasonalWindowLabel } from '../seasonalThemes.js';
import { prepareSeasonalThemeSelection, resolveSeasonalTheme } from '../seasonalThemeLifecycle.js';
import { availableThemeReleases } from '../themeDiscovery.js';
import { colorDistance } from '../seasonalContract.test.js';

const winter = ALL_THEME_PRESETS.find(item => item.id === 'winter');
const day = (y, m, d) => new Date(y, m - 1, d, 12);

it('registers Winter after the year-round palettes with its inclusive, year-wrapping window', () => {
  expect(winter).toMatchObject({ name: 'Winter', seasonal: true, window: { start: '11-26', end: '03-19' } });
  expect(ALL_THEME_PRESETS.indexOf(winter)).toBeGreaterThanOrEqual(6);
  expect(seasonalWindowLabel(winter)).toBe('Nov 26 – Mar 19');
  expect(personalThemeModel({ basePalette: 'winter' }).accentName).toBe('Glacier');
});

it('is in season from Nov 26 through Mar 19, across the new year and on Feb 29', () => {
  for (const date of [day(2026, 11, 26), day(2026, 12, 31), day(2027, 1, 1), day(2027, 3, 19), day(2028, 2, 29)])
    expect(seasonalThemeInWindow(winter, date), date.toDateString()).toBe(true);
  for (const date of [day(2026, 11, 25), day(2027, 3, 20), day(2027, 6, 1)])
    expect(seasonalThemeInWindow(winter, date), date.toDateString()).toBe(false);
  // Local midnight edges, not UTC.
  expect(seasonalThemeInWindow(winter, new Date(2026, 10, 26, 0, 0, 0))).toBe(true);
  expect(seasonalThemeInWindow(winter, new Date(2027, 2, 19, 23, 59, 59))).toBe(true);
  expect(seasonalThemeInWindow(winter, new Date(2027, 2, 20, 0, 0, 0))).toBe(false);
});

it('overlaps Christmas and New Year on purpose: all are offered, none is chosen for you', () => {
  const holiday = (id, start, end) => ({ id, name: id, description: '', base: 'warm', window: { start, end },
    surfaces: winter.surfaces, shades: winter.shades.map((shade, i) => ({ ...shade, id: i ? `${id}-${i}` : id })) });
  const seasons = createSeasonalRegistry([winter, holiday('christmas', '12-01', '12-27'), holiday('new-year', '12-28', '01-07')]);
  expect(availableSeasonalThemes('forest', day(2026, 12, 10), seasons, false).map(item => item.id).sort()).toEqual(['christmas', 'winter']);
  expect(availableSeasonalThemes('forest', day(2027, 1, 2), seasons, false).map(item => item.id).sort()).toEqual(['new-year', 'winter']);
  expect(availableSeasonalThemes('forest', day(2027, 2, 2), seasons, false).map(item => item.id)).toEqual(['winter']);
  // Being in season changes nothing by itself: a saved year-round palette stays.
  const saved = selectPersonalThemePalette({ appearance: 'dark' }, 'ocean');
  expect(resolveSeasonalTheme(saved, day(2026, 12, 10), false)).toEqual(saved);
});

it('one season\'s choice lasts through Mar 19, then the saved palette returns and next winter starts unchosen', () => {
  const chosenInDecember = prepareSeasonalThemeSelection(selectPersonalThemePalette({ basePalette: 'plum', appearance: 'light' }, 'winter'), day(2026, 12, 15), false);
  const chosenInJanuary = prepareSeasonalThemeSelection(selectPersonalThemePalette({ basePalette: 'plum', appearance: 'light' }, 'winter'), day(2027, 1, 10), false);
  expect(chosenInDecember.seasonalValidUntil).toBe('2027-03-19');
  expect(chosenInJanuary.seasonalValidUntil).toBe('2027-03-19');
  expect(resolveSeasonalTheme(chosenInDecember, day(2027, 3, 19), false).basePalette).toBe('winter');
  expect(resolveSeasonalTheme(chosenInDecember, day(2027, 3, 20), false).basePalette).toBe('plum');
  expect(resolveSeasonalTheme(chosenInDecember, day(2027, 12, 5), false).basePalette).toBe('plum');
  expect(() => prepareSeasonalThemeSelection(selectPersonalThemePalette({}, 'winter'), day(2027, 3, 20), false)).toThrow(/season has ended/);
});

it('announces each winter once, by the year it starts, and as Back after its first year', () => {
  const release = date => availableThemeReleases(date, [], [winter]);
  expect(release(day(2026, 11, 26))).toEqual([{ id: 'season:winter:v1:2026', paletteIds: ['winter'], returning: false }]);
  expect(release(day(2027, 3, 19))).toEqual([{ id: 'season:winter:v1:2026', paletteIds: ['winter'], returning: false }]);
  expect(release(day(2027, 3, 20))).toEqual([]);
  expect(release(day(2027, 11, 26))).toEqual([{ id: 'season:winter:v1:2027', paletteIds: ['winter'], returning: true }]);
});

it('reads as its own palette, apart from Ocean, Slate and New Year', () => {
  // Compare with the published New Year default as well.
  const others = { ocean: ['#1f6aa1', '#7ab8ee'], slate: ['#475f76', '#a3bbd3'], 'new-year': ['#4a4fc0', '#a6aaff'],
    ...Object.fromEntries(THEME_PRESETS.filter(item => ['ocean', 'slate'].includes(item.id)).map(item => [item.id, [personalThemeModel({ basePalette: item.id, appearance: 'light' }).tokens['--rook-accent-fill'], personalThemeModel({ basePalette: item.id, appearance: 'dark' }).tokens['--rook-accent-fill']]])) };
  const [light, dark] = ['light', 'dark'].map(appearance => personalThemeModel({ basePalette: 'winter', appearance }).tokens['--rook-accent-fill']);
  for (const [id, [otherLight, otherDark]] of Object.entries(others)) {
    expect(colorDistance(light, otherLight), `${id} light`).toBeGreaterThanOrEqual(.07);
    expect(colorDistance(dark, otherDark), `${id} dark`).toBeGreaterThanOrEqual(.1);
  }
});

it('stages its band and perched drift through the root season attribute only', () => {
  const css = readFileSync('src/seasons/winter.css', 'utf8');
  expect(css.match(/--rook-season-decor:/g)).toHaveLength(2);
  expect(css.match(/--rook-season-perch:/g)).toHaveLength(2);
  expect(personalThemeModel({ basePalette: 'winter' }).season).toBe('winter');
});
