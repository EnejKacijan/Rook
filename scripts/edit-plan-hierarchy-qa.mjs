import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const artifactRoot = new URL('../artifacts/edit-plan-hierarchy/', import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, artifactRoot));

for (const testCase of [
  { theme: 'light', width: 320, height: 568 },
  { theme: 'dark', width: 390, height: 700 },
  { theme: 'premium', width: 390, height: 844 },
]) {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  state.profile.themePreference = testCase.theme;
  state.program.includeRecommendedWarmups = true;
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.height },
    colorScheme: testCase.theme === 'light' ? 'light' : 'dark',
    serviceWorkers: 'block',
  });
  await context.addInitScript(value => {
    localStorage.setItem('lift-v2-state', JSON.stringify(value));
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/ai/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: false }),
  }));
  await page.goto(`http://127.0.0.1:4173/?edit-plan-hierarchy=${testCase.theme}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  await page.getByRole('button', { name: /Edit plan/ }).click();
  await page.getByRole('heading', { name: 'Edit your plan' }).waitFor();

  const firstDay = page.locator('.plan-edit-day-section').first();
  assert.equal(
    await firstDay.locator('.plan-workout-reorder-bar + .workout-name-fields').count(),
    1,
    `${testCase.theme}: workout drag row is separate from and directly precedes the name field`,
  );
  assert.equal(
    await firstDay.locator('.workout-name-fields [data-reorder-kind]').count(),
    0,
    `${testCase.theme}: editable workout fields never become drag surfaces`,
  );
  const dragHeight = await firstDay.locator('.plan-workout-drag-surface').evaluate(
    node => node.getBoundingClientRect().height,
  );
  assert.ok(dragHeight >= 44, `${testCase.theme}: workout drag row keeps a 44px touch target`);

  const warmup = firstDay.locator('.plan-warmup-card');
  assert.equal(await warmup.count(), 1, `${testCase.theme}: each day has one warm-up summary`);
  assert.equal(
    await warmup.locator('.plan-warmup-card-header strong').innerText(),
    'Recommended warm-up',
  );
  assert.doesNotMatch(
    await warmup.locator('.plan-warmup-card-header em').innerText(),
    /(^|· )0 /,
    `${testCase.theme}: compact metadata omits empty warm-up categories`,
  );
  const warmupBackground = await warmup.evaluate(node => getComputedStyle(node).backgroundColor);
  assert.equal(
    warmupBackground,
    'rgba(0, 0, 0, 0)',
    `${testCase.theme}: warm-up summary is a lightweight row rather than another card`,
  );

  await warmup.getByRole('button', { name: 'EDIT', exact: true }).click();
  assert.equal(
    await warmup.locator('.plan-warmup-editor-group').count(),
    2,
    `${testCase.theme}: warm-up editor separates general preparation and ramp-up`,
  );
  assert.equal(
    await warmup.getByText('GENERAL PREPARATION', { exact: true }).count(),
    1,
  );
  assert.equal(await warmup.getByText('RAMP-UP', { exact: true }).count(), 1);
  const movementInput = warmup.locator('.plan-warmup-item > input').first();
  await movementInput.fill('Custom mobility flow');
  assert.equal(
    await warmup.locator('.plan-warmup-card-header strong').innerText(),
    'Custom warm-up',
    `${testCase.theme}: editing generated content changes its provenance label`,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    `${testCase.theme}: narrow editor has no horizontal overflow`,
  );
  await warmup.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: output(`${testCase.width}-${testCase.theme}-warmup-expanded.png`),
    fullPage: false,
  });

  await warmup.getByRole('button', { name: 'DONE', exact: true }).click();
  assert.equal(await warmup.locator('.plan-warmup-editor').count(), 0);
  await warmup.getByRole('button', { name: 'EDIT', exact: true }).click();
  await warmup.getByRole('button', { name: 'RESTORE RECOMMENDED', exact: true }).click();
  assert.equal(
    await warmup.locator('.plan-warmup-card-header strong').innerText(),
    'Recommended warm-up',
    `${testCase.theme}: restore returns the warm-up to generated status`,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log('Edit plan hierarchy QA passed: day reordering, compact warm-up hierarchy, provenance labels, themes, narrow widths, and short viewports are correct.');
