import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { buildProgram, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/profile-logging/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
function ensureWorkoutToday(state) {
  const today = weekday(); const scheduled = state.program.days.find(day => day.weekday === today); if (scheduled) return;
  const day = state.program.days[0]; const replaced = day.weekday; day.weekday = today; state.profile.availableDays = state.profile.availableDays.map(value => value === replaced ? today : value); state.program.rotationStartDate = null;
}

async function openState(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  return { context, page, errors };
}

async function profileText(page) {
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  const text = await page.locator('.profile-screen').innerText();
  assert.equal(await page.getByRole('heading', { name: 'Training setup', level: 1 }).count(), 1, 'Profile keeps a stable page heading');
  assert.equal(await page.getByText('CURRENT PROGRAM', { exact: true }).count(), 1, 'active program identity is explicit');
  assert.doesNotMatch(text, /null min|undefined|\bnull\b|Not provided/i, 'Profile never exposes raw missing values');
  assert.equal(await page.getByRole('button', { name: 'IMPORT PLAN FROM NOTES' }).count(), 0, 'import is not a permanent large CTA');
  assert.equal(await page.getByRole('button', { name: 'REBUILD PROGRAM' }).count(), 0, 'rebuild is not a permanent large CTA');
  return text;
}

const complete = createReturningUserFixture(2);
complete.profile = { ...complete.profile, name: 'Alex', ageRange: '30–39', sex: 'Prefer not to say', restTimerEnabled: true, restTimerAutoStart: true };
ensureWorkoutToday(complete);
{
  const { context, page, errors } = await openState(complete);
  const text = await profileText(page);
  assert.match(text, /ABOUT YOU[\s\S]*Alex[\s\S]*30–39/);
  assert.doesNotMatch(text, /COMPLETE YOUR PROFILE/);
  await page.getByRole('button', { name: /ASK COACH TO ADJUST/i }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Ask Coach' }).inputValue(), 'I want to adjust my current training plan.');
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Profile has no horizontal overflow at ${width}px`);
    await page.screenshot({ path: output(`${width}-profile-personalized.png`) });
  }
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 844 }); await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(40);
    const logout = await page.getByRole('button', { name: 'LOG OUT' }).boundingBox(); const navigation = await page.locator('.bottom-nav').boundingBox(); const gap = navigation.y - (logout.y + logout.height);
    assert.ok(gap >= 10 && gap <= 14, `Profile keeps a compact safe gap above navigation at ${width}px: ${gap}`);
    await page.screenshot({ path: output(`${width}-profile-bottom-spacing.png`), fullPage: false });
  }
  await page.getByRole('button', { name: 'REPLACE PLAN' }).click();
  await page.getByRole('button', { name: /Import from Notes/ }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /Logging & increments/ }).click();
  assert.equal(await page.getByRole('switch', { name: 'Rest timer' }).isChecked(), true);
  assert.equal(await page.getByRole('switch', { name: 'Auto-start after completed set' }).isChecked(), true);
  const restDuration = page.getByRole('combobox', { name: 'Rest duration' });
  assert.equal(await restDuration.inputValue(), '', 'existing behavior remains By exercise by default');
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 620 });
    await page.screenshot({ path: output(`${width}-logging.png`) });
  }
  await restDuration.selectOption('120');
  assert.equal(await restDuration.inputValue(), '120');
  await page.screenshot({ path: output('390-logging-fixed-rest.png'), fullPage: false });
  const barbell = page.getByRole('spinbutton', { name: 'Barbell increment' });
  await barbell.fill('5'); await barbell.blur();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Barbell increment"]')?.value === '11.02');
  assert.equal(await barbell.inputValue(), '11.02', 'unit display converts without changing canonical kg value');
  await page.getByRole('button', { name: 'kg', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Barbell increment"]')?.value === '5');
  assert.equal(await barbell.inputValue(), '5');
  await barbell.fill('0'); await barbell.blur(); assert.equal(await barbell.inputValue(), '5', 'non-positive increment is rejected');
  await page.locator('.setting-switch').filter({ hasText: 'Auto-start after completed set' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'TODAY', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await page.locator('.rest-timer.rest-ready').waitFor();
  assert.equal(await page.locator('.rest-timer.rest-ready strong').textContent(), '2:00', 'fixed rest duration overrides the exercise prescription');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.rest.seconds), 120, 'fixed rest duration persists into workout timer state');
  await page.getByRole('button', { name: 'START', exact: true }).click();
  await page.getByRole('button', { name: 'SKIP', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

const partial = createReturningUserFixture(1);
partial.profile = { ...partial.profile, name: '', ageRange: null, sex: null, sessionMinutes: null };
partial.program = buildProgram(partial.profile);
{
  const { context, page, errors } = await openState(partial);
  const text = await profileText(page);
  assert.match(text, /COMPLETE YOUR PROFILE[\s\S]*Add a few details/);
  assert.equal(await page.locator('.complete-profile').evaluate(element => getComputedStyle(element).borderLeftWidth), '2px', 'unfinished profile callout has a subtle accent');
  assert.doesNotMatch(text, /Session length/);
  await page.screenshot({ path: output('390-profile-incomplete.png'), fullPage: false });
  await page.getByRole('button', { name: /Add a few details/ }).click();
  await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

for (const importedExtra of [false, true]) {
  const state = createReturningUserFixture(1);
  state.program.source = 'ai-import'; state.program.name = 'Weekly Workout Plan: Build Muscle, 4 days/week';
  state.profile = { ...state.profile, name: importedExtra ? 'Mina' : '', ageRange: importedExtra ? '18–29' : null, sex: null, sessionMinutes: null };
  const { context, page, errors } = await openState(state);
  const text = await profileText(page);
  assert.match(text, /Imported plan[\s\S]*4 days\/week/);
  assert.equal(await page.getByRole('heading', { name: 'Imported plan', level: 2 }).count(), 1, 'imported plan is presented as the current program, not the page title');
  assert.doesNotMatch(text, /Weekly Workout Plan|4 days\/week · 4 days/);
  await page.screenshot({ path: output(`390-profile-imported-${importedExtra ? 'with-details' : 'incomplete'}.png`), fullPage: false });
  await page.getByRole('button', { name: 'REPLACE PLAN' }).click();
  await page.getByRole('button', { name: /Import a different plan/ }).waitFor();
  await page.getByRole('button', { name: /Build a personalized plan/ }).click();
  assert.match(await page.getByRole('dialog').innerText(), /Workout history will remain/);
  assert.deepEqual(errors, []);
  await context.close();
}

for (const environment of ['Commercial gym', 'Home gym']) {
  const state = createReturningUserFixture(1);
  state.profile.environment = environment;
  state.profile.equipment = environment === 'Commercial gym' ? ['full gym'] : ['dumbbells', 'resistance bands'];
  state.program = buildProgram(state.profile);
  const { context, page, errors } = await openState(state);
  const text = await profileText(page);
  assert.match(text, new RegExp(environment));
  assert.match(text, environment === 'Commercial gym' ? /Full gym/ : /Dumbbells, Resistance bands/i);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = createReturningUserFixture(1); state.profile.restTimerEnabled = false; state.profile.restTimerAutoStart = false;
  ensureWorkoutToday(state);
  const { context, page, errors } = await openState(state);
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  assert.equal(await page.locator('.rest-timer').count(), 0, 'timer UI stays hidden when disabled');
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log('Profile/Logging QA passed: clean profile states, contextual plan actions, compact responsive screenshots, validated increments, unit conversion, and real rest-timer settings.');
