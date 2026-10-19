import { ALL_THEME_PRESETS, SEASONAL_PRESETS, THEME_BASES, THEME_PRESETS, THEME_SHADE_FAMILIES, normalizePersonalTheme } from './personalThemes.js';

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
    // A season that is no longer part of this build is not damage: its saved
    // year-round fallback proves the payload, and that palette is restored.
    const retiredSeason = value.schemaVersion === 2 && typeof value.basePalette === 'string'
      && THEME_PRESETS.some(item => item.id === value.fallbackPalette);
    const preset = ALL_THEME_PRESETS.find(item => item.id === value.basePalette)
      || (retiredSeason ? THEME_PRESETS.find(item => item.id === value.fallbackPalette) : null);
    if (Object.hasOwn(value, 'basePalette') && value.basePalette !== null && !preset) return null;
    if (Object.hasOwn(value, 'schemaVersion') && value.schemaVersion !== 2) return null;
    if (value.schemaVersion === 2) {
      if (!preset || !record(value.paletteCustomizations)) return null;
      if (Object.entries(value.paletteCustomizations).some(([id, config]) => !THEME_PRESETS.some(item => item.id === id) || !validConfiguration(config))) return null;
      if (Object.hasOwn(value, 'seasonalCustomizations')) {
        if (!record(value.seasonalCustomizations)) return null;
        // Retired seasons are dropped; registered ones are validated strictly.
        if (Object.entries(value.seasonalCustomizations).some(([id, config]) => SEASONAL_PRESETS.some(item => item.id === id) && !validConfiguration(config))) return null;
      }
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
    // Year-round payloads keep their original shape. Seasonal families are
    // stored only while active or customized, with the year-round fallback.
    const seasonal = Object.fromEntries(SEASONAL_PRESETS.filter(preset => preset.id === theme.basePalette
      || theme.seasonalCustomizations[preset.id].accent !== preset.accent || theme.seasonalCustomizations[preset.id].base !== preset.base)
      .map(preset => [preset.id, theme.seasonalCustomizations[preset.id]]));
    const seasonalActive = SEASONAL_PRESETS.some(preset => preset.id === theme.basePalette);
    storage.setItem(PERSONAL_THEME_PREFERENCE, JSON.stringify({ schemaVersion: 2, basePalette: theme.basePalette,
      appearance: theme.appearance, paletteCustomizations: theme.paletteCustomizations,
      ...(Object.keys(seasonal).length ? { seasonalCustomizations: seasonal } : {}),
      ...(seasonalActive ? { fallbackPalette: theme.fallbackPalette } : {}) }));
  }
}
