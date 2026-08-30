import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, exerciseCatalog } from '../src/domain.js';

const profile = {
  ...blankState().profile,
  goal: 'Build muscle',
  experience: 'Intermediate',
  daysPerWeek: 4,
  availableDays: ['Mon', 'Tue', 'Thu', 'Sat'],
  sessionMinutes: 60,
  environment: 'Commercial gym',
  equipment: ['full gym'],
  priorities: ['Balanced']
};
const generated = buildProgram(profile);
const raw = {
  name: 'Weekly Workout Plan: Build Muscle, 4 days/week',
  days: generated.days.map(day => ({
    weekday: day.weekday,
    name: day.name,
    location: 'Commercial gym',
    estimatedMinutes: day.estimatedMinutes,
    exercises: day.exercises.map(exercise => ({
      exerciseId: exercise.exerciseId,
      sourceName: exerciseCatalog[exercise.exerciseId].name,
      sets: exercise.sets.length,
      repMin: exercise.repMin,
      repMax: exercise.repMax,
      targetRir: null,
      restSeconds: exercise.restSeconds,
      notes: null
    }))
  }))
};
const fullWeekday = { Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY', Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY', Sun: 'SUNDAY' };
const workoutBlocks = raw.days.map(day => [
  `${fullWeekday[day.weekday]} — ${day.name.toUpperCase()}`,
  ...day.exercises.flatMap(exercise => [exercise.sourceName, `${exercise.sets} sets x ${exercise.repMin}–${exercise.repMax} reps`, `Rest: ${exercise.restSeconds} sec`])
].join('\n'));
workoutBlocks.splice(2, 0, 'WEDNESDAY — REST');
const sourceText = ['WEEKLY WORKOUT PLAN', '', 'Goal: Build muscle', 'Schedule: 4 days per week', '', ...workoutBlocks, '', 'SUNDAY — REST', '', 'PROGRESSION', 'Use a double-progression approach.'].join('\n');

const target = new URL('../artifacts/import-preview/', import.meta.url);
await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: async () => 'Bench Press 3×8–10' }
  });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('dialog', dialog => dialog.accept());
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }));
let aiRequests = 0;
await page.route('**/api/ai', route => { aiRequests += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: raw }) }); });
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /I ALREADY HAVE A PLAN/ }).click();
async function importHeaderMetrics(eyebrow) {
  const [header, title, firstContent] = await Promise.all([page.locator('.import-plan-screen .detail-header').boundingBox(), page.locator('.import-plan-screen .detail-header > strong').boundingBox(), eyebrow.boundingBox()]);
  assert.ok(Math.abs(title.x + title.width / 2 - (header.x + header.width / 2)) < 1, 'Import plan title is geometrically centered in its header');
  return { header, title, contentGap: firstContent.y - (header.y + header.height) };
}
const composeHeader = await importHeaderMetrics(page.locator('.import-plan-compose > .eyebrow'));
const importScreenText = await page.locator('.import-plan-screen').innerText();
assert.match(importScreenText, /Paste your workout notes[\s\S]*EXAMPLES[\s\S]*Monday: Push[\s\S]*Bench Press 3×8–10[\s\S]*Squat 4×5 @ 2 RIR/);
assert.match(importScreenText, /Any format works — Rook will structure it for you\./);
assert.doesNotMatch(importScreenText, /No special format is required|FAST FORMAT EXAMPLES|Monday - Push|MONDAY — PUSH/);
assert.equal(await page.getByPlaceholder('Paste your workout notes here...').count(), 1);
const createPreview = page.getByRole('button', { name: 'CREATE PREVIEW' });
assert.equal(await createPreview.isDisabled(), true, 'Create Preview starts disabled while notes are empty');
await page.getByRole('button', { name: 'Paste workout notes from clipboard' }).click();
assert.equal(await page.getByPlaceholder('Paste your workout notes here...').inputValue(), 'Bench Press 3×8–10');
assert.equal(await createPreview.isEnabled(), true, 'clipboard text enables Create Preview');
await page.getByPlaceholder('Paste your workout notes here...').fill('   ');
assert.equal(await createPreview.isDisabled(), true, 'whitespace-only notes keep Create Preview disabled');
for (const width of [375, 390, 430, 500]) {
  await page.setViewportSize({ width, height: 844 });
  await page.screenshot({ path: output(`${width}-input.png`), fullPage: false });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.getByPlaceholder(/Paste your workout notes/).fill(sourceText);
const previewStarted = Date.now();
await page.getByRole('button', { name: 'CREATE PREVIEW' }).click();
await page.getByRole('heading', { name: 'Review your plan' }).waitFor();
const reviewHeader = await importHeaderMetrics(page.locator('.import-plan-screen > .eyebrow'));
assert.equal(reviewHeader.contentGap, composeHeader.contentGap, 'compose and review states use the same spacing below the shared header');
assert.deepEqual({ x: reviewHeader.header.x, width: reviewHeader.header.width }, { x: composeHeader.header.x, width: composeHeader.header.width }, 'header placement stays fixed when preview opens');
const previewMilliseconds = Date.now() - previewStarted;
assert.equal(aiRequests, 0, 'clearly structured Notes use the local fast path');
assert.ok(previewMilliseconds < 1500, `structured preview opens quickly (${previewMilliseconds} ms)`);
assert.equal(await page.getByRole('heading', { name: 'Bring your existing workout into Rook.' }).count(), 0);
assert.equal(await page.getByText(/Paste it from Notes/).count(), 0);
assert.equal(await page.getByRole('heading', { name: 'Build Muscle' }).count(), 1);
assert.equal(await page.getByText('4 days/week', { exact: true }).count(), 1);
assert.equal(await page.getByText(/0 RIR/).count(), 0);
assert.equal(await page.locator('.import-day').count(), 4);
assert.match(await page.locator('.import-day').last().locator(':scope > strong').textContent(), /^Sat · LOWER B$/i);
assert.equal(await page.locator('.plan-editor-fields').count(), 0, 'matched exercises stay collapsed in the compact preview');
assert.ok((await page.locator('.plan-editor-exercise').first().boundingBox()).height < 90, 'collapsed exercise cards remain compact');
for (const width of [375, 390, 430, 500]) {
  await page.setViewportSize({ width, height: 844 });
  await page.screenshot({ path: output(`${width}-review.png`), fullPage: false });
}
await page.locator('.plan-editor-summary').first().click();
assert.equal(await page.locator('.plan-editor-fields').count(), 1, 'Edit opens only one exercise form');
await page.locator('.plan-editor-summary').nth(1).click();
assert.equal(await page.locator('.plan-editor-fields').count(), 1, 'opening another card closes the previous editor');
await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
await page.waitForFunction(() => JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete === true);
assert.equal(await page.getByRole('button', { name: 'TODAY', exact: true }).getAttribute('aria-current'), 'page', 'first-time import keeps its intended Today destination');
assert.equal(await page.locator('.plan-ready-notice').count(), 0, 'import does not show the generated-plan-only confirmation');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program.source), 'ai-import');
await page.getByRole('button', { name: 'PROFILE', exact: true }).click(); await page.getByRole('button', { name: 'REPLACE PLAN' }).click(); await page.getByRole('button', { name: /Import a different plan/ }).click(); await page.getByPlaceholder(/Paste your workout notes/).fill(sourceText); await page.getByRole('button', { name: 'CREATE PREVIEW' }).click(); await page.getByRole('heading', { name: 'Review your plan' }).waitFor(); await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
assert.equal(await page.getByRole('button', { name: 'PROFILE', exact: true }).getAttribute('aria-current'), 'page', 'replacement import preserves its administrative Profile destination');
assert.equal(await page.locator('.plan-ready-notice').count(), 0, 'replacement import does not borrow the generated-plan success state');
assert.deepEqual(errors, [], `preview console remains clean: ${errors.join('; ')}`);
await browser.close();
console.log('Import preview QA passed: compact review hierarchy, normalized display name, preserved schedule, and no invented RIR.');
