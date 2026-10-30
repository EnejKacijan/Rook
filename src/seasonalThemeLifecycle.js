import { normalizePersonalTheme, SEASONAL_PRESETS, selectPersonalThemePalette } from './personalThemes.js';
import { seasonalThemeInWindow, SHOW_ALL_SEASONS } from './seasonalThemes.js';
import {seasonalAccessPolicy,seasonalThemeAvailability,seasonalThemeCanApply} from './seasonalThemeAccess.js';

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
export function resolveSeasonalTheme(theme, date = new Date(), showAll = SHOW_ALL_SEASONS, access) {
  if (!theme) return null;
  const season = SEASONAL_PRESETS.find(item => item.id === theme.basePalette);
  const policy=seasonalAccessPolicy(access);
  if (!season || showAll&&!policy.enabled) return theme;
  const availability=seasonalThemeAvailability(season,{date,showAll,access});
  if(availability==='unavailable')return selectPersonalThemePalette(theme,normalizePersonalTheme(theme).fallbackPalette);
  // Unknown access defers a cosmetic transition; it never authorizes a new
  // seasonal Apply. The subscription owner must resolve active/free status.
  if(policy.enabled&&availability!=='unavailable'&&policy.status==='unknown')return theme;
  if(availability==='pro')return theme;
  if(policy.enabled&&policy.status==='active'&&availability==='free')
    return {...theme,seasonalValidUntil:seasonalSelectionLastDay(season,date)};
  // v2 did not record which year's season the person chose. Do not guess and
  // accidentally reactivate a selection made a year ago.
  if (seasonalThemeInWindow(season, date) && theme.seasonalValidUntil === seasonalSelectionLastDay(season, date)) return theme;
  return selectPersonalThemePalette(theme, normalizePersonalTheme(theme).fallbackPalette);
}
export function prepareSeasonalThemeSelection(theme, date = new Date(), showAll = SHOW_ALL_SEASONS, access) {
  const next = normalizePersonalTheme(theme);
  const season = SEASONAL_PRESETS.find(item => item.id === next.basePalette);
  if (!season) return next;
  const availability=seasonalThemeAvailability(season,{date,showAll,access});
  if(!seasonalThemeCanApply(availability)) {
    const [message,code]=availability==='unknown'?['Pro access is not confirmed. Try again when it is available.','pro-unconfirmed']:
      availability==='pro-required'?['ROOK Pro is required to use this seasonal theme outside its season.','seasonal-pro-required']:
      availability==='unavailable'?['This theme is not available in this release.','season-unavailable']:
      ['This season has ended. Choose another palette.','season-ended'];
    throw Object.assign(new Error(message),{code});
  }
  let until=seasonalSelectionLastDay(season,date);
  // An explicit Pro selection outside its window belongs to the next free
  // occurrence. If Pro ends during that window while the app was closed, the
  // same selected theme is still free; this is not a subscription expiry date.
  if(availability==='pro'&&until<localThemeDay(date))until=`${Number(until.slice(0,4))+1}${until.slice(4)}`;
  return { ...next, seasonalValidUntil: until };
}
export function nextThemeMidnightDelay(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime() + 20);
}
