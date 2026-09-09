import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const output = 'artifacts/exercise-search'; await mkdir(output, { recursive: true });
const baseline = Boolean(process.env.ROOK_SEARCH_BASELINE);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [320,390]) for (const style of (baseline ? ['standard'] : ['standard','premium'])) for (const appearance of (baseline ? [width === 320 ? 'dark' : 'light'] : ['dark','light'])) {
    const state = createReturningUserFixture(3); state.activeWorkout = null;
    state.profile.avoid = ''; state.profile.trainingSafety = null;
    for (const day of state.program.days) day.exercises = day.exercises.filter(e => !['pull-up','wg-weighted-pull-up'].includes(e.exerciseId));
    Object.assign(state.profile, { appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, state);
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await openProfileArea(page, 'program'); await page.getByRole('button', { name: /^Edit plan/ }).click();
    const sheet = page.locator('.edit-plan-screen');
    const original = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program);
    await sheet.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).first().click();
    const search = sheet.getByRole('searchbox');
    const options = sheet.locator('.scratch-exercise-results [role="option"]');
    const defaultOrder = await options.allTextContents();
    await search.fill('pull ups');
    const results = await options.allTextContents();
    if (!baseline) assert.equal(results[0].trim(), 'Pull-up');
    console.log(`${width}-${style}-${appearance}: ${results.slice(0,4).join(', ')}`);
    await search.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${width}-${style}-${appearance}-${baseline ? 'before' : 'pull-ups'}.png` });
    if (!baseline) {
      await search.fill('weighted pull ups'); assert.equal((await options.first().innerText()).trim(), 'Weighted Pull-up');
      await page.screenshot({ path: `${output}/${width}-${style}-${appearance}-weighted.png` });
      await sheet.getByRole('button', { name: 'Clear search', exact: true }).click();
      assert.deepEqual(await options.allTextContents(), defaultOrder);
      await search.fill('pull ups'); await options.first().click();
      assert.equal(await sheet.locator('.plan-editor-exercise').filter({ hasText: /^Pull-up/ }).count() > 0, true);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program), original, 'selection only changes local plan draft');
      await sheet.getByRole('button', { name: 'Close edit plan', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program), original);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); await context.close();
  }
} finally { await browser.close(); }
