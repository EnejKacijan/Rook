// Bounded design registry. No profile/storage/billing imports or arbitrary CSS input.
export const THEME_ACCENTS = Object.freeze([
  { id: 'forest', name: 'Green', light: '#206b4c', dark: '#4fbf87' },
  { id: 'champagne', name: 'Gold', light: '#b8891e', dark: '#d7b15a' },
  { id: 'ocean', name: 'Ocean', light: '#246c9f', dark: '#78b6ed' },
  { id: 'slate', name: 'Slate', light: '#4b647b', dark: '#a9bdcf' },
  { id: 'plum', name: 'Plum', light: '#77579c', dark: '#c5a2ea' },
  { id: 'terracotta', name: 'Terracotta', light: '#9b5140', dark: '#efa084' },
].map(Object.freeze));
export const THEME_BASES = Object.freeze([
  { id: 'neutral', name: 'Neutral', light: ['#f6f5f2', '#ffffff', '#eceeea'], dark: ['#111413', '#1c201e', '#242a27'] },
  { id: 'warm', name: 'Warm', light: ['#f7f4ef', '#fffdf9', '#eee8df'], dark: ['#161411', '#24201b', '#2c2721'] },
  { id: 'cool', name: 'Cool', light: ['#f3f6f9', '#fcfdff', '#e8edf3'], dark: ['#10151b', '#1a222c', '#242e39'] },
].map(item => Object.freeze({ ...item, light: Object.freeze(item.light), dark: Object.freeze(item.dark) })));
export const THEME_PRESETS = Object.freeze([
  { id: 'forest', name: 'ROOK Green', accent: 'forest', base: 'neutral', canonicalStyle: 'standard' },
  { id: 'champagne', name: 'ROOK Gold', accent: 'champagne', base: 'warm', canonicalStyle: 'premium' },
  { id: 'ocean', name: 'Ocean', accent: 'ocean', base: 'cool' },
  { id: 'slate', name: 'Slate', accent: 'slate', base: 'neutral' },
  { id: 'plum', name: 'Plum', accent: 'plum', base: 'neutral' },
  { id: 'terracotta', name: 'Terracotta', accent: 'terracotta', base: 'warm' },
].map(Object.freeze));
// Each Light/Dark pair is art-directed within its family, then validated by the
// semantic contrast resolver below. These are not arbitrary user color inputs.
const shade = (id, name, light, dark) => Object.freeze({ id, name, light, dark });
const original = id => THEME_ACCENTS.find(item => item.id === id);
export const THEME_SHADE_FAMILIES = Object.freeze({
  forest: Object.freeze([shade('forest-deep', 'Forest', '#195438', '#58a276'),
    { ...original('forest'), name: 'ROOK Green' }, shade('forest-emerald', 'Emerald', '#08705a', '#49cba2'),
    shade('forest-sage', 'Sage', '#4e7157', '#a6c5a4'), shade('forest-mint', 'Mint', '#327766', '#9edbc4')].map(Object.freeze)),
  champagne: Object.freeze([shade('champagne-bronze', 'Bronze', '#8d6325', '#c59959'),
    shade('champagne-ochre', 'Ochre', '#9a741e', '#c9b05d'), { ...original('champagne'), name: 'ROOK Gold' },
    shade('champagne-amber', 'Amber', '#a36f0f', '#e7b951'), shade('champagne-honey', 'Honey', '#a7832c', '#e8cc80')].map(Object.freeze)),
  ocean: Object.freeze([shade('ocean-deep', 'Deep Ocean', '#22577c', '#5a94c5'), original('ocean'),
    shade('ocean-azure', 'Azure', '#196ea9', '#74bdf3'), shade('ocean-teal', 'Teal', '#167074', '#6fc8c3'),
    shade('ocean-steel', 'Steel Blue', '#496c87', '#a0bfd6')]),
  slate: Object.freeze([shade('slate-charcoal', 'Charcoal', '#4c5b63', '#9faeb5'), original('slate'),
    shade('slate-steel', 'Steel', '#526b76', '#abc3cd'), shade('slate-blue-gray', 'Blue Gray', '#506b88', '#a7bfda'),
    shade('slate-mist', 'Mist', '#657581', '#c2cdd4')]),
  plum: Object.freeze([shade('plum-aubergine', 'Aubergine', '#68426f', '#b795c2'), original('plum'),
    shade('plum-violet', 'Violet', '#705ba8', '#b6a5ed'), shade('plum-mauve', 'Mauve', '#855777', '#cca2bf'),
    shade('plum-lavender', 'Lavender', '#7a68a0', '#c3b5e7')]),
  terracotta: Object.freeze([shade('terracotta-brick', 'Brick', '#914738', '#db9282'),
    shade('terracotta-rust', 'Rust', '#96552d', '#dea379'), original('terracotta'),
    shade('terracotta-clay', 'Clay', '#9a6653', '#dcb2a0'), shade('terracotta-coral', 'Coral', '#a34f49', '#efaaa3')]),
});
export const personalThemeShades = palette => THEME_SHADE_FAMILIES[palette] || THEME_SHADE_FAMILIES.forest;
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const presetFor = id => THEME_PRESETS.find(item => item.id === id);
const validBase = id => THEME_BASES.some(item => item.id === id);
function familyConfiguration(preset, value) {
  return { accent: personalThemeShades(preset.id).some(item => item.id === value?.accent) ? value.accent : preset.accent,
    base: validBase(value?.base) ? value.base : preset.base };
}
export function normalizePersonalTheme(value) {
  const legacy = isRecord(value?.overrides) ? { ...value, ...value.overrides } : value;
  // Explicit base identity wins. For old identity-less pairs the registered
  // accent is the evidence of family; never infer it from a background tone.
  const basePalette = presetFor(value?.basePalette)?.id
    || THEME_PRESETS.find(item => personalThemeShades(item.id).some(s => s.id === legacy?.accent))?.id || 'forest';
  const hasFamilies = isRecord(value?.paletteCustomizations);
  const paletteCustomizations = Object.fromEntries(THEME_PRESETS.map(preset => [preset.id,
    familyConfiguration(preset, hasFamilies ? (Object.hasOwn(value.paletteCustomizations, preset.id) ? value.paletteCustomizations[preset.id] : null)
      : preset.id === basePalette ? legacy : null)]));
  const active = paletteCustomizations[basePalette];
  return { schemaVersion: 2, basePalette,
    appearance: ['system', 'light', 'dark'].includes(value?.appearance) ? value.appearance : 'system',
    paletteCustomizations, ...active };
}
export const DEFAULT_PERSONAL_THEME = Object.freeze(normalizePersonalTheme(null));
export function selectPersonalThemePalette(value, palette) {
  const theme = normalizePersonalTheme(value);
  return presetFor(palette) ? normalizePersonalTheme({ ...theme, basePalette: palette }) : theme;
}
export function updatePersonalTheme(value, changes) {
  const theme = normalizePersonalTheme(value), preset = presetFor(theme.basePalette);
  const family = familyConfiguration(preset, { ...theme.paletteCustomizations[preset.id], ...changes });
  return normalizePersonalTheme({ ...theme, appearance: changes.appearance ?? theme.appearance,
    paletteCustomizations: { ...theme.paletteCustomizations, [preset.id]: family } });
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
const onFill = fill => themeContrast('#ffffff', fill) >= 4.5 ? '#ffffff' : readableColor('#101413', [fill]);

// Tone is shared vocabulary; its surfaces stay gently related to the base
// family. Accent shade changes do not unexpectedly repaint the background.
export function personalThemeSurfaces(palette, tone, appearance) {
  const preset = presetFor(palette) || THEME_PRESETS[0];
  const base = THEME_BASES.find(item => item.id === tone) || THEME_BASES[0];
  if (preset.id === 'forest' && tone === 'neutral') return [...base[appearance]];
  if (preset.id === 'champagne' && tone === 'warm') return appearance === 'dark'
    ? ['#11110f', '#181714', '#201e1a'] : ['#f7f5f0', '#ffffff', '#f0ece4'];
  return base[appearance].map(color => mixThemeColor(color, original(preset.accent)[appearance], appearance === 'dark' ? .055 : .025));
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
  const surfaces = [bg, surface, mutedSurface, soft, selected,
    mixThemeColor(bg, fill, .055), mixThemeColor(bg, fill, .08)];
  const text = readableColor(isDark ? '#edf0ee' : '#161a18', surfaces);
  const secondary = readableColor(isDark ? '#a8b2ad' : '#606a64', surfaces);
  // Classic Gold Light uses the text accent itself for its active-row wash.
  // Resolve that pair centrally too; this never changes the underlying fill.
  const initialAccentText = readableColor(fill, surfaces);
  const accentText = readableColor(initialAccentText,
    [...surfaces, mixThemeColor(bg, initialAccentText, .08)]);
  const fillText = onFill(fill), strongFill = readableColor(mixThemeColor(fill, '#000000', .08), [fillText]);
  const controlBorder = readableColor(isDark ? '#7b8680' : '#88938b', surfaces, 3);
  const successSoft = mixThemeColor(surface, isDark ? '#61c18d' : '#1d6a46', .12);
  const success = readableColor(isDark ? '#61c18d' : '#1d6a46', [bg, surface, successSoft]);
  const warningSurface = isDark ? '#302414' : '#f6ebd8', errorSurface = isDark ? '#321d20' : '#fae9e8';
  const warning = readableColor(isDark ? '#edc081' : '#775014', [bg, surface, warningSurface]);
  const error = readableColor(isDark ? '#f3a29c' : '#922f2e', [bg, surface, errorSurface]);
  const role = {
    bg, page: mixThemeColor(bg, isDark ? '#000000' : '#ffffff', .15), surface,
    'surface-elevated': surface, 'surface-muted': mutedSurface, 'surface-raised': mutedSurface,
    text, secondary, muted: secondary, border: mixThemeColor(surface, text, .18),
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
  const basePalette = THEME_PRESETS.find(item => item.id === config.basePalette) || null;
  const customized = Boolean(basePalette && (config.accent !== basePalette.accent || config.base !== basePalette.base));
  const canonicalStyle = !customized ? basePalette.canonicalStyle || null : null;
  const background = bg;
  return { config, appearance, tokens, background, canonicalStyle, basePalette, customized, name: basePalette?.name || 'Custom', accentName: accent.name, baseName: base.name };
}

// Exactly one root owner, with cleanup, for committed and staged themes.
// Restores pre-existing attributes/styles and leaves unrelated root values untouched.
export function applyPreviewTheme(root, { style = 'standard', appearance = 'dark', personal = null }, systemDark = false) {
  const attributes = ['data-style', 'data-appearance', 'data-personal-theme', 'data-theme', 'data-premium-scheme'];
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
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
  return () => {
    for (const [key, value] of previousAttributes) value === null ? root.removeAttribute(key) : root.setAttribute(key, value);
    for (const [key, value, priority] of previousStyles) value ? root.style.setProperty(key, value, priority) : root.style.removeProperty(key);
  };
}
