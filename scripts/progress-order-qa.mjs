import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const out = new URL('../artifacts/progress-order/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const width of [320, 390, 430]) for (const appearance of ['light', 'dark']) for (const style of ['standard', 'premium']) for (const mature of [false, true]) {
  const state = createReturningUserFixture(4);
  state.activeWorkout = null;
  Object.assign(state.profile, { appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
  if (!mature) state.workouts = state.workouts.slice(-1);
  else {
    state.profile.goal = 'Lose fat'; state.profile.ageRange = '18–29'; state.program.goal = 'Lose fat'; state.program.goalAtCreation = 'lose_fat'; state.weightTrackingEnabled = true;
    state.weightCheckins = Array.from({ length: 15 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - (14 - i) * 2);
      return { id: `trend-${i}`, localDate: date.toISOString().slice(0, 10), weightKg: 83.4 - i * .08, createdAt: date.toISOString(), updatedAt: date.toISOString() };
    });
  }
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage();
  await page.route('**/api/ai/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'PROGRESS', exact: true }).click();
  await page.waitForTimeout(300);
  const order = await page.locator('.progress-screen > section').evaluateAll(nodes => nodes.slice(0, 4).map(n => n.className));
  assert.deepEqual(order, ['weekly-review-section', 'goal-progress-section', 'progression-overview', 'workout-photo-entry-section']);
  assert.equal(await page.locator('.progress-lede + .weekly-review-section').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const unchanged = await page.evaluate(() => {
    const selectors = ['.weekly-review-section', '.weekly-review-card', '.consistency strong', '.goal-progress-section', '.progression-overview'];
    const measure = () => selectors.map(s => { const el = document.querySelector(s), c = getComputedStyle(el), r = el.getBoundingClientRect(); return [el.textContent, r.width, r.height, c.fontSize, c.color, c.backgroundColor, c.borderRadius, c.padding, c.margin]; });
    const after = measure(); const weekly = document.querySelector('.weekly-review-section');
    document.querySelector('.progression-overview').after(weekly);
    const before = measure(); document.querySelector('.progress-lede').after(weekly);
    return JSON.stringify(after) === JSON.stringify(before);
  });
  assert.equal(unchanged, true, 'only section order changes, not content, type, size or spacing');
  if (mature) assert.match(await page.locator('.weight-trend-summary').innerText(), /kg over/, 'mature goal has real trend data');
  const name = `${width}-${style}-${appearance}-${mature ? 'mature' : 'baseline'}`;
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)), fullPage: true });
  await context.close();
}
await browser.close();
console.log('Progress order QA passed: 24 baseline/mature × width × theme cases; unchanged content, card geometry and typography.');
