import { SEASONAL_PRESETS, THEME_PRESETS } from './personalThemes.js';
import { seasonalThemeInWindow } from './seasonalThemes.js';
import { localThemeDay, seasonalSelectionLastDay } from './seasonalThemeLifecycle.js';

export const THEME_DISCOVERY_KEY = 'rook.theme-discovery.v1';
const CURATED_RELEASE_START = '2026-10-19';

// Registry membership is the release boundary. An unmerged season cannot be
// announced, and the review-build flag never advertises an out-of-season choice.
export function availableThemeReleases(date = new Date(), palettes = THEME_PRESETS, seasons = SEASONAL_PRESETS) {
  const day = localThemeDay(date);
  return [
    ...(day >= CURATED_RELEASE_START ? palettes.map(item => ({id:`palette:${item.id}:v1`,paletteIds:[item.id]})) : []),
    ...seasons.filter(season => seasonalThemeInWindow(season, date)).map(season => {
      const endYear = Number(seasonalSelectionLastDay(season, date).slice(0,4));
      const startYear = endYear - (season.window.start > season.window.end ? 1 : 0);
      return {id:`season:${season.id}:v1:${startYear}`, paletteIds:[season.id], returning:startYear > (season.releaseYear || startYear)};
    }),
  ];
}

export function readSeenThemeReleases(storage) {
  try {
    const value = JSON.parse((storage || globalThis.localStorage).getItem(THEME_DISCOVERY_KEY));
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length <= 160).slice(-200) : []);
  } catch { return new Set(); }
}

export function saveSeenThemeReleases(ids, storage) {
  try { (storage || globalThis.localStorage).setItem(THEME_DISCOVERY_KEY, JSON.stringify([...ids].slice(-200))); }
  catch { /* Discovery is optional; the in-memory acknowledgement still works. */ }
}
