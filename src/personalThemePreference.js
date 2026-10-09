import { THEME_BASES, THEME_PRESETS, THEME_SHADE_FAMILIES, normalizePersonalTheme } from './personalThemes.js';

// Appearance preference only. Existing key is retained for deterministic v1
// migration; the payload is now schemaVersion 2. Never sync staged previews.
export const PERSONAL_THEME_PREFERENCE = 'rook.local-review.personal-theme.v1';
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const accents = Object.values(THEME_SHADE_FAMILIES).flat().map(item => item.id);
function validConfiguration(value) {
  return record(value) && Object.keys(value).every(key => ['accent', 'base'].includes(key))
    && (!Object.hasOwn(value, 'accent') || accents.includes(value.accent))
    && (!Object.hasOwn(value, 'base') || THEME_BASES.some(item => item.id === value.base));
}

export function readPersonalThemePreference(storage) {
  try {
    const value = JSON.parse((storage || globalThis.localStorage).getItem(PERSONAL_THEME_PREFERENCE));
    if (!record(value)) return null;
    if (!['system', 'light', 'dark'].includes(value.appearance)) return null;
    const preset = THEME_PRESETS.find(item => item.id === value.basePalette);
    if (Object.hasOwn(value, 'basePalette') && value.basePalette !== null && !preset) return null;
    if (Object.hasOwn(value, 'schemaVersion') && value.schemaVersion !== 2) return null;
    if (value.schemaVersion === 2) {
      if (!preset || !record(value.paletteCustomizations)) return null;
      if (Object.entries(value.paletteCustomizations).some(([id, config]) => !THEME_PRESETS.some(item => item.id === id) || !validConfiguration(config))) return null;
      return normalizePersonalTheme(value);
    }
    if (Object.hasOwn(value, 'overrides')) {
      if (!validConfiguration(value.overrides)) return null;
      if (!preset && (!value.overrides.accent || !value.overrides.base)) return null;
      return normalizePersonalTheme({ accent: preset?.accent, base: preset?.base, ...value.overrides, appearance: value.appearance, basePalette: value.basePalette });
    }
    if (!validConfiguration({ accent: value.accent, base: value.base })) return null;
    // Keep a known base; out-of-family legacy accents fall back to its default.
    // Read does not write: Cancel leaves even the original v1 payload intact.
    return normalizePersonalTheme(value);
  } catch { return null; }
}

// Write first: a failed save must leave the committed theme and sheet intact.
export function savePersonalThemePreference(value, storage = globalThis.localStorage) {
  if (value === null) storage.removeItem(PERSONAL_THEME_PREFERENCE);
  else {
    const theme = normalizePersonalTheme(value);
    storage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: theme.basePalette,
      appearance: theme.appearance, paletteCustomizations: theme.paletteCustomizations }));
  }
}
