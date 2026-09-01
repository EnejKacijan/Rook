import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { WEEKDAYS, currentWeekSchedule, isoDay, weekday } from '../src/domain.js';
import { createReturningUserFixture } from '../src/demoFixture.js';

const target = new URL('../artifacts/post-generation/', import.meta.url); await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const fullWeekday = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
  await page.goto(`http://127.0.0.1:4173/?post-generation=${Date.now()}`, { waitUntil: 'networkidle' }); return { context, page, errors };
}

async function buildFirstPlan(page, days, priorities = ['Balanced']) {
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click(); await page.getByRole('combobox', { name: 'Age range' }).click(); await page.getByRole('option', { name: '18–29' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Build muscle' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); await page.getByRole('button', { name: /^Beginner/ }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: `${days.length} days` }).click(); for (const day of days) await page.locator('.day-options').getByRole('button', { name: fullWeekday[day], exact: true }).click(); await page.getByRole('button', { name: '45 min' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Commercial gym' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); for (const priority of priorities) await page.locator('.option-list').getByRole('button', { name: priority, exact: true }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: /Balanced starting point/ }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); await page.getByRole('button', { name: 'BUILD MY PLAN' }).click(); await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor(); await page.getByRole('button', { name: 'USE THIS PLAN' }).click(); await page.getByText('YOUR PLAN IS READY', { exact: true }).waitFor();
}

const today = weekday(); const todayIndex = WEEKDAYS.indexOf(today); const later = offset => WEEKDAYS[(todayIndex + offset) % 7];

{
  const { context, page, errors } = await freshPage(); await buildFirstPlan(page, [today, later(3)], ['Chest', 'Back']);
  assert.equal(await page.getByRole('button', { name: 'TODAY', exact: true }).getAttribute('aria-current'), 'page'); assert.equal(await page.getByText('Today’s workout is ready below.', { exact: true }).count(), 1); assert.equal(await page.getByRole('button', { name: 'START WORKOUT' }).count(), 1);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); await page.screenshot({ path: output('390-today-workout-ready.png'), fullPage: false }); await page.reload({ waitUntil: 'networkidle' }); const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.equal(after.program.id, before.program.id, 'refresh preserves the generated plan'); assert.equal(after.profile.onboardingComplete, true); assert.equal(await page.locator('.plan-ready-notice').count(), 0, 'one-time confirmation does not return after refresh');
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click(); assert.equal(await page.getByText('2 days/week · Built for muscle growth', { exact: true }).count(), 1); assert.equal(await page.getByText('Selected areas', { exact: true }).count(), 1); assert.equal(await page.getByText('Chest, Back', { exact: true }).count(), 1); assert.equal(await page.getByText('Priority', { exact: true }).count(), 0); await page.screenshot({ path: output('390-profile-after-generation.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

{
  const { context, page, errors } = await freshPage(); await buildFirstPlan(page, [later(1), later(4)]);
  assert.equal(await page.getByText('Your first workout', { exact: true }).count(), 1); const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); const next = currentWeekSchedule(stored).find(item => item.scheduledDate > isoDay()) || currentWeekSchedule(stored, new Date(Date.now() + 7 * 86400000))[0]; const orientation = `${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date(`${next.scheduledDate}T12:00:00`))} · ${next.workout.name}`; assert.equal(await page.getByText(orientation, { exact: true }).count(), 1); assert.equal(await page.getByRole('heading', { name: 'Rest day' }).count(), 1); await page.screenshot({ path: output('390-today-rest-first-workout.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

{
  const earlier = later(6); const { context, page, errors } = await freshPage(); await buildFirstPlan(page, [earlier, later(1), later(3)]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); const next = currentWeekSchedule(stored).find(item => item.scheduledDate >= isoDay());
  assert.ok(stored.program.rotationStartDate, 'a newly accepted generated plan records its first available workout date'); assert.equal(next.workout.name, 'Full Body A', 'a mid-week A/B/C plan begins with A instead of skipping to its weekday label');
  const orientation = `${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date(`${next.scheduledDate}T12:00:00`))} · Full Body A`; assert.equal(await page.getByText(orientation, { exact: true }).count(), 1, 'rest-day orientation presents the actual first workout identity'); await page.screenshot({ path: output('390-mid-week-plan-starts-with-a.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

{
  const state = createReturningUserFixture(2); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state); const page = await context.newPage(); await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) })); await page.goto(`http://127.0.0.1:4173/?returning=${Date.now()}`, { waitUntil: 'networkidle' }); assert.equal(await page.locator('.plan-ready-notice').count(), 0, 'returning users do not receive a false success notice');
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click(); await page.getByRole('button', { name: 'REPLACE PLAN' }).click(); await page.getByRole('button', { name: /Build a personalized plan/ }).click(); await page.getByRole('button', { name: 'BUILD NEW PLAN' }).click(); await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor(); await page.getByRole('button', { name: 'USE THIS PLAN' }).click(); await page.getByText('YOUR PLAN IS READY', { exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'TODAY', exact: true }).getAttribute('aria-current'), 'page', 'generated replacement returns to Today'); await context.close();
}

await browser.close();
console.log('Post-generation QA passed: workout-today, rest-day orientation, mid-week A/B/C start, refresh, Profile, returning-user, and generated-replacement flows behave correctly.');
