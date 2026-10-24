import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import postcss from 'postcss';
import { SEASONAL_THEMES, validSeasonalTheme } from './seasonalThemes.js';
import { THEME_BASES, personalThemeModel, personalThemeShades } from './personalThemes.js';

// The contract every merged season meets. It runs on each season branch for
// exactly the seasons that branch registers (none on the shared core).
const lab = hex => {
  const linear = hex.slice(1).match(/../g).map(value => { const c = parseInt(value, 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  const [l, m, s] = [[.4122214708, .5363325363, .0514459929], [.2119034982, .6806995451, .1073969566], [.0883024619, .2817188376, .6299787005]]
    .map(row => Math.cbrt(row.reduce((sum, weight, index) => sum + weight * linear[index], 0)));
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
};
// Perceptual (OKLab) distance. Seasons must keep 0.075 from error and warning
// colors; for scale, year-round Terracotta Dark sits 0.03 from the error red.
export const colorDistance = (left, right) => Math.hypot(...lab(left).map((value, index) => value - lab(right)[index]));

const days = ({ start, end }) => {
  const day = value => new Date(2025, Number(value.slice(0, 2)) - 1, Number(value.slice(3))).getTime();
  const length = (day(end) - day(start)) / 864e5;
  return (length < 0 ? length + 365 : length) + 1;
};

it('every registered season satisfies the seasonal contract', () => {
  for (const season of SEASONAL_THEMES) {
    expect(validSeasonalTheme(season), season.id).toBe(true);
    expect(days(season.window), `${season.id} window length`).toBeGreaterThanOrEqual(7);
    expect(days(season.window), `${season.id} window length`).toBeLessThanOrEqual(120);
    expect(existsSync(`docs/seasons/${season.id}.md`), `${season.id} release notes`).toBe(true);
  }
});

describe.each(SEASONAL_THEMES.map(season => [season.name, season]))('%s', (_, season) => {
  const css = readFileSync(`src/seasons/${season.id}.css`, 'utf8');
  const root = postcss.parse(css);
  it('scopes every rule to its own season and decorates both appearances', () => {
    root.walkRules(rule => { for (const selector of rule.selectors) expect(selector, selector).toContain(`[data-season="${season.id}"]`); });
    for (const appearance of ['light', 'dark']) {
      let decorated = false;
      root.walkRules(rule => {
        if (rule.selector.includes(`[data-appearance="${appearance}"]`)) rule.walkDecls('--rook-season-decor', decl => { decorated ||= /^url\("data:image\/svg\+xml,/.test(decl.value); });
      });
      expect(decorated, `${appearance} decoration`).toBe(true);
    }
  });
  it('perches a motif in both appearances or in neither', () => {
    const perched = ['light', 'dark'].map(appearance => {
      let found = false;
      root.walkRules(rule => {
        if (rule.selector.includes(`[data-appearance="${appearance}"]`)) rule.walkDecls('--rook-season-perch', decl => { found ||= /^url\("data:image\/svg\+xml,/.test(decl.value); });
      });
      return found;
    });
    expect(perched[0], 'light and dark perch').toBe(perched[1]);
  });
  it('is static and self-contained: no motion and no network assets', () => {
    root.walkDecls(decl => {
      expect(decl.prop, decl.prop).not.toMatch(/^(animation|transition)/);
      expect(decl.value, decl.prop).not.toMatch(/url\((?!"data:)/);
    });
    expect(css).not.toMatch(/@keyframes|@import/);
  });
  it('never repaints semantic roles, so warnings, success and errors keep their meaning', () => {
    root.walkDecls(decl => expect(decl.prop, decl.prop).toMatch(/^--rook-season-/));
  });
  it('keeps every accent shade visibly apart from error and warning colors', () => {
    for (const shade of personalThemeShades(season.id)) for (const base of THEME_BASES) for (const appearance of ['light', 'dark']) {
      const t = personalThemeModel({ basePalette: season.id, accent: shade.id, base: base.id, appearance }).tokens;
      const label = `${shade.name} ${base.name} ${appearance}`;
      expect(colorDistance(t['--rook-accent-text'], t['--rook-error-text']), `${label} vs error`).toBeGreaterThanOrEqual(.075);
      expect(colorDistance(t['--rook-accent-text'], t['--rook-warning-text']), `${label} vs warning`).toBeGreaterThanOrEqual(.075);
      expect(colorDistance(t['--rook-accent-fill'], t['--rook-disabled-surface']), `${label} fill vs disabled`).toBeGreaterThanOrEqual(.1);
    }
  });
});
