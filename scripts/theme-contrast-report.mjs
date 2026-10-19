// Prints the worst-case contrast for every supported Personal Theme family
// (all shades × all background tones) in Light and Dark, as a Markdown table.
//   node scripts/theme-contrast-report.mjs
import { THEME_PRESETS, THEME_BASES, personalThemeModel, personalThemeShades, themeContrast } from '../src/personalThemes.js';

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
const rows = [];
let failures = 0, checks = 0;
for (const preset of THEME_PRESETS) for (const appearance of ['light', 'dark']) {
  const worst = pairs.map(() => Infinity);
  for (const shade of personalThemeShades(preset.id)) for (const base of THEME_BASES) {
    const t = personalThemeModel({ basePalette: preset.id, accent: shade.id, base: base.id, appearance }).tokens;
    pairs.forEach(([, fgs, bgs, minimum], index) => {
      for (const fg of fgs) for (const bg of bgs) {
        const ratio = themeContrast(t[`--rook-${fg}`], t[`--rook-${bg}`]);
        checks++; if (ratio < minimum) failures++;
        worst[index] = Math.min(worst[index], ratio);
      }
    });
  }
  rows.push(`| ${preset.name} | ${appearance} | ${worst.map(value => value.toFixed(2)).join(' | ')} |`);
}
console.log(`| Family | Mode | ${pairs.map(([label, , , minimum]) => `${label} (≥${minimum})`).join(' | ')} |`);
console.log(`|---|---|${pairs.map(() => '---').join('|')}|`);
console.log(rows.join('\n'));
console.log(`\n${checks} contrast checks across ${THEME_PRESETS.length} families, 5 shades, ${THEME_BASES.length} tones, Light and Dark: ${failures} below target.`);
if (failures) process.exitCode = 1;
