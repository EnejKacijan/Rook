import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const outputRoot = new URL('../artifacts/coach-adapt-review/', import.meta.url); await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const fixture = createReturningUserFixture(2); const permanentIds = fixture.program.days.flatMap(day => day.exercises.map(exercise => exercise.exerciseId));
await context.addInitScript(state => localStorage.setItem('lift-v2-state', JSON.stringify(state)), fixture);
const page = await context.newPage(); const errors = [];
page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) }));
await page.route('**/api/ai', async route => {
  const body = JSON.parse(route.request().postData()); const exercises = body.payload?.context?.today?.exercises || [];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { text: 'I prepared a shorter version for review before applying it.', action: { type: 'adapt-today', exerciseIds: exercises.slice(0, Math.min(4, exercises.length)).map(item => item.exerciseId), minutes: 35 } } }) });
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'COACH' }).click(); await page.getByLabel('Ask Coach').fill('Adapt today to 35 minutes.'); await page.getByRole('button', { name: 'Send message' }).click();
await page.getByRole('button', { name: 'EDIT WORKOUT' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'USE SHORTER WORKOUT' }).count(), 1, 'direct apply remains available'); const reply = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).conversations.at(-1).reply); const proposed = reply.action; assert.ok(proposed.estimatedMinutes <= 40, `validated 35-minute proposal stays within the five-minute contract: ${JSON.stringify({ estimatedMinutes: proposed.estimatedMinutes, setTargets: proposed.setTargets })}`); assert.match(reply.text, /prepared.*before applying/i, 'a pending proposal is described as a draft'); assert.doesNotMatch(reply.text, /done|trimmed|applied/i, 'a pending proposal never claims the workout already changed'); await page.screenshot({ path: output('390-request-and-proposal.png'), fullPage: false }); await page.getByRole('button', { name: 'EDIT WORKOUT' }).click(); await page.waitForTimeout(50);
const initialReviewLayout = await page.locator('.coach-scroll').evaluate(node => { const actions = document.querySelector('.action-card-buttons')?.getBoundingClientRect(); const scroller = node.getBoundingClientRect(); return { actionBottom: actions?.bottom, visibleBottom: scroller.bottom }; }); assert.ok(initialReviewLayout.actionBottom <= initialReviewLayout.visibleBottom - 12, `review actions clear the composer when review opens: ${JSON.stringify(initialReviewLayout)}`);
await page.getByRole('button', { name: 'CANCEL' }).click(); const afterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).conversations.at(-1)); assert.equal(afterCancel.actionResult, undefined, 'Cancel remains zero mutation'); assert.equal(afterCancel.reply.text, reply.text, 'Cancel keeps the pending copy'); await page.getByRole('button', { name: 'EDIT WORKOUT' }).click();
const cards = page.locator('.adjust-exercise-card');
assert.ok(await cards.count() > 2, 'review lists the actual workout exercises');
const add = page.locator('.adjust-exercise-restore').first();
let addedName = null;
if (await add.count()) {
  addedName = await add.locator('strong').textContent();
  await add.click();
}
const removable = page.locator('.adjust-exercise-card[data-swipe-enabled="true"]').filter({hasNotText: addedName ?? /^$/}).first();
const removedName = await removable.locator('strong').textContent();
await removable.locator('.adjust-exercise-toggle').click();
await removable.locator('.adjust-exercise-remove').click();
await page.locator('.adjust-exercise-card[data-adjust-omitted]').filter({hasText: removedName}).waitFor();
for (const width of [320, 390, 430, 500]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: output(`${width}-review.png`), fullPage: false }); }
const expectedNames = await page.locator('.adjust-exercise-card:not([data-adjust-omitted]) .plan-editor-heading strong').allTextContents();
if (addedName) assert.ok(expectedNames.includes(addedName));
assert.ok(!expectedNames.includes(removedName));
await page.getByRole('button', { name: 'APPLY CHANGES' }).click(); await page.getByRole('status').filter({ hasText: 'Today updated' }).waitFor();
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.deepEqual(persisted.program.days.flatMap(day => day.exercises.map(exercise => exercise.exerciseId)), permanentIds, 'permanent weekly plan is unchanged'); assert.equal(persisted.todayAdaptation.exerciseIds.length, expectedNames.length, 'reviewed selection is persisted for today'); assert.match(persisted.conversations.at(-1).reply.text, /shortened.*applied/i, 'Coach confirms the mutation only after Apply');
await page.getByRole('button', { name: 'View workout →' }).click(); await page.waitForFunction(names => { const rendered = [...document.querySelectorAll('.exercise-preview strong')].map(element => element.textContent); return JSON.stringify(rendered) === JSON.stringify(names); }, expectedNames); assert.deepEqual(await page.locator('.exercise-preview strong').allTextContents(), expectedNames, 'Today uses exactly the reviewed exercise selection');
assert.deepEqual(errors, []); await context.close(); await browser.close();
console.log('Coach adaptation review QA passed: user can swap kept/skipped exercises, apply the reviewed selection, and preserve the permanent plan.');
