import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, estimateSessionMinutes, exerciseCatalog, isoDay, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/planned-today/', import.meta.url); await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const today = weekday(); const todayIndex = WEEKDAYS.indexOf(today); const offsetDay = offset => WEEKDAYS[(todayIndex + offset) % 7];

function fixture({ daysPerWeek = 2, sessionMinutes = 45, completed = false, longTitle = false } = {}) {
  const state = blankState(); const availableDays = Array.from({ length: daysPerWeek }, (_, index) => offsetDay([0, 1, 3, 5, 6, 2][index]));
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek, availableDays, sessionMinutes, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile); state.program.source = 'ai'; state.program.name = 'Full Body A / B / C';
  const selected = state.program.days.find(day => day.weekday === today); if (daysPerWeek === 2) selected.name = longTitle ? 'Full Body Athletic Strength and Conditioning' : 'Full Body A';
  state.selectedDay = today; state.selectedDate = isoDay();
  if (completed) state.workouts.push({ id: 'completed-today', programDayId: selected.id, templateId: selected.weekday, name: selected.name, completedAt: new Date().toISOString(), durationSeconds: 2670, exercises: structuredClone(selected.exercises).map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set, completed: true })) })) });
  return state;
}

async function open(state, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' }); const page = await context.newPage(); const errors = [];
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4173/?planned-today=${Date.now()}`, { waitUntil: 'networkidle' }); return { context, page, errors };
}

const lineCount = locator => locator.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length; });
async function headerMetrics(page) {
  const eyebrow = page.locator('.screen-top > .eyebrow'); const program = page.locator('.today-program-name'); const navigation = page.locator('.week-navigation'); const [eyebrowBox, programBox, navigationBox, headerBox] = await Promise.all([eyebrow.boundingBox(), program.boundingBox(), navigation.boundingBox(), page.locator('.screen-top').boundingBox()]);
  assert.equal(await eyebrow.innerText(), 'WEEKLY WORKOUT PLAN'); assert.equal(await program.innerText(), 'Full Body A / B / C', 'full active program identity is visible below the eyebrow');
  const eyebrowAndNavSeparated = eyebrowBox.x + eyebrowBox.width <= navigationBox.x || eyebrowBox.y + eyebrowBox.height <= navigationBox.y + .5;
  const programAndNavSeparated = programBox.y >= navigationBox.y + navigationBox.height - 1 || programBox.y + programBox.height <= navigationBox.y + .5;
  assert.ok(eyebrowAndNavSeparated, 'eyebrow and grouped week navigation do not collide'); assert.ok(programAndNavSeparated, 'program name has its own untruncated row');
  assert.ok(Math.abs(navigationBox.x + navigationBox.width - (headerBox.x + headerBox.width)) < 1, 'week navigation stays right-aligned');
  return navigationBox;
}
async function verifyLastRowClear(page) {
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const [lastRow, navigation] = await Promise.all([page.locator('.exercise-preview .list-row').last().boundingBox(), page.locator('.bottom-nav').boundingBox()]);
  assert.ok(lastRow.y + lastRow.height <= navigation.y + .5, `last exercise clears fixed navigation without extra spacer (allowing subpixel rounding): ${JSON.stringify({ lastRow, navigation })}`);
}

async function swipeWeek(page, { fromX, toX, fromY = 110, toY = fromY }) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 4 });
  await page.mouse.up();
}

{
  const { context, page, errors } = await open(fixture(), { width: 390, height: 844 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor(); const plannedHeader = await headerMetrics(page);
  assert.equal(await page.locator('.workout-title-primary').innerText(), 'Full Body A'); assert.equal(await lineCount(page.locator('.workout-title-primary')), 1, 'Full Body A remains on one line');
  assert.equal(await page.locator('.exercise-preview .navigation-chevron').count(), 0, 'Today rows stay text-first without repeated chevrons');
  assert.equal(await page.locator('.week-strip .selected-day.workout-planned').count(), 1); await verifyLastRowClear(page); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: output('390-planned-workout.png'), fullPage: false });
  const restDay = offsetDay(2); await page.locator(`.week-strip button[aria-label^="${restDay} "]`).click(); await page.getByRole('heading', { name: 'Rest day' }).waitFor(); const restHeader = await headerMetrics(page);
  const todayChip = page.locator('.week-strip [aria-current="date"]'); const plannedDot = todayChip.locator('.workout-dot');
  assert.equal(await plannedDot.count(), 1, 'today keeps its planned-workout marker when another day is selected');
  const [dotColor, chipColor] = await Promise.all([plannedDot.evaluate(node => getComputedStyle(node).backgroundColor), todayChip.evaluate(node => getComputedStyle(node).backgroundColor)]);
  assert.notEqual(dotColor, chipColor, 'the planned marker remains visible against the unselected today chip');
  assert.deepEqual({ x: restHeader.x, width: restHeader.width }, { x: plannedHeader.x, width: plannedHeader.width }, 'header does not jump when switching between planned and rest days'); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await open(fixture({ daysPerWeek: 4, sessionMinutes: 90 }), { width: 390, height: 720 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor(); assert.ok(await page.locator('.exercise-preview .list-row').count() >= 5, 'long-list fixture contains enough exercises to scroll'); await verifyLastRowClear(page); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await open(fixture(), { width: 320, height: 720 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor(); await headerMetrics(page); assert.equal(await lineCount(page.locator('.workout-title-primary')), 1, 'Full Body A remains on one line at narrow mobile width'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320); await verifyLastRowClear(page); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: output('320-planned-workout.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await open(fixture({ completed: true }), { width: 390, height: 844 });
  await page.getByRole('button', { name: 'WORKOUT COMPLETE · VIEW HISTORY' }).waitFor(); await headerMetrics(page); assert.equal(await lineCount(page.locator('.workout-title-primary')), 1); await verifyLastRowClear(page); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: output('390-completed-workout.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}
{
  const { context, page, errors } = await open(fixture({ longTitle: true }), { width: 320, height: 720 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor(); assert.equal(await page.locator('.workout-title-detail').count(), 1, 'long structured workout names retain a clean secondary line'); assert.ok((await page.locator('.workout-title').boundingBox()).height > 44, 'long workout title uses multiple readable lines'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'long workout name does not create horizontal overflow'); assert.deepEqual(errors, []); await context.close();
}
{
  const state = fixture({ daysPerWeek: 6, sessionMinutes: 90 }); state.program.source = 'ai-import'; const selected = state.program.days.find(day => day.weekday === today); selected.name = 'Long imported workout'; const seen = new Set();
  selected.exercises = state.program.days.flatMap(day => day.exercises).filter(exercise => {
    if (seen.has(exercise.exerciseId)) return false; seen.add(exercise.exerciseId); return true;
  }).sort((a, b) => exerciseCatalog[b.exerciseId].name.length - exerciseCatalog[a.exerciseId].name.length).slice(0, 10).map((exercise, index) => ({
    ...structuredClone(exercise), id: `long-row-${index}`, sets: exercise.sets.map((set, setIndex) => ({ ...structuredClone(set), id: `long-row-${index}-set-${setIndex}` }))
  })); selected.estimatedMinutes = estimateSessionMinutes(selected.exercises);
  const { context, page, errors } = await open(state, { width: 320, height: 720 });
  await page.getByRole('button', { name: 'START WORKOUT' }).waitFor();
  assert.equal(await page.locator('.exercise-preview .list-row').count(), 10, 'Today renders a ten-exercise imported workout without truncating the list');
  const longRow = page.locator('.exercise-preview .list-row').first(); const [nameBox, targetBox] = await Promise.all([longRow.locator('strong').boundingBox(), longRow.locator('.navigation-row-end').boundingBox()]);
  const nameAndTargetOverlap =
    nameBox.x < targetBox.x + targetBox.width &&
    nameBox.x + nameBox.width > targetBox.x &&
    nameBox.y < targetBox.y + targetBox.height &&
    nameBox.y + nameBox.height > targetBox.y;
  assert.equal(nameAndTargetOverlap, false, 'long exercise names wrap without colliding with the compact prescription');
  assert.ok((await longRow.boundingBox()).height > 48, 'long exercise name gains vertical space instead of overflowing');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'ten exercises and long names preserve narrow-screen width');
  await verifyLastRowClear(page); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: output('320-ten-exercises-long-name.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}
{
  const state = fixture();
  const programStart = new Date(); programStart.setDate(programStart.getDate() - 21);
  state.program.createdAt = programStart.toISOString();
  const { context, page, errors } = await open(state, { width: 390, height: 844 });
  const range = page.locator('.week-navigation span'); await range.waitFor();
  const currentRangeAtOpen = await range.innerText();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.waitForFunction(value => document.querySelector('.week-navigation span')?.textContent !== value, currentRangeAtOpen);
  const previousRange = await range.innerText();
  await swipeWeek(page, { fromX: 320, toX: 250 });
  await page.waitForFunction(value => document.querySelector('.week-navigation span')?.textContent !== value, previousRange);
  const currentRange = await range.innerText();
  assert.notEqual(currentRange, previousRange, 'left swipe advances exactly one week');
  assert.equal(await page.getByRole('button', { name: 'Next week' }).isDisabled(), true, 'swipe respects the current-week forward boundary');
  await swipeWeek(page, { fromX: 70, toX: 140 });
  await page.waitForFunction(value => document.querySelector('.week-navigation span')?.textContent !== value, currentRange);
  assert.equal(await range.innerText(), previousRange, 'right swipe returns to the previous week');
  await swipeWeek(page, { fromX: 190, toX: 198, fromY: 85, toY: 165 });
  assert.equal(await range.innerText(), previousRange, 'vertical scrolling intent never changes the week');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipeWeek(page, { fromX: 320, toX: 250 });
  assert.equal(await page.locator('.week-strip').evaluate(element => getComputedStyle(element).animationName), 'none', 'reduced motion keeps swipe navigation without spatial animation');
  assert.deepEqual(errors, []); await context.close();
}

await browser.close();
console.log('Planned Today QA passed: title wrapping, shared header placement, state semantics, swipe week navigation, bottom-nav clearance, completed state, and narrow mobile layout are correct.');
