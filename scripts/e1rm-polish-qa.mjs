import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const out = new URL('../artifacts/e1rm-polish/', import.meta.url);
await mkdir(out, { recursive: true });
const phase = process.argv[2] || 'after';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const appearance of ['light', 'dark']) for (const style of ['standard', 'premium']) for (const kind of ['flat', 'one', 'many', 'ineligible', 'changing', 'four', 'lb']) {
  const width = ['many', 'four'].includes(kind) ? 320 : kind === 'changing' ? 430 : 390;
  const state = createReturningUserFixture(2); state.activeWorkout = null;
  Object.assign(state.profile, { appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
  if (kind === 'lb') state.profile.units = 'lb';
  state.workouts = Array.from({ length: kind === 'many' ? 8 : kind === 'four' ? 4 : kind === 'one' ? 1 : 2 }, (_, i) => {
    const date = `2026-08-${String(10 + i * 2).padStart(2, '0')}`;
    return { id: `chart-${i}`, name: 'Upper', status: 'completed', completedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T18:00:00.000Z`, canonicalPlanDate: date, workoutDateKey: date,
      exercises: [{ id: `bench-${i}`, exerciseId: 'barbell-bench-press', repMin: 6, repMax: 8, targetRir: 1, sets: [{ id: `set-${i}`, weight: ['many', 'four', 'changing'].includes(kind) ? [70, 72.5, 70, 75, 77.5, 75, 80, 82.5][i] : 70, reps: kind === 'ineligible' ? 20 : 6, rir: 1, completed: true, planned: true }] }] };
  });
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/ai/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'PROGRESS', exact: true }).click();
  await page.getByRole('button', { name: /Bench Press/ }).last().click();
  await page.locator('.exercise-performance-insights').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (phase === 'after') {
    if (kind === 'flat' || kind === 'many') {
      assert.equal(await page.locator('.exercise-e1rm-trend circle').count(), state.workouts.length);
      assert.ok((await page.locator('.exercise-e1rm-trend').innerText()).includes('Aug'));
    }
    if (kind === 'flat') assert.match(await page.locator('.exercise-e1rm-trend').innerText(), /unchanged/i);
    if (kind === 'one') assert.match(await page.locator('.exercise-e1rm-trend').innerText(), /baseline/i);
    if (kind === 'ineligible') assert.equal(await page.locator('.exercise-e1rm-trend svg').count(), 0);
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${phase}-${width}-${style}-${appearance}-${kind}.png`, out)) });
  if (phase === 'after' && kind !== 'ineligible') {
    const point = page.locator('.exercise-e1rm-trend g[role="button"]').last();
    await point.focus();
    assert.match(await page.locator('.e1rm-summary').innerText(), /Aug.*Estimated 1RM/);
    await point.press('Escape');
    assert.doesNotMatch(await page.locator('.e1rm-summary').innerText(), /Estimated 1RM/);
    await point.click();
    assert.match(await page.locator('.e1rm-summary').innerText(), /Estimated 1RM/);
    const labels = await page.locator('.e1rm-date').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
    for (let i = 1; i < labels.length; i++) assert.ok(labels[i].left > labels[i - 1].right, 'date labels do not overlap');
    if (kind === 'lb') assert.match(await page.locator('.e1rm-summary').innerText(), /lb/);
  }
  assert.deepEqual(errors, []); await context.close();
}
await browser.close();
console.log(`${phase}: 28 chart theme/data states passed.`);
