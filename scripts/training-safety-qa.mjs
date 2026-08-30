import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/training-safety/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));

function blockedState() {
  const state = blankState();
  state.profile = {
    ...state.profile,
    goal: 'Build muscle',
    experience: 'Intermediate',
    daysPerWeek: 3,
    availableDays: [weekday(), 'Wed', 'Fri'].filter((value, index, values) => values.indexOf(value) === index),
    sessionMinutes: 60,
    environment: 'Commercial gym',
    equipment: ['full gym'],
    priorities: ['Balanced'],
    onboardingComplete: true,
  };
  while (state.profile.availableDays.length < 3) state.profile.availableDays.push(['Mon', 'Tue', 'Thu', 'Sat'].find(day => !state.profile.availableDays.includes(day)));
  state.program = buildProgram(state.profile);
  state.profile.avoid = 'I had knee surgery recently.';
  state.selectedDay = weekday();
  state.selectedDate = isoDay();
  return state;
}

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), blockedState());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByText('TRAINING PAUSED', { exact: true }).waitFor();
assert.equal(await page.getByRole('button', { name: 'START WORKOUT' }).count(), 0);
assert.equal(await page.getByRole('button', { name: 'REVIEW RESTRICTIONS' }).count(), 1);
await page.screenshot({ path: output('390-training-paused.png'), fullPage: false });

await page.getByRole('button', { name: 'REVIEW RESTRICTIONS' }).click();
assert.equal(await page.getByRole('heading', { name: 'Apply only clear limits.' }).count(), 1);
assert.match(await page.locator('.training-safety-summary').last().textContent(), /restriction needs a clear training scope/i);
await page.screenshot({ path: output('390-restriction-review.png'), fullPage: false });

const field = page.getByRole('textbox', { name: 'Restrictions or clinician limits' });
await field.fill('Post-op knee; surgeon cleared upper-body strength training only.');
assert.match(await page.locator('.training-safety-summary').last().textContent(), /CONFIRM LIMIT.*Upper-body strength training only.*does not determine medical clearance/i);
await page.screenshot({ path: output('390-confirm-limit.png'), fullPage: false });
await page.getByRole('button', { name: 'CONFIRM LIMIT' }).click();
assert.match(await page.locator('.training-safety-summary').last().textContent(), /RESTRICTIONS APPLIED.*Upper-body strength training only/i);
await page.screenshot({ path: output('390-confirmed-clinician-scope.png'), fullPage: false });
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log('Training safety QA passed: unresolved surgery blocks Start, restriction review explains the boundary, and clinician scope requires semantic confirmation.');
