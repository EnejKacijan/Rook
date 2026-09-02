import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, isoDay, weekDate, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/rest-day/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const today = weekday(); const todayIndex = WEEKDAYS.indexOf(today); const offsetDay = offset => WEEKDAYS[(todayIndex + offset) % 7];

function fixture(availableDays) {
  const state = blankState();
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays, sessionMinutes: 45, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile); state.program.source = 'ai'; state.program.name = 'Full Body A / B / C with a deliberately long title'; state.selectedDay = today; state.selectedDate = isoDay();
  return state;
}

async function pageFor(state, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', colorScheme: ['dark', 'premium'].includes(state.profile.themePreference) ? 'dark' : 'light' }); const page = await context.newPage(); const errors = [];
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4173/?rest-day=${Date.now()}`, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

async function verifyHeader(page) {
  const [eyebrow, program, nav] = await Promise.all([page.locator('.screen-top > .eyebrow').boundingBox(), page.locator('.today-program-name').boundingBox(), page.locator('.week-navigation').boundingBox()]);
  const eyebrowAndNavSeparated = eyebrow.x + eyebrow.width <= nav.x || eyebrow.y + eyebrow.height <= nav.y + .5;
  assert.ok(eyebrowAndNavSeparated, 'eyebrow does not collide with grouped week navigation');
  const programAndNavSeparated = program.y >= nav.y + nav.height - 1 || program.y + program.height <= nav.y + .5;
  assert.ok(programAndNavSeparated, 'full program title receives its own non-colliding row');
  assert.equal(await page.locator('.week-navigation button').count(), 2);
  for (const button of await page.locator('.week-navigation button').all()) { const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, 'week arrows retain 44px touch targets'); }
}

async function verifyRest(page, expectedDistance, screenshot) {
  await page.getByRole('heading', { name: 'Rest day' }).waitFor(); await verifyHeader(page);
  assert.equal(await page.getByText('NOTHING HERE YET', { exact: true }).count(), 0);
  assert.equal(await page.getByText('UP NEXT', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'VIEW WORKOUT' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'VIEW NEXT WORKOUT' }).count(), 0);
  const expectedDate = new Date(); expectedDate.setDate(expectedDate.getDate() + expectedDistance);
  const expected = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(expectedDate);
  assert.equal(await page.getByText(expected, { exact: true }).count(), 1, 'Up next shows the actual scheduled date');
  assert.match(await page.locator('.rest-up-next > span').innerText(), /^\d+ exercises · ~\d+ min$/);
  const buttonBox = await page.getByRole('button', { name: 'VIEW WORKOUT' }).boundingBox(); const contentBox = await page.locator('.today-screen').boundingBox(); assert.ok(buttonBox.width < contentBox.width * .75, 'View Workout remains a restrained secondary action');
  await page.screenshot({ path: output(screenshot), fullPage: false });
}

{
  const { context, page, errors } = await pageFor(fixture([offsetDay(1), offsetDay(4)]), { width: 390, height: 844 });
  await verifyRest(page, 1, '390-rest-next-tomorrow.png'); assert.equal(await page.getByText('This is a planned recovery day.', { exact: true }).count(), 1); const trainToday = page.getByRole('button', { name: 'Train today instead' }); assert.equal(await trainToday.count(), 1); const trainTodayBox = await trainToday.boundingBox(); assert.ok(trainTodayBox.height >= 44, 'tertiary Train today action retains a comfortable touch target'); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await pageFor(fixture([offsetDay(3), offsetDay(6)]), { width: 390, height: 844 });
  await verifyRest(page, 3, '390-rest-next-several-days.png'); assert.deepEqual(errors, []); await context.close();
}
for (const theme of ['light', 'dark', 'premium']) {
  const state = fixture([offsetDay(3), offsetDay(6)]); state.profile.themePreference = theme; const { context, page, errors } = await pageFor(state, { width: 390, height: 844 });
  const selectedRest = offsetDay(1); await page.locator(`.week-strip button[aria-label^="${selectedRest} "]`).click();
  await page.getByRole('heading', { name: 'Rest day' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Train today instead' }).count(), 0);
  const selectedChip = page.locator('.week-strip .selected-day'); const todayChip = page.locator('.week-strip [aria-current="date"]');
  const [selectedStyle, todayStyle] = await Promise.all([
    selectedChip.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopColor, borderWidth: getComputedStyle(node).borderTopWidth })),
    todayChip.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopColor, borderWidth: getComputedStyle(node).borderTopWidth })),
  ]);
  assert.notEqual(selectedStyle.background, todayStyle.background, `${theme}: selected day has the stronger surface treatment`);
  assert.notEqual(selectedStyle.border, todayStyle.border, `${theme}: today uses a distinct secondary indicator`);
  if (theme === 'premium') assert.ok(parseFloat(selectedStyle.borderWidth) > parseFloat(todayStyle.borderWidth), 'premium: selected border is stronger than the today indicator');
  await page.screenshot({ path: output(`390-selected-non-today-rest-${theme}.png`), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await pageFor(fixture([today, offsetDay(3)]), { width: 390, height: 844 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor(); await verifyHeader(page); assert.equal(await page.locator('.rest-day-state').count(), 0); await page.screenshot({ path: output('390-normal-workout-day.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await pageFor(fixture([offsetDay(1), offsetDay(4)]), { width: 320, height: 720 });
  await verifyRest(page, 1, '320-rest-narrow.png'); const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth); assert.equal(bodyWidth, 320, 'narrow viewport has no horizontal overflow'); assert.deepEqual(errors, []); await context.close();
}
{
  const state = fixture(['Mon', 'Thu']);
  const selectedSunday = weekDate('Sun');
  state.selectedDay = 'Sun'; state.selectedDate = isoDay(selectedSunday);
  const expectedMonday = new Date(selectedSunday); expectedMonday.setDate(expectedMonday.getDate() + 1);
  const expectedDate = isoDay(expectedMonday); const mondayWorkout = state.program.days.find(day => day.weekday === 'Mon');
  const { context, page, errors } = await pageFor(state, { width: 390, height: 844 });
  await page.locator(`.week-strip button[aria-label^="Sun ${selectedSunday.getDate()}"]`).click();
  await page.getByRole('heading', { name: 'Rest day' }).waitFor();
  assert.equal(await page.locator('.rest-up-next time').getAttribute('datetime'), expectedDate, 'Up next can point into the following calendar week');
  await page.getByRole('button', { name: 'VIEW WORKOUT' }).click();
  await page.getByRole('heading', { name: mondayWorkout.name }).waitFor();
  const selectedChip = page.locator('.week-strip .selected-day');
  assert.match(await selectedChip.getAttribute('aria-label'), new RegExp(`^Mon ${expectedMonday.getDate()}`), 'the next week strip selects the same date as the workout');
  assert.equal(await selectedChip.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).selectedDate), expectedDate, 'cross-week View Workout persists the exact selected date');
  assert.equal(await page.locator('.today-hero > .eyebrow').innerText(), new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(expectedMonday).toUpperCase());
  await page.screenshot({ path: output('390-view-workout-next-week.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

await browser.close();
console.log('Rest-day QA passed: tomorrow, later, selected rest, planned workout, and narrow mobile states render with correct schedule data and hierarchy.');
