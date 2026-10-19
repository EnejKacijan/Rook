// Seasonal theme registry. Each season ships as one self-registering module
// (src/seasons/<id>.js, plus its own CSS) on its own branch, so releasing one
// season never brings another. Modules are discovered at build time; with no
// season merged the registry is empty and the picker shows no seasonal group.
// Season modules are plain data: no imports. Their decoration CSS sits next
// to them as src/seasons/<id>.css and is loaded here.
let modules = {};
try {
  modules = import.meta.glob(['./seasons/*.js', '!./seasons/*.test.js'], { eager: true });
  import.meta.glob('./seasons/*.css', { eager: true });
} catch { /* Plain Node scripts have no build-time glob: no seasons there. */ }

const monthDay = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const color = /^#[0-9a-f]{6}$/i;
const colors = (list, length) => Array.isArray(list) && list.length === length && list.every(item => color.test(item));
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

// A malformed season is dropped rather than half-registered.
export function validSeasonalTheme(season) {
  if (!record(season) || !/^[a-z][a-z0-9-]*$/.test(season.id || '')) return false;
  if (typeof season.name !== 'string' || !season.name || typeof season.description !== 'string') return false;
  if (!record(season.window) || !monthDay.test(season.window.start) || !monthDay.test(season.window.end)) return false;
  if (!['neutral', 'warm', 'cool'].includes(season.base)) return false;
  if (!record(season.surfaces) || !colors(season.surfaces.light, 3) || !colors(season.surfaces.dark, 3)) return false;
  if (!Array.isArray(season.shades) || season.shades.length !== 5) return false;
  if (!season.shades.every(shade => record(shade) && (shade.id === season.id || shade.id?.startsWith(`${season.id}-`))
    && typeof shade.name === 'string' && color.test(shade.light) && color.test(shade.dark))) return false;
  return season.shades.some(shade => shade.id === season.id);
}

const freeze = season => Object.freeze({ ...season, seasonal: true, accent: season.id,
  window: Object.freeze({ ...season.window }),
  surfaces: Object.freeze({ light: Object.freeze([...season.surfaces.light]), dark: Object.freeze([...season.surfaces.dark]) }),
  shades: Object.freeze(season.shades.map(shade => Object.freeze({ ...shade }))) });

export function createSeasonalRegistry(seasons) {
  const unique = new Map();
  for (const season of seasons) if (validSeasonalTheme(season) && !unique.has(season.id)) unique.set(season.id, freeze(season));
  // Calendar order from January keeps the picker predictable across years.
  return Object.freeze([...unique.values()].sort((a, b) => a.window.start.localeCompare(b.window.start)));
}

export const SEASONAL_THEMES = createSeasonalRegistry(Object.values(modules).map(module => module.default));

// Review builds can list every merged season regardless of date:
//   VITE_ROOK_ALL_SEASONS=true npm run build
// REVIEW BRANCH ONLY (claude/seasonal-preview): every season is listed regardless of
// date. Never merge this branch; release seasons from their own branches.
export const SHOW_ALL_SEASONS = import.meta.env?.MODE !== 'test' && import.meta.env?.VITE_ROOK_ALL_SEASONS !== 'false';

const pad = value => String(value).padStart(2, '0');
// Windows are inclusive local dates and may wrap the year (Dec 28 – Jan 7).
export function seasonalThemeInWindow(season, date = new Date()) {
  const today = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const { start, end } = season.window;
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

// The picker offers a season during its window. A season the person already
// uses stays listed (and keeps working) after its window ends until they
// choose another palette; it is never switched away silently.
// Current seasons first, then the next to start.
export function availableSeasonalThemes(currentPalette, date = new Date(), seasons = SEASONAL_THEMES, showAll = SHOW_ALL_SEASONS) {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const untilStart = season => {
    if (seasonalThemeInWindow(season, date)) return 0;
    const start = new Date(today.getFullYear(), Number(season.window.start.slice(0, 2)) - 1, Number(season.window.start.slice(3)));
    if (start < today) start.setFullYear(start.getFullYear() + 1);
    return Math.round((start - today) / 864e5);
  };
  return seasons.filter(season => showAll || season.id === currentPalette || seasonalThemeInWindow(season, date))
    .map(season => [untilStart(season), season]).sort((a, b) => a[0] - b[0]).map(([, season]) => season);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const seasonalWindowLabel = season => {
  const label = value => `${MONTHS[Number(value.slice(0, 2)) - 1]} ${Number(value.slice(3))}`;
  return `${label(season.window.start)} – ${label(season.window.end)}`;
};
