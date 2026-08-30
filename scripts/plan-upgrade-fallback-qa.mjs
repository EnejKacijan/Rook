import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const state = createReturningUserFixture(0);
state.program.source = 'local-rules';
state.workouts = [];
state.activeWorkout = null;
state.weekScheduleOverrides = {};
state.ai = { ...state.ai, planUpgradeDismissed: false };

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
const page = await context.newPage();
let providerPlanCalls = 0;

await page.route('**/api/ai/status', async route => {
  await new Promise(resolve => setTimeout(resolve, 4000));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) });
});
await page.route('**/api/expert-lab/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, feedbackCount: 0 }) }));
await page.route('**/api/ai', route => {
  providerPlanCalls += 1;
  return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Provider must not be used for stored-plan upgrades.' }) });
});

await page.goto(`http://127.0.0.1:4173/?plan-upgrade-fallback=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor({ timeout: 2000 });
assert.equal(providerPlanCalls, 0, 'stored-plan upgrade does not call the provider plan endpoint');

await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
await page.getByText('YOUR PLAN IS READY', { exact: true }).waitFor();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
assert.equal(stored.ai.lastPlanSource, 'personalized-template');
assert.equal(stored.program.source, 'fixed-template');
assert.equal(stored.program.days.length, stored.profile.daysPerWeek);

await context.close();
await browser.close();
console.log('Plan-upgrade fallback QA passed: preview is immediate while AI status is delayed, provider generation is unused, and acceptance persists the verified local plan.');
