// Bounded design registry. No profile/storage/billing imports or arbitrary CSS input.
import { SEASONAL_THEMES } from './seasonalThemes.js';
export const THEME_ACCENTS = Object.freeze([
  { id: 'forest', name: 'Green', light: '#206b4c', dark: '#4fbf87' },
  { id: 'champagne', name: 'Gold', light: '#b8891e', dark: '#d7b15a' },
  { id: 'ocean', name: 'Ocean', light: '#1f6aa1', dark: '#7ab8ee' },
  { id: 'slate', name: 'Slate', light: '#475f76', dark: '#a3bbd3' },
  { id: 'plum', name: 'Plum', light: '#73529a', dark: '#c3a0ec' },
  { id: 'terracotta', name: 'Terracotta', light: '#9c4f3c', dark: '#eea083' },
].map(Object.freeze));
export const THEME_BASES = Object.freeze([
  { id: 'neutral', name: 'Neutral', light: ['#f5f5f2', '#ffffff', '#ebece8'], dark: ['#111413', '#1b1f1d', '#242927'] },
  { id: 'warm', name: 'Warm', light: ['#f8f5ef', '#fffdf9', '#efe9df'], dark: ['#151310', '#211e19', '#2b2721'] },
  { id: 'cool', name: 'Cool', light: ['#f2f5f8', '#fcfdff', '#e6ebf1'], dark: ['#0f141a', '#19212a', '#222c37'] },
].map(item => Object.freeze({ ...item, light: Object.freeze(item.light), dark: Object.freeze(item.dark) })));
// Each family owns an art-directed surface ladder for its own default tone
// ([page background, card surface, muted surface]) and a one-line character.
// Other tones are derived from the shared tone vocabulary below.
const ladder = (light, dark) => Object.freeze({ light: Object.freeze(light), dark: Object.freeze(dark) });
export const THEME_PRESETS = Object.freeze([
  { id: 'forest', name: 'ROOK Green', description: 'Signature · focused', accent: 'forest', base: 'neutral', canonicalStyle: 'standard',
    surfaces: ladder(['#f5f6f3', '#ffffff', '#eaede8'], ['#0f1312', '#1a1f1c', '#232926']) },
  { id: 'champagne', name: 'ROOK Gold', description: 'Warm · premium', accent: 'champagne', base: 'warm', canonicalStyle: 'premium',
    surfaces: ladder(['#f8f5ef', '#fffdf8', '#f0eadf'], ['#11100e', '#1a1915', '#24221d']) },
  { id: 'ocean', name: 'Ocean', description: 'Cool · clear', accent: 'ocean', base: 'cool',
    surfaces: ladder(['#f1f5f9', '#fbfdff', '#e3ebf3'], ['#0c131a', '#152029', '#1e2b37']) },
  { id: 'slate', name: 'Slate', description: 'Quiet · minimal', accent: 'slate', base: 'neutral',
    surfaces: ladder(['#f3f4f5', '#ffffff', '#e7e9ec'], ['#111315', '#1a1d20', '#23272b']) },
  { id: 'plum', name: 'Plum', description: 'Rich · calm', accent: 'plum', base: 'neutral',
    surfaces: ladder(['#f6f4f7', '#fffdff', '#ece7ef'], ['#131117', '#1d1a22', '#27232d']) },
  { id: 'terracotta', name: 'Terracotta', description: 'Earthy · warm', accent: 'terracotta', base: 'warm',
    surfaces: ladder(['#f9f4f0', '#fffcfa', '#f1e7df'], ['#15110f', '#201a17', '#2a231f']) },
].map(Object.freeze));
// Each Light/Dark pair is art-directed within its family, then validated by the
// semantic contrast resolver below. These are not arbitrary user color inputs.
const shade = (id, name, light, dark) => Object.freeze({ id, name, light, dark });
const original = id => THEME_ACCENTS.find(item => item.id === id);
export const THEME_SHADE_FAMILIES = Object.freeze({
  forest: Object.freeze([shade('forest-deep', 'Forest', '#1a5038', '#5aa77a'),
    { ...original('forest'), name: 'ROOK Green' }, shade('forest-emerald', 'Emerald', '#0b6e58', '#4ccba3'),
    shade('forest-sage', 'Sage', '#4d6e55', '#a5c4a2'), shade('forest-mint', 'Mint', '#2f7566', '#9bdcc5')].map(Object.freeze)),
  champagne: Object.freeze([shade('champagne-bronze', 'Bronze', '#8a5f22', '#c99a5c'),
    shade('champagne-ochre', 'Antique', '#7c6a2c', '#c9b46b'), { ...original('champagne'), name: 'ROOK Gold' },
    shade('champagne-amber', 'Amber', '#a8640c', '#eda94a'), shade('champagne-honey', 'Honey', '#a5842a', '#ecd08a')].map(Object.freeze)),
  ocean: Object.freeze([shade('ocean-deep', 'Deep Ocean', '#1f4f78', '#5f97c8'), original('ocean'),
    shade('ocean-azure', 'Azure', '#1170b0', '#66c6fa'), shade('ocean-teal', 'Teal', '#136d72', '#6dcac4'),
    shade('ocean-steel', 'Steel Blue', '#476a86', '#9ebfd8')]),
  slate: Object.freeze([shade('slate-charcoal', 'Graphite', '#3e4a53', '#a2aeb7'), original('slate'),
    shade('slate-steel', 'Steel', '#2f6b78', '#94c3cf'), shade('slate-blue-gray', 'Blue Gray', '#4c6890', '#a6c0e2'),
    shade('slate-mist', 'Mist', '#66747f', '#c7d1d9')]),
  plum: Object.freeze([shade('plum-aubergine', 'Aubergine', '#62406c', '#b996c4'), original('plum'),
    shade('plum-violet', 'Violet', '#6a55ad', '#b3a3f0'), shade('plum-mauve', 'Mauve', '#835576', '#cfa3c1'),
    shade('plum-lavender', 'Orchid', '#8a4d8c', '#dca7dc')]),
  terracotta: Object.freeze([shade('terracotta-brick', 'Brick', '#8e4436', '#dc9283'),
    shade('terracotta-rust', 'Rust', '#94532a', '#e0a379'), original('terracotta'),
    shade('terracotta-clay', 'Clay', '#9a6653', '#dcb2a0'), shade('terracotta-coral', 'Coral', '#a8434f', '#f1aaa3')].map(Object.freeze)),
  // Seasonal families are registered by their own season modules.
  ...Object.fromEntries(SEASONAL_THEMES.map(season => [season.id, season.shades])),
});
// Year-round palettes first, then whichever seasons are merged.
export const SEASONAL_PRESETS = SEASONAL_THEMES;
export const ALL_THEME_PRESETS = Object.freeze([...THEME_PRESETS, ...SEASONAL_PRESETS]);
export const personalThemeShades = palette => THEME_SHADE_FAMILIES[palette] || THEME_SHADE_FAMILIES.forest;
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const presetFor = id => ALL_THEME_PRESETS.find(item => item.id === id);
const yearRound = id => THEME_PRESETS.some(item => item.id === id);
const defaultShade = preset => personalThemeShades(preset.id).find(item => item.id === preset.accent);
const validBase = id => THEME_BASES.some(item => item.id === id);
function familyConfiguration(preset, value) {
  return { accent: personalThemeShades(preset.id).some(item => item.id === value?.accent) ? value.accent : preset.accent,
    base: validBase(value?.base) ? value.base : preset.base };
}
export function normalizePersonalTheme(value) {
  const legacy = isRecord(value?.overrides) ? { ...value, ...value.overrides } : value;
  // Explicit base identity wins. For old identity-less pairs the registered
  // accent is the evidence of family; never infer it from a background tone.
  // A retired season (no longer registered) returns to its year-round fallback.
  const fallbackPalette = yearRound(value?.fallbackPalette) ? value.fallbackPalette : null;
  const basePalette = presetFor(value?.basePalette)?.id || fallbackPalette
    || THEME_PRESETS.find(item => personalThemeShades(item.id).some(s => s.id === legacy?.accent))?.id || 'forest';
  const hasFamilies = isRecord(value?.paletteCustomizations);
  const paletteCustomizations = Object.fromEntries(THEME_PRESETS.map(preset => [preset.id,
    familyConfiguration(preset, hasFamilies ? (Object.hasOwn(value.paletteCustomizations, preset.id) ? value.paletteCustomizations[preset.id] : null)
      : preset.id === basePalette ? legacy : null)]));
  // Seasonal Fine-tune choices are kept apart so a season can come and go
  // without touching the year-round families.
  const hasSeasons = isRecord(value?.seasonalCustomizations), seasonal = hasSeasons ? value.seasonalCustomizations : {};
  const seasonalCustomizations = Object.fromEntries(SEASONAL_PRESETS.map(preset => [preset.id,
    familyConfiguration(preset, hasSeasons ? (Object.hasOwn(seasonal, preset.id) ? seasonal[preset.id] : null)
      : preset.id === basePalette ? legacy : null)]));
  const active = paletteCustomizations[basePalette] || seasonalCustomizations[basePalette];
  return { schemaVersion: 2, basePalette,
    appearance: ['system', 'light', 'dark'].includes(value?.appearance) ? value.appearance : 'system',
    paletteCustomizations, seasonalCustomizations,
    fallbackPalette: yearRound(basePalette) ? basePalette : fallbackPalette || 'forest', ...active };
}
export const DEFAULT_PERSONAL_THEME = Object.freeze(normalizePersonalTheme(null));
export function selectPersonalThemePalette(value, palette) {
  const theme = normalizePersonalTheme(value);
  return presetFor(palette) ? normalizePersonalTheme({ ...theme, basePalette: palette }) : theme;
}
export function updatePersonalTheme(value, changes) {
  const theme = normalizePersonalTheme(value), preset = presetFor(theme.basePalette);
  const group = preset.seasonal ? 'seasonalCustomizations' : 'paletteCustomizations';
  const family = familyConfiguration(preset, { ...theme[group][preset.id], ...changes });
  return normalizePersonalTheme({ ...theme, appearance: changes.appearance ?? theme.appearance,
    [group]: { ...theme[group], [preset.id]: family } });
}
export function resetPersonalThemePalette(value) {
  const theme = normalizePersonalTheme(value), preset = presetFor(theme.basePalette);
  return updatePersonalTheme(theme, { accent: preset.accent, base: preset.base });
}

// Read the saved preference, never the root's already-resolved Light/Dark value.
export function personalThemeFromProfile(profile = {}) {
  const style = profile.stylePreference || (profile.themePreference === 'premium' ? 'premium' : 'standard');
  const appearance = profile.appearancePreference || (profile.themePreference === 'premium' ? 'system' : profile.themePreference) || 'system';
  return normalizePersonalTheme({ accent: style === 'premium' ? 'champagne' : 'forest', base: style === 'premium' ? 'warm' : 'neutral', appearance });
}

export function personalThemeSummary(theme) {
  const model = personalThemeModel(theme);
  const mode = { system: 'System', light: 'Light', dark: 'Dark' }[model.config.appearance];
  if (model.customized) return `${model.name} · Customized · ${model.baseName} · ${mode}`;
  return `${model.name} · ${mode}`;
}
const rgb = hex => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Only curated six-digit colors are supported.');
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
};
const rgbList = color => rgb(color).join(', ');
const hex = channels => `#${channels.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
export const mixThemeColor = (left, right, amount) => hex(rgb(left).map((value, index) => value + (rgb(right)[index] - value) * amount));
const luminance = color => rgb(color).map(value => {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
export function themeContrast(left, right) {
  const [a, b] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (a + .05) / (b + .05);
}
const minimumContrast = (color, surfaces) => Math.min(...surfaces.map(surface => themeContrast(color, surface)));
// Deterministic, bounded tint adjustment; registry selection never accepts raw colors.
function readableColor(color, surfaces, minimum = 4.5) {
  if (minimumContrast(color, surfaces) >= minimum) return color;
  for (let step = 1; step <= 100; step++) {
    for (const end of ['#000000', '#ffffff']) {
      const candidate = mixThemeColor(color, end, step / 100);
      if (minimumContrast(candidate, surfaces) >= minimum) return candidate;
    }
  }
  throw new Error('This combination cannot meet the curated theme contrast budget.');
}
// Text on a filled control keeps a trace of the fill hue, so a pale button
// reads as one object rather than generic black on color.
const onFill = fill => themeContrast('#ffffff', fill) >= 4.5 ? readableColor(mixThemeColor('#ffffff', fill, .04), [fill])
  : readableColor(mixThemeColor(fill, '#000000', .86), [fill]);

// Tone is shared vocabulary; its surfaces stay gently related to the family.
// A family's own default tone uses its art-directed ladder. Accent shade
// changes never repaint the background.
export function personalThemeSurfaces(palette, tone, appearance) {
  const preset = presetFor(palette) || THEME_PRESETS[0];
  const base = THEME_BASES.find(item => item.id === tone) || THEME_BASES[0];
  if (tone === preset.base && preset.surfaces) return [...preset.surfaces[appearance]];
  return base[appearance].map(color => mixThemeColor(color, defaultShade(preset)[appearance], appearance === 'dark' ? .06 : .03));
}

export function personalThemeModel(input, systemDark = false) {
  const config = normalizePersonalTheme(input);
  const appearance = config.appearance === 'system' ? systemDark ? 'dark' : 'light' : config.appearance;
  const isDark = appearance === 'dark';
  const accent = personalThemeShades(config.basePalette).find(item => item.id === config.accent);
  const base = THEME_BASES.find(item => item.id === config.base);
  const [bg, surface, mutedSurface] = personalThemeSurfaces(config.basePalette, config.base, appearance);
  const fill = accent[appearance], soft = mixThemeColor(surface, fill, isDark ? .15 : .10);
  const selected = mixThemeColor(surface, fill, isDark ? .23 : .16);
  // Logger rows tint the main background as well as cards. Their small active
  // set number must use readable text, even when the fill is a pale Gold shade.
  // Dark sheets and cards sit one quiet step above the card surface.
  const elevated = isDark ? mixThemeColor(surface, '#ffffff', .035) : surface;
  const surfaces = [bg, surface, elevated, mutedSurface, soft, selected,
    mixThemeColor(bg, fill, .055), mixThemeColor(bg, fill, .08)];
  // Neutral ink carries a trace of the family hue so text, borders and
  // surfaces read as one palette instead of generic gray on color.
  const text = readableColor(mixThemeColor(isDark ? '#eef0ef' : '#15191a', fill, isDark ? .05 : .08), surfaces);
  const secondary = readableColor(mixThemeColor(isDark ? '#a9b1ad' : '#5e6763', fill, isDark ? .1 : .12), surfaces);
  const shadowInk = rgbList(mixThemeColor(fill, '#000000', isDark ? .9 : .72));
  // Classic Gold Light uses the text accent itself for its active-row wash.
  // Resolve that pair centrally too; this never changes the underlying fill.
  const initialAccentText = readableColor(fill, surfaces);
  const accentText = readableColor(initialAccentText,
    [...surfaces, mixThemeColor(bg, initialAccentText, .08)]);
  const fillText = onFill(fill), strongFill = readableColor(mixThemeColor(fill, '#000000', .08), [fillText]);
  const controlBorder = readableColor(mixThemeColor(isDark ? '#7b8680' : '#88938b', fill, .16), surfaces, 3);
  const successSoft = mixThemeColor(surface, isDark ? '#61c18d' : '#1d6a46', .12);
  const success = readableColor(isDark ? '#61c18d' : '#1d6a46', [bg, surface, successSoft]);
  const warningSurface = isDark ? '#302414' : '#f6ebd8', errorSurface = isDark ? '#321d20' : '#fae9e8';
  const warning = readableColor(isDark ? '#edc081' : '#775014', [bg, surface, warningSurface]);
  const error = readableColor(isDark ? '#f3a29c' : '#922f2e', [bg, surface, errorSurface]);
  const role = {
    bg, page: mixThemeColor(bg, isDark ? '#000000' : '#ffffff', .15), surface,
    'surface-elevated': elevated, 'surface-muted': mutedSurface, 'surface-raised': mutedSurface,
    text, secondary, muted: secondary, border: mixThemeColor(surface, text, isDark ? .15 : .14),
    // Depth roles are family-tinted, never pure gray, in both appearances.
    shadow: `rgba(${shadowInk}, ${isDark ? .5 : .13})`, 'shadow-soft': `rgba(${shadowInk}, ${isDark ? .32 : .07})`,
    scrim: `rgba(${shadowInk}, ${isDark ? .7 : .4})`,
    'accent-shadow': isDark ? 'rgba(0, 0, 0, .34)' : `rgba(${rgbList(fill)}, .26)`,
    'border-strong': controlBorder, 'control-border': controlBorder,
    accent: fill, 'accent-fill': fill, 'accent-fill-strong': strongFill,
    'accent-text': accentText, 'accent-strong': accentText, 'accent-soft': soft,
    'illustration-ink': accentText,
    'on-accent': fillText, 'on-accent-fill': fillText,
    'accent-hairline': controlBorder, 'accent-ring': accentText, 'accent-glow': soft,
    'focus-ring': accentText, 'focus-ring-soft': accentText,
    selected, 'on-selected': text, 'selected-line': accentText,
    'unit-selected-surface': selected, 'unit-selected-text': text,
    'calendar-marker': accentText, 'review-text': accentText, 'review-border': accentText,
    'week-surface-line': controlBorder, 'week-rest-surface': mutedSurface,
    'week-rest-line': mixThemeColor(surface, text, .18), 'week-rest-text': secondary,
    'week-planned-surface': soft, 'week-planned-line': controlBorder, 'week-planned-text': text,
    'week-selected-surface': selected, 'week-selected-rest-surface': selected,
    'week-selected-line': accentText, 'week-selected-text': text,
    'week-marker': accentText, 'week-completed-marker': success,
    success, 'success-soft': successSoft, 'success-line': success, 'on-success': onFill(success),
    'warning-surface': warningSurface, 'warning-text': warning, 'warning-line': warning,
    'warning-tint': warningSurface, 'warning-strong': warning,
    'error-surface': errorSurface, 'error-text': error,
    'disabled-surface': mutedSurface, 'disabled-text': secondary,
    'set-active': soft, 'set-active-line': controlBorder, 'set-edited': soft,
    'set-edited-line': accentText, 'set-ready': soft, 'set-ready-line': accentText,
    'set-done': 'transparent', 'set-done-line': 'transparent', 'set-wash': soft,
    'stepper-divider': mixThemeColor(surface, text, .18), 'workout-secondary-action': secondary,
    'coach-surface': surface, 'coach-text': text, 'coach-badge-bg': soft, 'coach-badge-text': accentText,
    'nav-bg': bg, progress: accentText, dot: secondary,
    // The compact timer has always been an inverse surface in Light. Pair its
    // foregrounds explicitly instead of inheriting legacy white-on-dark copy
    // alongside a new pale Personal Theme surface.
    timer: isDark ? mutedSurface : '#1d1b18',
    'timer-text': isDark ? text : '#f4f1e8',
    'timer-secondary': isDark ? secondary : '#b7b1a5',
    'timer-button': isDark ? surface : '#39352f',
    'timer-button-text': isDark ? text : '#f4f1e8',
    'timer-border': controlBorder,
    // Light snackbars stay dark; Dark uses the existing raised surface role.
    'inverse-accent': readableColor(fill, isDark ? ['#1b1a19', mutedSurface] : ['#1b1a19']),
  };
  const tokens = Object.fromEntries(Object.entries(role).map(([key, value]) => [`--rook-${key}`, value]));
  const basePalette = presetFor(config.basePalette) || null;
  const customized = Boolean(basePalette && (config.accent !== basePalette.accent || config.base !== basePalette.base));
  const canonicalStyle = !customized ? basePalette.canonicalStyle || null : null;
  const background = bg;
  const season = basePalette?.seasonal ? basePalette.id : null;
  return { config, appearance, tokens, background, canonicalStyle, basePalette, season, customized, name: basePalette?.name || 'Custom', accentName: accent.name, baseName: base.name };
}

// Exactly one root owner, with cleanup, for committed and staged themes.
// Restores pre-existing attributes/styles and leaves unrelated root values untouched.
export function applyPreviewTheme(root, { style = 'standard', appearance = 'dark', personal = null }, systemDark = false) {
  const attributes = ['data-style', 'data-appearance', 'data-personal-theme', 'data-theme', 'data-premium-scheme', 'data-season'];
  const previousAttributes = attributes.map(key => [key, root.getAttribute(key)]);
  const model = personal ? personalThemeModel(personal, systemDark) : null;
  // Every personal variant uses the tested semantic roles, including defaults.
  // Existing appearance/style selectors remain available to non-theme layout.
  const values = { 'color-scheme': model?.appearance || appearance, ...(model ? model.tokens : {}) };
  const previousStyles = Object.keys(values).map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)]);
  root.dataset.style = model ? model.canonicalStyle || 'standard' : style;
  root.dataset.appearance = model?.appearance || appearance;
  root.dataset.theme = root.dataset.style === 'premium' ? 'premium' : root.dataset.appearance;
  if (root.dataset.style === 'premium') root.dataset.premiumScheme = root.dataset.appearance;
  else root.removeAttribute('data-premium-scheme');
  if (model) root.dataset.personalTheme = `${model.config.accent}-${model.config.base}`;
  else root.removeAttribute('data-personal-theme');
  // Seasonal decoration hangs off one root attribute, staged with the preview.
  if (model?.season) root.dataset.season = model.season;
  else root.removeAttribute('data-season');
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
  return () => {
    for (const [key, value] of previousAttributes) value === null ? root.removeAttribute(key) : root.setAttribute(key, value);
    for (const [key, value, priority] of previousStyles) value ? root.style.setProperty(key, value, priority) : root.style.removeProperty(key);
  };
}
