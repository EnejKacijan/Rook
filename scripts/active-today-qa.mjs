import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, startWorkout, weekday, WEEKDAYS } from '../src/domain.js';

const outputRoot = new URL('../artifacts/active-today/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

function fixture() {
  const state = blankState();
  const today = weekday();
  const otherDay = WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7];
  state.profile = { ...state.profile, name: 'Alex', goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, otherDay], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.activeWorkout = startWorkout(state, state.program.days.find(day => day.weekday === today));
  state.activeWorkout.startedAt = Date.now() - 18 * 60 * 1000;
  return state;
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(state => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(state)); }, fixture());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });

const totalSets = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.flatMap(exercise => exercise.sets).length);
assert.equal(await page.locator('.week-strip').isVisible(), true, `Today keeps the week strip. Rendered: ${await page.locator('body').innerText()}`);
assert.equal(await page.locator('.active-workout-hero').count(), 1);
assert.match(await page.locator('.active-workout-hero > p').textContent(), new RegExp(`^0 / ${totalSets} sets · 18 min$`));
assert.equal(await page.getByRole('button', { name: 'RESUME WORKOUT' }).count(), 1);
assert.equal(await page.locator('.exercise-preview .exercise-row-main img').count(), 0, 'active-date overview rows remain text-first');
const [metadataBox, resumeBox] = await Promise.all([page.locator('.active-workout-hero > p').boundingBox(), page.getByRole('button', { name: 'RESUME WORKOUT' }).boundingBox()]);
const ctaGap = resumeBox.y - (metadataBox.y + metadataBox.height); assert.ok(ctaGap >= 20 && ctaGap <= 24, `Resume CTA stays grouped 20–24px below metadata, got ${ctaGap}px`);
assert.equal(await page.getByRole('button', { name: 'START WORKOUT' }).count(), 0);
assert.equal(await page.locator('.exercise-preview .list-row').count() > 0, true, 'Today keeps the workout preview');
await page.locator('.week-strip .workout-planned:not(.selected-day)').first().click();
assert.equal(await page.locator('.active-workout-hero').count(), 0, 'another workout day does not inherit active workout content');
assert.equal(await page.locator('.active-workout-notice').count(), 1, 'another workout day keeps a compact resume route');
assert.match(await page.locator('.active-workout-notice-progress').textContent(), new RegExp(`^0 / ${totalSets} sets · 18 min$`), 'compact resume route shows live set and time progress');
assert.equal(await page.getByText('Finish the active workout before starting this one.', { exact: true }).count(), 1);
assert.equal(await page.getByRole('button', { name: 'START WORKOUT' }).count(), 0, 'another workout cannot start while one is active');
assert.equal(await page.locator('.exercise-preview .exercise-row-main img').count(), 0, 'another workout day keeps the same text-first overview list');
await page.screenshot({ path: output('390-other-workout-with-active.png'), fullPage: false });
await page.locator('.active-workout-notice').getByRole('button', { name: /Resume .* workout/ }).click();
assert.equal(await page.locator('.exercise-heading h1').count(), 1, 'compact Resume opens the existing active session');
await page.getByRole('button', { name: 'Back to Today' }).click();
assert.equal(await page.locator('.active-workout-notice').count(), 1, 'returning from Resume preserves the separately viewed day');
for (const theme of ['dark', 'premium']) {
  await page.evaluate(themePreference => {
    const state = JSON.parse(localStorage.getItem('lift-v2-state'));
    state.profile.themePreference = themePreference;
    localStorage.setItem('lift-v2-state', JSON.stringify(state));
  }, theme);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  assert.equal(await page.locator('.active-workout-notice').isVisible(), true, `${theme} keeps the active-workout route distinct`);
  assert.match(await page.locator('.active-workout-notice-progress').textContent(), new RegExp(`^0 / ${totalSets} sets · 18 min$`));
  await page.screenshot({ path: output(`390-other-workout-with-active-${theme}.png`), fullPage: false });
}
await page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('lift-v2-state'));
  state.profile.themePreference = 'light';
  localStorage.setItem('lift-v2-state', JSON.stringify(state));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.week-strip button:not(.workout-planned):not(.workout-completed)').first().click();
assert.equal(await page.getByRole('heading', { name: 'Rest day' }).count(), 1, 'rest days remain rest days while a workout is active');
assert.equal(await page.locator('.active-workout-notice').count(), 1, 'rest day retains the global resume route');
assert.equal(await page.getByRole('button', { name: 'Train today anyway' }).count(), 0, 'rest day cannot start a concurrent session');
await page.screenshot({ path: output('390-rest-day-with-active.png'), fullPage: false });
await page.locator('.week-strip [aria-current="date"]').click();
assert.equal(await page.locator('.active-workout-hero').count(), 1, 'returning to the active date restores its live snapshot');
for (const width of [375, 390, 430, 500]) {
  await page.setViewportSize({ width, height: 844 });
  await page.screenshot({ path: output(`${width}-active-today.png`), fullPage: false });
}
await page.setViewportSize({ width: 390, height: 844 });

await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('lift-v2-state')); state.activeWorkout.startedAt = Date.now() - 130 * 60 * 60 * 1000; localStorage.setItem('lift-v2-state', JSON.stringify(state)); });
await page.reload({ waitUntil: 'networkidle' }); assert.match(await page.locator('.active-workout-hero > p').textContent(), new RegExp(`^0 / ${totalSets} sets · 99\\+ h$`)); assert.equal(await page.locator('.active-workout-hero > p').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'abnormal duration stays inside the metadata row');
await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('lift-v2-state')); state.activeWorkout.startedAt = Date.now() - 18 * 60 * 1000; localStorage.setItem('lift-v2-state', JSON.stringify(state)); }); await page.reload({ waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('32.5');
await page.getByRole('button', { name: 'Complete set 1' }).click();
await page.locator('.rest-timer').getByRole('button', { name: 'SKIP' }).click();
await page.getByRole('button', { name: 'NEXT EXERCISE →' }).click();
await page.getByRole('button', { name: /SKIP INCOMPLETE SETS?/ }).click();
const currentExercise = await page.locator('.exercise-heading h1').textContent();
await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('47.5');
await page.getByRole('button', { name: 'Complete set 1' }).click();
await page.getByRole('button', { name: 'Back to Today' }).click();
assert.match(await page.locator('.active-workout-hero > p').textContent(), new RegExp(`^2 / ${totalSets} sets · 18 min$`));
assert.equal(await page.getByRole('button', { name: 'START WORKOUT' }).count(), 0);
await page.screenshot({ path: output('390-active-progress.png'), fullPage: false });

await page.getByRole('button', { name: 'COACH', exact: true }).click();
await page.getByRole('button', { name: 'TODAY', exact: true }).click();
assert.equal(await page.getByRole('button', { name: 'RESUME WORKOUT' }).count(), 1, 'active workout survives tab navigation');
await page.reload({ waitUntil: 'networkidle' });
assert.match(await page.locator('.active-workout-hero > p').textContent(), new RegExp(`^2 / ${totalSets} sets · 18 min$`));
await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
assert.equal(await page.locator('.exercise-heading h1').textContent(), currentExercise, 'resume restores the exact exercise');
assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).inputValue(), '47.5', 'resume restores entered weight');
assert.equal(await page.getByRole('button', { name: 'Reopen set 1' }).count(), 1, 'resume restores completed sets');
assert.equal(await page.locator('.rest-timer').isVisible(), true, 'resume restores the relevant rest timer');

await page.getByRole('button', { name: 'Finish', exact: true }).click();
await page.getByRole('button', { name: 'FINISH ANYWAY' }).click();
await page.getByRole('heading', { name: 'Workout ended early' }).waitFor();
await page.getByRole('button', { name: 'DONE' }).click();
assert.equal(await page.getByRole('button', { name: 'RESUME WORKOUT' }).count(), 0, 'resume state disappears after finishing');
assert.equal(await page.getByText(/completed/, { exact: false }).count() > 0, true, 'Today shows the completed state');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout), null);
assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);

await context.close();
await browser.close();
console.log('Active Today QA passed: integrated resume hero, set progress/time, navigation, exact reload recovery, rest timer, finish cleanup, and 375–500 px screenshots.');
