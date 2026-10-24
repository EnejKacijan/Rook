import { expect, it } from 'vitest';
import { THEME_PRESETS, personalThemeIconColor, rookIconSvg, themeContrast, ROOK_ICON_TILE, ROOK_ICON_LETTER } from './personalThemes.js';
import { readFileSync } from 'node:fs';
import { STABLE_FAVICON, themeFaviconHref } from './themeFavicon.js';

it('keeps the exact stable icon for no theme and default ROOK Green', () => {
  expect(themeFaviconHref(null)).toBe(STABLE_FAVICON);
  expect(themeFaviconHref({ basePalette: 'forest', appearance: 'dark' })).toBe(STABLE_FAVICON);
  // The generated mark is the shipped icon, letter for letter.
  expect(rookIconSvg()).toBe(readFileSync('public/icon.svg', 'utf8').trim());
});

it('tints only the letter, readable on the dark tile, for every year-round family', () => {
  for (const preset of THEME_PRESETS) {
    const letter = personalThemeIconColor({ basePalette: preset.id, appearance: 'light' });
    expect(themeContrast(letter, ROOK_ICON_TILE), preset.id).toBeGreaterThanOrEqual(4.5);
    if (preset.id !== 'forest') {
      expect(letter).not.toBe(ROOK_ICON_LETTER);
      const href = decodeURIComponent(themeFaviconHref({ basePalette: preset.id }));
      expect(href).toContain(`fill="${ROOK_ICON_TILE}"`);
      expect(href).toContain(`fill="${letter}"`);
    }
  }
});

it('never touches the installed app icons', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  expect(manifest.icons.map(icon => icon.src)).toEqual(['/icon.svg']);
  expect(readFileSync('src/themeFavicon.js', 'utf8')).toContain(`querySelector('link[rel="icon"]')`);
  expect(readFileSync('src/themeFavicon.js', 'utf8')).not.toMatch(/rel="(manifest|apple-touch-icon)"/);
});
