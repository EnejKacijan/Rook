import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = 'artifacts/account-sync-profile';
await mkdir(out, { recursive: true });
try {
  for (const width of [320, 390, 430]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
    const source = createReturningUserFixture(2);
    Object.assign(source.profile, { stylePreference: style, appearancePreference: appearance, themePreference: style === 'premium' ? 'premium' : appearance });
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), source);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
    await page.goto('http://127.0.0.1:4273/');
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Account and sync' });
    await panel.waitFor();
    assert.match(await panel.textContent(), /Cloud backup is not available yet/);
    assert.doesNotMatch(await panel.textContent(), /\bSynced\b/);
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${width} ${style} ${appearance}: panel fits`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/${width}-${style}-${appearance}.png`, fullPage: true });
    console.log(`PASS ${width} ${style} ${appearance}`);
    await context.close();
  }
} finally { await browser.close(); }
