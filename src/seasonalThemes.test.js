import { describe, expect, it } from 'vitest';
import { availableSeasonalThemes, createSeasonalRegistry, seasonalThemeInWindow, seasonalWindowLabel, validSeasonalTheme } from './seasonalThemes.js';

const shades = id => [
  { id, name: 'Main', light: '#1f6aa1', dark: '#7ab8ee' },
  { id: `${id}-two`, name: 'Two', light: '#476a86', dark: '#9ebfd8' },
  { id: `${id}-three`, name: 'Three', light: '#136d72', dark: '#6dcac4' },
  { id: `${id}-four`, name: 'Four', light: '#1f4f78', dark: '#5f97c8' },
  { id: `${id}-five`, name: 'Five', light: '#1170b0', dark: '#66c6fa' },
];
const season = (id, start, end, extra = {}) => ({ id, name: id, description: 'Test · season', window: { start, end }, base: 'cool',
  surfaces: { light: ['#f1f5f9', '#fbfdff', '#e3ebf3'], dark: ['#0c131a', '#152029', '#1e2b37'] }, shades: shades(id), ...extra });

describe('Seasonal registry', () => {
  it('accepts a complete season and rejects malformed ones', () => {
    expect(validSeasonalTheme(season('frost', '01-05', '02-10'))).toBe(true);
    for (const broken of [null, season('Bad Id', '01-01', '01-02'), season('frost', '13-01', '01-02'), season('frost', '01-01', '1-2'),
      season('frost', '01-01', '01-02', { base: 'sepia' }), season('frost', '01-01', '01-02', { surfaces: { light: ['#fff'], dark: [] } }),
      season('frost', '01-01', '01-02', { shades: shades('frost').slice(1) }), season('frost', '01-01', '01-02', { shades: shades('other') }),
      season('frost', '01-01', '01-02', { shades: shades('frost').map((item, i) => i ? item : { ...item, light: 'red' }) })])
      expect(validSeasonalTheme(broken)).toBe(false);
  });
  it('orders by calendar start, drops duplicates and invalid entries, and freezes data', () => {
    const registry = createSeasonalRegistry([season('late', '11-01', '11-30'), season('early', '02-01', '02-20'), season('late', '01-01', '01-02'), { id: 'x' }]);
    expect(registry.map(item => item.id)).toEqual(['early', 'late']);
    expect(registry[1].window.start).toBe('11-01');
    expect(Object.isFrozen(registry[0]) && Object.isFrozen(registry[0].shades[0]) && Object.isFrozen(registry[0].surfaces.dark)).toBe(true);
    expect(registry[0]).toMatchObject({ seasonal: true, accent: 'early' });
  });
  it('treats windows as inclusive local dates, including ones that wrap the year', () => {
    const autumn = season('autumn', '10-01', '11-02'), turn = season('turn', '12-28', '01-07');
    const at = (month, day) => new Date(2026, month - 1, day, 12);
    expect([at(9, 30), at(10, 1), at(11, 2), at(11, 3)].map(date => seasonalThemeInWindow(autumn, date))).toEqual([false, true, true, false]);
    expect([at(12, 27), at(12, 28), at(1, 1), at(1, 7), at(1, 8)].map(date => seasonalThemeInWindow(turn, date))).toEqual([false, true, true, true, false]);
  });
  it('offers seasons in their window and keeps the saved one listed after it ends', () => {
    const registry = createSeasonalRegistry([season('autumn', '10-01', '11-02'), season('spring', '03-20', '05-31')]);
    const november = new Date(2026, 10, 20);
    expect(availableSeasonalThemes('forest', new Date(2026, 9, 19), registry, false).map(item => item.id)).toEqual(['autumn']);
    expect(availableSeasonalThemes('forest', november, registry, false)).toEqual([]);
    expect(availableSeasonalThemes('autumn', november, registry, false).map(item => item.id)).toEqual(['autumn']);
    expect(availableSeasonalThemes('forest', november, registry, true).map(item => item.id)).toEqual(['spring', 'autumn']);
    // Review mode orders by what is current, then what starts next.
    expect(availableSeasonalThemes('forest', new Date(2026, 9, 19), registry, true).map(item => item.id)).toEqual(['autumn', 'spring']);
  });
  it('labels windows in short English month form', () => {
    expect(seasonalWindowLabel(season('turn', '12-28', '01-07'))).toBe('Dec 28 – Jan 7');
  });
});

it('limits seasonal decoration to the four main tabs and hides it in forced colors', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/personalThemeApp.css', 'utf8');
  expect(css).toContain(':root[data-season] :is(.today-screen, .progress-screen, .profile-screen, .coach-screen) {\n  background-image: var(--rook-season-decor, none);');
  expect(css).toContain('background-position: right 0 top env(safe-area-inset-top, 0px);');
  const { default: postcss } = await import('postcss');
  postcss.parse(css).walkRules(rule => { if (rule.selector.includes('data-season')) expect(rule.selector).not.toMatch(/workout|sheet|modal/); });
  expect(css).toMatch(/@media \(forced-colors: active\) \{\s*:root\[data-season\][^{]*\{ background-image: none; \}/);
});
