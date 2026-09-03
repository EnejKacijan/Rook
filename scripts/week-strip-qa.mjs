import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, isoDay, weekDate, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/week-strip/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

function contrastRatio(first, second) {
  const luminance = value => {
    const channels = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(channel => {
      const normalized = channel / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

function fixture(todayState) {
  const state = blankState(); const today = weekday(); const todayIndex = WEEKDAYS.indexOf(today);
  const next = WEEKDAYS[(todayIndex + 1) % 7]; const later = WEEKDAYS[(todayIndex + 3) % 7];
  const availableDays = todayState === 'rest' ? [next, later] : [today, later];
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays, sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile); state.program.source = 'ai'; state.selectedDay = later; state.selectedDate = isoDay(weekDate(later));
  if (todayState === 'completed') {
    const template = state.program.days.find(day => day.weekday === today);
    state.workouts.push({ id: 'completed-today', programDayId: template.id, templateId: template.weekday, name: template.name, completedAt: new Date(`${isoDay()}T12:00:00`).toISOString(), exercises: structuredClone(template.exercises) });
  }
  return state;
}

for (const todayState of ['rest', 'planned', 'completed']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(state => localStorage.setItem('lift-v2-state', JSON.stringify(state)), fixture(todayState));
  const page = await context.newPage(); const errors = [];
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const strip = page.locator('.week-strip'); const todayTile = strip.locator('[aria-current="date"]');
  const weekLabel = page.locator('.week-navigation span');
  const [headerBox, eyebrowBox, programBox, navigationBox, labelBox] = await Promise.all([page.locator('.screen-top').boundingBox(), page.locator('.screen-top > .eyebrow').boundingBox(), page.locator('.today-program-name').boundingBox(), page.locator('.week-navigation').boundingBox(), weekLabel.boundingBox()]);
  const navigationCenter = navigationBox.x + navigationBox.width / 2; const labelCenter = labelBox.x + labelBox.width / 2;
  assert.ok(Math.abs(navigationCenter - labelCenter) < 1, `week label is centered inside its grouped control: ${JSON.stringify({ navigationCenter, labelCenter })}`);
  assert.ok(navigationBox.x >= eyebrowBox.x + eyebrowBox.width, 'eyebrow does not collide with the right-aligned week control');
  assert.ok(programBox.y >= navigationBox.y + navigationBox.height - 1, 'full program name receives its own row below the compact controls');
  assert.ok(Math.abs((navigationBox.x + navigationBox.width) - (headerBox.x + headerBox.width)) < 1, 'week navigation is aligned to the right edge');
  assert.equal(await strip.locator('button').count(), 7, 'all seven days render as buttons');
  assert.equal(await strip.locator('button:disabled').count(), 0, 'no calendar day is disabled');
  assert.equal(await strip.locator('.selected-day').count(), 1, 'only one day looks selected');
  assert.equal(await strip.locator('[aria-pressed="true"]').count(), 1, 'selection is exposed accessibly');
  const neutralTile = strip.locator('button:not(.selected-day):not(.today-date)').first();
  assert.equal(await neutralTile.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)', 'ordinary days keep the neutral chip fill');
  assert.equal(await neutralTile.evaluate(element => getComputedStyle(element).borderWidth), '1px', 'ordinary days keep the subtle neutral outline');
  assert.equal(await strip.locator('.workout-rest i').count(), 0, 'rest days have no dot');
  assert.equal(await todayTile.locator('i').count(), todayState === 'rest' ? 0 : 1, `today ${todayState} uses the expected dot presence`);
  if (todayState === 'planned') assert.equal(await todayTile.locator('.workout-dot').count(), 1, 'today planned has a gray workout dot');
  if (todayState === 'completed') assert.equal(await todayTile.locator('.completed-dot').count(), 1, 'today completed has a green workout dot');
  await strip.locator('.workout-planned:not([aria-current="date"])').first().click();
  assert.equal(await strip.locator('.selected-day.workout-planned').count(), 1, 'a planned workout day can be selected');
  assert.ok(parseFloat(await todayTile.evaluate(element => getComputedStyle(element).borderWidth)) >= 1, 'unselected today keeps a clear full-tile indicator');
  assert.equal(await todayTile.locator('strong').evaluate(element => getComputedStyle(element, '::after').content), 'none', 'today no longer uses the date underline');
  const rest = strip.locator('.workout-rest:not(.selected-day)').first();
  assert.equal(await rest.evaluate(element => getComputedStyle(element).opacity), '1', 'rest days do not look disabled');
  await rest.click();
  const selectedRest = strip.locator('.selected-day.workout-rest');
  assert.equal(await selectedRest.count(), 1, 'a rest day remains tappable and selectable');
  await page.waitForTimeout(220);
  const selectedRestColors = await selectedRest.evaluate(element => ({
    actual: getComputedStyle(element).color,
    expected: (() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--rook-week-selected-text)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    })(),
  }));
  assert.equal(selectedRestColors.actual, selectedRestColors.expected, 'selected rest-day text uses the high-contrast selected-state token');
  assert.deepEqual(errors, []); await page.screenshot({ path: output(`today-${todayState}.png`), fullPage: false }); await context.close();
}

const selectedTodayContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const selectedToday = fixture('planned'); selectedToday.selectedDay = weekday(); selectedToday.selectedDate = isoDay();
await selectedTodayContext.addInitScript(state => localStorage.setItem('lift-v2-state', JSON.stringify(state)), selectedToday);
const selectedTodayPage = await selectedTodayContext.newPage(); await selectedTodayPage.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) })); await selectedTodayPage.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
const selectedTodayTile = selectedTodayPage.locator('.week-strip [aria-current="date"]');
assert.equal(await selectedTodayTile.getAttribute('aria-pressed'), 'true');
assert.equal((await selectedTodayTile.getAttribute('class')).includes('today-date'), true, 'selected today preserves the independent today indicator');
const selectedTodaySurface = await selectedTodayTile.evaluate(element => {
  const probe = document.createElement('span');
  probe.style.backgroundColor = 'var(--rook-week-selected-surface)';
  document.body.append(probe);
  const expected = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return { actual: getComputedStyle(element).backgroundColor, expected };
});
assert.equal(selectedTodaySurface.actual, selectedTodaySurface.expected, 'selected today uses the shared selected-state surface');
assert.equal(await selectedTodayTile.evaluate(element => getComputedStyle(element).borderWidth), '2px', 'selected today keeps the shared selected-state outline');
assert.notEqual(await selectedTodayTile.evaluate(element => getComputedStyle(element, '::after').content), 'none', 'selected today retains the subtle today underline');
await selectedTodayContext.close();

for (const theme of ['light', 'dark', 'premium']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const state = fixture('completed');
  state.profile.themePreference = theme;
  state.selectedDay = weekday();
  state.selectedDate = isoDay();
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  const page = await context.newPage();
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const strip = page.locator('.week-strip');
  const today = strip.locator('[aria-current="date"]');
  const planned = strip.locator('.workout-planned:not(.selected-day)').first();
  assert.match(await today.getAttribute('aria-label'), /completed workout/, `${theme}: completed status is named accessibly`);
  assert.match(await planned.getAttribute('aria-label'), /planned workout/, `${theme}: planned status is named accessibly`);
  const completedSelected = await today.locator('.completed-dot').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }));
  const selectedTodayColors = await today.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element.querySelector('strong')).color, day: getComputedStyle(element.querySelector('small')).color }));
  assert.ok(contrastRatio(selectedTodayColors.text, selectedTodayColors.background) >= 4.5, `${theme}: selected today's date remains readable`);
  assert.ok(contrastRatio(selectedTodayColors.day, selectedTodayColors.background) >= 4.5, `${theme}: selected today's weekday remains readable`);
  const plannedUnselected = await planned.locator('.workout-dot').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor, style: getComputedStyle(element).borderStyle }));
  await planned.click();
  const plannedSelected = await strip.locator('.selected-day.workout-planned .workout-dot').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor, style: getComputedStyle(element).borderStyle }));
  const completedUnselected = await today.locator('.completed-dot').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }));
  assert.deepEqual(plannedSelected, plannedUnselected, `${theme}: selecting a day does not recolor its planned marker`);
  assert.deepEqual(completedUnselected, completedSelected, `${theme}: deselecting a day does not recolor its completed marker`);
  assert.equal(plannedSelected.background, 'rgba(0, 0, 0, 0)', `${theme}: planned remains hollow rather than resembling completion`);
  assert.equal(plannedSelected.style, 'solid', `${theme}: planned keeps its non-color hollow-marker treatment`);
  assert.notEqual(completedSelected.background, 'rgba(0, 0, 0, 0)', `${theme}: completed remains solid`);
  assert.notEqual(await today.evaluate(element => getComputedStyle(element, '::after').content), 'none', `${theme}: today underline survives selection changes`);
  await context.close();
}

await browser.close();
console.log('Week strip QA passed: week navigation is grouped on the right, today and selection remain independently legible, workout markers are data-driven, and every day is tappable.');
