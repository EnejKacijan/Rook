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

export function themeDiscoveryKey(profileId) {
  return typeof profileId === 'string' && profileId ? `${THEME_DISCOVERY_KEY}:${encodeURIComponent(profileId)}` : null;
}

export function readSeenThemeReleases(storage, key = THEME_DISCOVERY_KEY) {
  try {
    const value = JSON.parse((storage || globalThis.localStorage).getItem(key));
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length <= 160).slice(-200) : []);
  } catch { return new Set(); }
}

export function saveSeenThemeReleases(ids, storage, key = THEME_DISCOVERY_KEY) {
  try { (storage || globalThis.localStorage).setItem(key, JSON.stringify([...ids].slice(-200))); }
  catch { /* Discovery is optional; the in-memory acknowledgement still works. */ }
}

// A new account starts with the themes available when it joined. Missing
// metadata gets a quiet baseline instead of advertising the whole catalog.
export function initialSeenThemeReleases({profileId, accountCreatedAt, now = new Date(), storage = globalThis.localStorage}) {
  const key = themeDiscoveryKey(profileId);
  if (!key) return new Set();
  try { if (storage.getItem(key) !== null) return readSeenThemeReleases(storage, key); }
  catch { /* Build an in-memory baseline when local preferences are blocked. */ }
  const created = Date.parse(accountCreatedAt);
  const date = Number.isFinite(created) && created > 0 ? new Date(Math.min(created, now.getTime())) : now;
  const seen = new Set([...readSeenThemeReleases(storage), ...availableThemeReleases(date).map(item => item.id)]);
  saveSeenThemeReleases(seen, storage, key);
  return seen;
}
