import { normalizePersonalTheme, SEASONAL_PRESETS, selectPersonalThemePalette } from './personalThemes.js';
import { seasonalThemeInWindow, SHOW_ALL_SEASONS } from './seasonalThemes.js';

export const localThemeDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function validSeasonalLastDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function seasonalSelectionLastDay(season, date) {
  const today = localThemeDay(date).slice(5);
  const wraps = season.window.start > season.window.end;
  const endYear = date.getFullYear() + (wraps && today >= season.window.start ? 1 : 0);
  return `${endYear}-${season.window.end}`;
}
export function resolveSeasonalTheme(theme, date = new Date(), showAll = SHOW_ALL_SEASONS) {
  if (!theme) return null;
  const season = SEASONAL_PRESETS.find(item => item.id === theme.basePalette);
  if (!season || showAll) return theme;
  // v2 did not record which year's season the person chose. Do not guess and
  // accidentally reactivate a selection made a year ago.
  if (seasonalThemeInWindow(season, date) && theme.seasonalValidUntil === seasonalSelectionLastDay(season, date)) return theme;
  return selectPersonalThemePalette(theme, normalizePersonalTheme(theme).fallbackPalette);
}
export function prepareSeasonalThemeSelection(theme, date = new Date(), showAll = SHOW_ALL_SEASONS) {
  const next = normalizePersonalTheme(theme);
  const season = SEASONAL_PRESETS.find(item => item.id === next.basePalette);
  if (!season) return next;
  if (!showAll && !seasonalThemeInWindow(season, date)) {
    throw Object.assign(new Error('This season has ended. Choose another palette.'), { code: 'season-ended' });
  }
  return { ...next, seasonalValidUntil: seasonalSelectionLastDay(season, date) };
}
export function nextThemeMidnightDelay(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime() + 20);
}
