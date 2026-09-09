import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { addPlanVersion, normalizePlanHistoryState } from '../src/planHistory.js';

const root = new URL('../artifacts/plan-history-grouping/', import.meta.url);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
for (const width of [320, 390]) for (const many of [false, true]) {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  state.profile.appearancePreference = width === 320 ? 'dark' : 'light';
  state.profile.stylePreference = 'standard';
  state.profile.themePreference = state.profile.appearancePreference;
  state.planVersions = [];
  state.program.createdAt = '2026-09-07T10:00:00Z';
  state.program.days[0].exercises[0].sets[0].weight = 100;
  normalizePlanHistoryState(state, state.program.createdAt);
  for (let i = 1; i <= (many ? 7 : 2); i++) {
    const previousProgram = structuredClone(state.program);
    state.program.days[0].exercises[0].sets[0].weight = 100 + i * .5;
    addPlanVersion(state, { previousProgram, source: 'ROOK plan update', timestamp: `2026-09-07T10:0${i}:00Z`, id: `micro-${i}` });
  }
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  const page = await context.newPage();
  await page.route('**/api/ai/status', route => route.fulfill({ json: { available: false } }));
  await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^profile$/i }).click();
  await openProfileArea(page, 'program'); await page.getByRole('button', { name: /Plan history/ }).click();
  await page.getByRole('heading', { name: 'Plan versions' }).waitFor();
  const capture = async suffix => {
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-${suffix}.png`, root)) });
  };
  await capture(many ? 'collapsed' : 'normal-three');
  assert.equal(await page.locator('.plan-history-list .plan-history-version:visible').count(), 3);
  if (many) {
    await page.getByRole('button', { name: /6 training-target refinements/ }).click();
    await capture('expanded');
    assert.equal(await page.locator('.plan-history-list .plan-history-version:visible').count(), 9);
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    for (let i = 0; i < 6; i++) {
      await page.locator('.plan-history-group .rook-disclosure button').nth(i).click();
      await page.getByRole('button', { name: 'RESTORE THIS VERSION', exact: true }).waitFor();
      await page.locator('.plan-version-detail').getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('heading', { name: 'Plan versions' }).waitFor();
    }
    await page.locator('.plan-history-group .rook-disclosure button').first().click();
    await page.getByRole('button', { name: 'RESTORE THIS VERSION', exact: true }).click();
    await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).planVersions), savedBefore.planVersions);
    await page.getByRole('button', { name: 'RESTORE THIS VERSION', exact: true }).click();
    await page.getByRole('button', { name: 'RESTORE VERSION', exact: true }).click();
    await page.getByText(/Previous version restored/).waitFor();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(after.planVersions.length, savedBefore.planVersions.length + 1);
    assert.deepEqual(after.history, savedBefore.history);
    assert.deepEqual(after.planVersions.slice(0, -1), savedBefore.planVersions);
  }
  await context.close();
}
console.log('PASS: 320/390 normal, collapsed, expanded; all six restore points inspectable; cancel unchanged; restore preserves versions and workout history.');
} finally { await browser.close(); }
