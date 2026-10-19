import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { THEME_PRESETS, personalThemeModel } from './personalThemes.js';

// A reference to an undefined custom property silently falls back to a
// Light-only literal (or to nothing) and breaks Dark and Personal Themes.
const sources = readdirSync('src').filter(file => /\.(css|jsx?|mjs)$/.test(file) && !/\.test\./.test(file));
const text = Object.fromEntries(sources.map(file => [file, readFileSync(`src/${file}`, 'utf8')]));

function definedTokens() {
  const defined = new Set();
  for (const [file, body] of Object.entries(text)) {
    if (file.endsWith('.css')) postcss.parse(body).walkDecls(decl => { if (decl.prop.startsWith('--rook-')) defined.add(decl.prop); });
    else for (const [, name] of body.matchAll(/['"`](--rook-[\w-]+)['"`]/g)) defined.add(name);
  }
  for (const preset of THEME_PRESETS) for (const appearance of ['light', 'dark'])
    for (const name of Object.keys(personalThemeModel({ basePalette: preset.id, appearance }).tokens)) defined.add(name);
  return defined;
}

it('every referenced --rook token is defined by CSS, the Personal Theme model or runtime code', () => {
  const defined = definedTokens();
  const missing = [];
  for (const [file, body] of Object.entries(text)) for (const [, name] of body.matchAll(/var\((--rook-[\w-]+)/g))
    if (!defined.has(name)) missing.push(`${file}: ${name}`);
  expect([...new Set(missing)]).toEqual([]);
});

it('destructive confirmation fills use the destructive pair, never a text color with fixed white', () => {
  const rule = text['overrides.css'].match(/\.custom-delete-confirm button:last-child \{[^}]*\}/)[0];
  expect(rule).toContain('var(--rook-destructive-fill)');
  expect(rule).toContain('var(--rook-on-destructive)');
});

it('scrims and sheet shadows are theme roles in every appearance', () => {
  expect(text['theme.css']).toContain(':root[data-appearance] :is(.modal-layer, .workout-confirm-layer, .building-overlay) { background: var(--rook-scrim); }');
  expect(text['theme.css']).not.toContain(':root[data-appearance="dark"] :is(.modal-layer, .workout-confirm-layer, .building-overlay) { background: var(--rook-scrim); }');
});
