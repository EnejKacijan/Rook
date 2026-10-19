import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_THEME_PRESETS, THEME_BASES, personalThemeModel, personalThemeShades, themeContrast } from './personalThemes.js';

// Worst-case contrast for every registered family (year-round and seasonal),
// all shades × all tones, Light and Dark. Written to the ignored
// artifacts/theme-contrast.md for review: npm run qa:theme-contrast
const surfaces = ['bg', 'surface', 'surface-elevated', 'surface-muted', 'accent-soft', 'selected'];
const pairs = [
  ['Text', ['text'], surfaces, 4.5],
  ['Secondary', ['secondary'], surfaces, 4.5],
  ['Accent text', ['accent-text'], surfaces, 4.5],
  ['On fill', ['on-accent-fill'], ['accent-fill', 'accent-fill-strong'], 4.5],
  ['Controls', ['control-border', 'focus-ring'], surfaces, 3],
  ['Success', ['success'], ['bg', 'surface', 'success-soft'], 4.5],
  ['Warning', ['warning-text'], ['bg', 'surface', 'warning-surface'], 4.5],
  ['Error', ['error-text'], ['bg', 'surface', 'error-surface'], 4.5],
  ['Disabled', ['disabled-text'], ['disabled-surface'], 4.5],
];

it('meets the contrast budget for every registered family, shade, tone and mode', () => {
  const rows = [], failures = [];
  let checks = 0;
  for (const preset of ALL_THEME_PRESETS) for (const appearance of ['light', 'dark']) {
    const worst = pairs.map(() => Infinity);
    for (const shade of personalThemeShades(preset.id)) for (const base of THEME_BASES) {
      const t = personalThemeModel({ basePalette: preset.id, accent: shade.id, base: base.id, appearance }).tokens;
      pairs.forEach(([label, fgs, bgs, minimum], index) => {
        for (const fg of fgs) for (const bg of bgs) {
          const ratio = themeContrast(t[`--rook-${fg}`], t[`--rook-${bg}`]);
          checks++;
          if (ratio < minimum) failures.push(`${preset.name} ${shade.name} ${base.name} ${appearance}: ${label} ${fg}/${bg} ${ratio.toFixed(2)}`);
          worst[index] = Math.min(worst[index], ratio);
        }
      });
    }
    rows.push(`| ${preset.name} | ${appearance} | ${worst.map(value => value.toFixed(2)).join(' | ')} |`);
  }
  const report = [`| Family | Mode | ${pairs.map(([label, , , minimum]) => `${label} (≥${minimum})`).join(' | ')} |`,
    `|---|---|${pairs.map(() => '---').join('|')}|`, ...rows, '',
    `${checks} contrast checks across ${ALL_THEME_PRESETS.length} families, 5 shades, ${THEME_BASES.length} tones, Light and Dark: ${failures.length} below target.`].join('\n');
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/theme-contrast.md', `${report}\n`);
  expect(failures).toEqual([]);
});
