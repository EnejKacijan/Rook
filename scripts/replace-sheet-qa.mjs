import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, exerciseCatalog, isoDay, startWorkout, weekday, WEEKDAYS } from '../src/domain.js';

const outputRoot = new URL('../artifacts/replace-sheet/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

function fixture() {
  const state = blankState(); const today = weekday(); const other = WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7];
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, other], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile); state.selectedDay = today; state.selectedDate = isoDay();
  const template = state.program.days.find(day => day.weekday === today); const existingIndex = template.exercises.findIndex(exercise => exercise.exerciseId === 'back-squat'); const sourceIndex = existingIndex >= 0 ? existingIndex : 0; const source = template.exercises[sourceIndex];
  template.exercises[sourceIndex] = { ...source, exerciseId: 'back-squat', restSeconds: exerciseCatalog['back-squat'].restSeconds, defaultIncrement: exerciseCatalog['back-squat'].increment };
  state.activeWorkout = startWorkout(state, template); state.activeWorkout.exerciseIndex = sourceIndex; return state;
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(state => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(state)); }, fixture());
const page = await context.newPage(); const errors = [];
page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();

const openSheet = async () => { await page.getByRole('button', { name: 'Replace ›' }).click(); await page.getByRole('dialog', { name: /Replace Back Squat/ }).waitFor(); };
await page.evaluate(() => window.scrollTo(0, Math.min(320, document.documentElement.scrollHeight - innerHeight))); await openSheet(); const originalScroll = await page.evaluate(() => Math.abs(Number.parseInt(document.body.style.top || '0', 10)));
assert.equal(await page.locator('.app-content').getAttribute('inert'), '', 'background is inert');
assert.equal(await page.evaluate(() => document.body.style.position), 'fixed', 'page scroll is locked');
assert.equal(await page.locator('.modal-layer').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(27, 26, 25, 0.35)');
await assert.rejects(page.getByRole('button', { name: 'Finish', exact: true }).click({ timeout: 350 }), /intercepts pointer events|inert|timeout/i);
assert.equal(await page.getByRole('dialog').count(), 1, 'underlying Finish did not activate');
for (const width of [375, 390, 430, 500]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: output(`${width}-replace-sheet.png`), fullPage: false }); }
await page.setViewportSize({ width: 390, height: 844 });

await page.mouse.click(8, 8); await page.getByRole('dialog').waitFor({ state: 'detached' });
assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - originalScroll) <= 1, 'backdrop close restores exact workout scroll');

await openSheet(); const handle = await page.locator('.sheet-grab-zone').boundingBox();
await page.mouse.move(handle.x + handle.width / 2, handle.y + 8); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 34, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(220); assert.equal(await page.getByRole('dialog').count(), 1, 'small drag snaps back'); assert.match(await page.locator('.replace-sheet').getAttribute('style') || '', /translateY\(0px\)/);
await page.mouse.move(handle.x + handle.width / 2, handle.y + 8); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 230, { steps: 5 }); await page.mouse.up(); await page.getByRole('dialog').waitFor({ state: 'detached' });
assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - originalScroll) <= 1, 'swipe close restores exact workout scroll');

await page.setViewportSize({ width: 390, height: 560 }); await openSheet();
const firstIds = await page.locator('.choice-row').evaluateAll(nodes => nodes.map(node => node.textContent)); assert.equal(firstIds.length, 3, 'shows three strongest candidates first');
await page.getByRole('button', { name: 'More suggestions' }).click(); await page.waitForTimeout(750); const expandedCount = await page.locator('.choice-row').count(); assert.ok(expandedCount > 3, `More suggestions exposes another compatible squat (${expandedCount} shown; ${await page.locator('.replacement-secondary').textContent()})`);
const expanded = await page.locator('.choice-row').evaluateAll(nodes => nodes.map(node => node.textContent)); assert.equal(new Set(expanded).size, expanded.length, `More suggestions adds no duplicates: ${expanded.join(' | ')}`);
assert.equal(await page.locator('.sheet-scroll').evaluate(node => node.scrollHeight > node.clientHeight), true, 'long content scrolls inside the sheet');
assert.equal(await page.evaluate(() => document.body.style.position), 'fixed', 'underlying workout stays locked during internal scroll');
await page.screenshot({ path: output('390-more-suggestions-short-height.png'), fullPage: false });

await page.getByRole('button', { name: 'Choose another exercise' }).click(); const search = page.getByRole('searchbox', { name: 'Search compatible exercises' }); await search.fill('Goblet');
assert.equal(await page.getByRole('button', { name: /Goblet Squat/ }).count(), 1, 'compatible exercise search finds by name');
const pickerPatterns = await page.locator('.picker-results .choice-row small').allTextContents(); assert.equal(pickerPatterns.every(text => text.includes('squat')), true, 'picker remains movement-compatible');
const activeIndex = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex);
const permanentId = await page.evaluate(index => JSON.parse(localStorage.getItem('lift-v2-state')).program.days.find(day => day.weekday === ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]).exercises[index].exerciseId, activeIndex);
await page.getByRole('button', { name: /Goblet Squat/ }).click(); await page.locator('.exercise-heading h1').getByText('Goblet Squat').waitFor();
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.activeWorkout.exercises[activeIndex].exerciseId, 'goblet-squat'); assert.equal(stored.activeWorkout.exerciseIndex, activeIndex); assert.equal(stored.program.days.find(day => day.weekday === weekday()).exercises[activeIndex].exerciseId, permanentId, 'permanent program remains unchanged'); assert.equal(stored.activeWorkout.exercises[activeIndex].defaultIncrement, exerciseCatalog['goblet-squat'].increment); assert.equal(stored.activeWorkout.exercises[activeIndex].restSeconds, exerciseCatalog['goblet-squat'].restSeconds);

await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click(); assert.equal(await page.locator('.exercise-heading h1').textContent(), 'Goblet Squat', 'today-only replacement survives reload/resume');
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.program.days.find(day => day.weekday === weekday()).exercises[activeIndex].exerciseId, permanentId);
assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);

await context.close(); await browser.close();
console.log('Replace sheet QA passed: inert backdrop, scroll restoration, swipe/snap, internal scroll, unique more results, compatible search, today-only replacement, and reload persistence.');
