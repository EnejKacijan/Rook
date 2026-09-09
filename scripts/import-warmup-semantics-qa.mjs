import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { AIService } from '../src/aiService.js';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, isoDay, blankState } from '../src/domain.js';
const notes = `Monday: Legs
Warm-up
hitre hoje 1 × 300 sec
3–5 min lahkega teka
Shuttle Run 5 × 5
Warm-up movement 2 × 1
60–70 % hitrosti
Figure-8 Run 5m
Lateral Shuffle
Workout
Leg Press 3x9 130kg`;
const expected = ['5 min', '3–5 min', '5 × 5', '2 × 1', '', '5 m', ''];
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let passed = 0;
try {
 for (const width of [320, 390]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
  const state = createReturningUserFixture(1);
  state.program = (await AIService.importTrainingPlan(state.profile, notes)).program;
  state.selectedDate = isoDay();
  Object.assign(state.profile, { stylePreference: style, appearancePreference: appearance, themePreference: style === 'premium' ? 'premium' : appearance, recommendedWarmupsEnabled: true });
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  const history = JSON.stringify(state.workouts);
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, state);
  const page = await context.newPage();
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
  await page.locator('.workout-warmup-toggle').click();
  const rows = page.locator('.warmup-checklist-section').first().locator('.warmup-check-row');
  assert.equal(await rows.count(), 7);
  assert.deepEqual(await rows.evaluateAll(rs => rs.map(r => r.querySelector('strong')?.textContent || '')), expected);
  assert.ok(!(await page.locator('.workout-warmup').innerText()).includes('1 min'));
  await page.screenshot({ path: `${out}/import-warmup-${width}-${style}-${appearance}.png`, fullPage: true });
  for (let i = 0; i < 7; i++) {
   await rows.nth(i).click();
   await page.waitForFunction(index => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.warmup.stages[0].general[index].completed, i);
  }
  await page.reload();
  if (await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).count()) await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.ok(persisted.activeWorkout.warmup.stages[0].general.every(i => i.completed));
  assert.equal(JSON.stringify(persisted.workouts), history);
  assert.deepEqual(persisted.activeWorkout.warmup.general.map(i => i.prescriptionText), expected);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await context.close(); passed++;
  console.log(`PASS ${width} ${style} ${appearance}: source summaries, non-timed completion, reload, history isolation`);
 }
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
 await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, blankState());
 const page = await context.newPage();
 await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
 await page.goto('http://127.0.0.1:4173');
 await page.locator('.existing-plan-action').click();
 await page.getByPlaceholder(/Paste your workout notes/).fill(notes);
 await page.getByRole('button', { name: 'CREATE PREVIEW', exact: true }).click();
 await page.getByRole('heading', { name: 'Review your plan', exact: true }).waitFor();
 assert.equal(await page.locator('.import-resolution').count(), 0, 'missing warm-up duration is not a blocker');
 await page.screenshot({ path: `${out}/import-warmup-review-390.png`, fullPage: true });
 await page.getByRole('button', { name: 'USE THIS PLAN', exact: true }).click();
 await page.locator('.bottom-nav').waitFor();
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.equal(saved.program.days[0].warmupPlan.items.length, 7);
 assert.equal(saved.program.days[0].warmupPlan.items[6].minutes, null);
 assert.equal(saved.program.days[0].warmupPlan.items[1].prescriptionText, '3–5 min');
 await context.close(); passed++;
 console.log('PASS import entry → review → apply: no artificial duration blocker, seven prescriptions persisted');
} finally { await browser.close(); }
console.log(`${passed} passed / 0 failed`);
