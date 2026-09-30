import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4275';
const engine = process.env.ROOK_QA_BROWSER || 'chromium';
const out = 'artifacts/navigation-chevron-polish';
await mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(
  engine === 'webkit' ? { headless: true } : { channel: 'chrome', headless: true },
);
const results = [];
try {
  for (const width of [320, 390, 430]) for (const visualStyle of ['standard', 'premium'])
    for (const appearance of ['light', 'dark']) {
      const trainingStyle = 'plan';
      const state = createReturningUserFixture(1);
      Object.assign(state.profile, { preferredTrainingStyle: trainingStyle,
        stylePreference: visualStyle, appearancePreference: appearance,
        themePreference: visualStyle === 'premium' ? 'premium' : appearance });
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true,
        serviceWorkers: 'block' });
      await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
      try {
        await page.goto(origin);
        const link = page.locator('.today-my-workouts').first();
        await link.waitFor();
        const geometry = await link.evaluate(node => {
          const label = node.querySelector('span').getBoundingClientRect();
          const icon = node.querySelector('svg').getBoundingClientRect();
          const hit = node.getBoundingClientRect();
          return { labelCenter: label.top + label.height / 2, iconCenter: icon.top + icon.height / 2,
            hitHeight: hit.height, iconWidth: icon.width, scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth };
        });
        assert.ok(Math.abs(geometry.labelCenter - geometry.iconCenter) < 2,
          `inline text and chevron center: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.hitHeight >= 44 && geometry.iconWidth >= 14);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth);
        if (width === 390) {
          await link.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${out}/${engine}-${trainingStyle}-${visualStyle}-${appearance}.png` });
        }
        await link.click();
        await page.getByText('Saved workouts', { exact: true }).first().waitFor();
        assert.deepEqual(errors, []);
        results.push({ width, visualStyle, appearance, trainingStyle, geometry, passed: true });
      } finally { await context.close(); }
    }
} finally {
  await writeFile(`${out}/${engine}-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`${engine}: ${results.length} Today My workouts chevron cases passed`);
