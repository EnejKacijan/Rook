import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, STORAGE_KEY } from '../src/domain.js';

const phase = process.env.ROOK_SUMMARY_PHASE || 'after';
const root = `artifacts/plan-preview-summary/${phase}`;
await mkdir(root, { recursive: true });
const cases = [
  [390, 'light', 'standard'], [390, 'dark', 'standard'],
  [390, 'light', 'premium'], [390, 'dark', 'premium'],
  [320, 'dark', 'standard'], [320, 'dark', 'premium'],
  [430, 'dark', 'standard'],
  ...(phase === 'after' ? [[320, 'dark', 'standard', 'long']] : []),
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];

function themeName(appearance, style) {
  return `${style}-${appearance}`;
}

async function reachPreview(page, long = false) {
  const next = () => page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
  await page.getByRole('button', { name: 'BUILD MY PLAN', exact: true }).click();
  await page.getByRole('combobox', { name: 'Age range' }).click();
  await page.getByRole('option', { name: '18–29' }).click(); await next();
  await page.getByRole('button', { name: 'Athletic performance', exact: true }).click();
  await page.getByRole('button', { name: /^Beginner/ }).click();
  await page.getByRole('button', { name: long ? '5 days' : '3 days', exact: true }).click();
  const days = page.locator('.schedule-days .day-options .onboarding-option');
  for (const index of long ? [0, 1, 3, 4, 5] : [0, 2, 4]) await days.nth(index).click();
  await page.getByRole('button', { name: '90 min', exact: true }).click(); await next();
  await page.getByRole('button', { name: 'Commercial gym', exact: true }).click(); await next();
  if (long) {
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: 'Hamstrings / glutes', exact: true }).click();
  } else await page.getByRole('button', { name: 'Balanced', exact: true }).click();
  await next();
  await page.getByRole('button', { name: /Balanced starting point/ }).click(); await next();
  await page.getByRole('button', { name: 'BUILD MY PLAN', exact: true }).click();
  await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor({ timeout: 30000 });
}

try {
  for (const [width, appearance, style, variant = 'default'] of cases) {
    const state = blankState();
    Object.assign(state.profile, {
      appearancePreference: appearance,
      stylePreference: style,
      themePreference: style === 'premium' ? 'premium' : appearance,
    });
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: state });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await reachPreview(page, variant === 'long');
    const summary = page.locator('.personalization-summary');
    await summary.scrollIntoViewIfNeeded();
    const metrics = await summary.evaluate(section => {
      const parse = color => {
        const values = color.match(/[\d.]+/g).map(Number);
        return [values[0], values[1], values[2], values[3] ?? 1];
      };
      const blend = (foreground, background) => {
        const [r, g, b, alpha] = parse(foreground);
        const [br, bg, bb] = parse(background);
        return `rgb(${r * alpha + br * (1 - alpha)}, ${g * alpha + bg * (1 - alpha)}, ${b * alpha + bb * (1 - alpha)})`;
      };
      const luminance = color => parse(color).slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
      const tile = section.querySelector('dl > div');
      const parentStyle = getComputedStyle(section);
      const tileStyle = getComputedStyle(tile);
      const labelStyle = getComputedStyle(tile.querySelector('dt'));
      const valueStyle = getComputedStyle(tile.querySelector('dd'));
      const introLabelStyle = getComputedStyle(section.querySelector(':scope > div .eyebrow'));
      const introValueStyle = getComputedStyle(section.querySelector(':scope > div > strong'));
      const pageBackground = getComputedStyle(document.documentElement).backgroundColor;
      const parentBackground = blend(parentStyle.backgroundColor, pageBackground);
      const tileBackground = blend(tileStyle.backgroundColor, parentBackground);
      const tileEdge = blend(tileStyle.borderTopColor, parentBackground);
      return {
        parent: parentBackground,
        parentBorder: parentStyle.borderTopColor,
        tile: tileBackground,
        tileBorder: tileEdge,
        tileBorderWidth: tileStyle.borderTopWidth,
        tileParentContrast: contrast(tileBackground, parentBackground),
        edgeParentContrast: contrast(tileEdge, parentBackground),
        labelContrast: contrast(labelStyle.color, tileBackground),
        valueContrast: contrast(valueStyle.color, tileBackground),
        introLabelContrast: contrast(introLabelStyle.color, parentBackground),
        introValueContrast: contrast(introValueStyle.color, parentBackground),
        tiles: [...section.querySelectorAll('dl > div')].map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, overflow: node.scrollWidth > node.clientWidth })),
      };
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(metrics.tiles.every(tile => !tile.overflow && tile.width > 0 && tile.height > 0), true);
    if (phase === 'after') {
      assert.ok(metrics.labelContrast >= 4.5, `label contrast ${metrics.labelContrast}`);
      assert.ok(metrics.valueContrast >= 4.5, `value contrast ${metrics.valueContrast}`);
      assert.ok(metrics.introLabelContrast >= 4.5, `intro label contrast ${metrics.introLabelContrast}`);
      assert.ok(metrics.introValueContrast >= 4.5, `intro value contrast ${metrics.introValueContrast}`);
    }
    if (phase === 'after' && appearance === 'dark') {
      assert.equal(metrics.tileBorderWidth, '1px');
      assert.ok(metrics.edgeParentContrast >= 1.25, `dark tile edge contrast ${metrics.edgeParentContrast}`);
    }
    const name = `${width}-${themeName(appearance, style)}${variant === 'long' ? '-long' : ''}`;
    await page.screenshot({ path: `${root}/${name}.png`, animations: 'disabled' });
    results.push({ name, ...metrics });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${phase} ${name}: passed`);
  }
  await writeFile(`${root}/computed-styles.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
