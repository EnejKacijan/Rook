import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, exerciseCatalog, isoDay, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/training-restriction-plan/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));

const state = blankState();
state.profile = {
  ...state.profile,
  goal: 'Build muscle',
  experience: 'Intermediate',
  daysPerWeek: 3,
  availableDays: ['Mon', 'Wed', 'Fri'],
  sessionMinutes: 60,
  environment: 'Commercial gym',
  equipment: ['full gym'],
  onboardingComplete: true,
};
state.program = buildProgram(state.profile);
state.program.source = 'imported';
state.selectedDay = weekday();
state.selectedDate = isoDay();
const day = state.program.days[0];
const target = day.exercises[0];
target.exerciseId = 'leg-press';
target.importedName = exerciseCatalog['leg-press'].name;
target.originalImportedName = exerciseCatalog['leg-press'].name;
target.defaultIncrement = exerciseCatalog['leg-press'].increment;
target.restSeconds = exerciseCatalog['leg-press'].restSeconds;
const targetEntryId = target.id;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) }));
await page.route('**/api/ai', route => {
  const request = route.request().postDataJSON();
  if (request?.operation !== 'training-safety') return route.continue();
  const sourceText = String(request.payload?.sourceText || '');
  const quote = 'Leg Press';
  const start = sourceText.indexOf(quote);
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      schemaVersion: 2,
      findings: [{
        kind: 'explicit_avoidance',
        confidence: 0.99,
        evidence: [{ start, end: start + quote.length, quote }],
        targetText: quote,
        minimumRir: null,
        allowedBodyRegion: null,
      }],
      unresolved: [],
    } }),
  });
});

await page.goto(`http://127.0.0.1:4173/?restriction-plan-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
await page.getByText('Training restrictions', { exact: true }).click();
await page.getByRole('textbox', { name: 'Restrictions or clinician limits' }).fill('Avoid Leg Press');
await page.getByRole('button', { name: 'SAVE RESTRICTIONS' }).click();
await page.getByRole('heading', { name: 'This affects your current plan' }).waitFor();
const selector = page.getByRole('combobox', { name: /Plan change for Leg Press/ });
assert.equal(await selector.inputValue(), 'review', 'no plan mutation is preselected');
const replacementOption = selector.locator('option').filter({ hasText: /^Replace with / }).first();
await selector.selectOption(await replacementOption.getAttribute('value'));
assert.match(await selector.locator('option:checked').textContent(), /^Replace with /);
assert.equal(await page.getByRole('button', { name: 'SAVE & APPLY 1 CHANGE' }).count(), 1);
await selector.scrollIntoViewIfNeeded();
await page.screenshot({ path: output('390-reviewed-replacement.png'), fullPage: false });

await page.getByRole('button', { name: 'SAVE & APPLY 1 CHANGE' }).click();
await page.getByRole('heading', { name: 'This affects your current plan' }).waitFor({ state: 'detached' });
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
const applied = stored.program.days[0].exercises.find(exercise => exercise.id === targetEntryId);
assert.notEqual(applied.exerciseId, 'leg-press');
assert.equal(stored.profile.avoid, 'Avoid Leg Press');
assert.equal(stored.program.source, 'imported');
assert.equal(stored.program.version, 2);
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log('Training restriction plan QA passed: imported-plan conflict is reviewed, replaced only after Apply, and keeps its stable plan entry.');
