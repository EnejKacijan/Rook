import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The inline pre-paint script runs before React. A saved Personal Theme owns
// brightness, so reopening the app must never flash the opposite appearance.
const html = readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const run = ({ profile, personal, systemDark = false }) => {
  localStorage.clear();
  if (profile) localStorage.setItem('lift-v2-state', JSON.stringify({ schemaVersion: 3, profile }));
  if (personal !== undefined) localStorage.setItem('rook.local-review.personal-theme.v1', typeof personal === 'string' ? personal : JSON.stringify(personal));
  window.matchMedia = query => ({ matches: query.includes('dark') && systemDark, media: query });
  new Function(script)();
  return document.documentElement.dataset.appearance;
};
afterEach(() => { localStorage.clear(); for (const key of ['appearance', 'style', 'theme', 'premiumScheme']) delete document.documentElement.dataset[key]; });

it('uses the saved Personal Theme appearance over the legacy profile preference', () => {
  expect(run({ profile: { appearancePreference: 'light', themePreference: 'light' }, personal: { schemaVersion: 2, basePalette: 'ocean', appearance: 'dark', paletteCustomizations: {} } })).toBe('dark');
  expect(run({ profile: { appearancePreference: 'dark', themePreference: 'dark' }, personal: { schemaVersion: 2, basePalette: 'plum', appearance: 'light', paletteCustomizations: {} } })).toBe('light');
});
it('follows the device when the Personal Theme appearance is System', () => {
  const personal = { schemaVersion: 2, basePalette: 'slate', appearance: 'system', paletteCustomizations: {} };
  expect(run({ profile: { appearancePreference: 'light' }, personal, systemDark: true })).toBe('dark');
  expect(run({ profile: { appearancePreference: 'dark' }, personal, systemDark: false })).toBe('light');
});
it('ignores missing, malformed or unknown Personal Theme payloads', () => {
  expect(run({ profile: { appearancePreference: 'dark' } })).toBe('dark');
  expect(run({ profile: { appearancePreference: 'dark' }, personal: '{not json' })).toBe('dark');
  expect(run({ profile: { appearancePreference: 'light' }, personal: { appearance: 'sepia' } })).toBe('light');
});
