import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const sourceDays = [
  ['Mon', 'Upper A', [['Barbell Bench Press', 3, 8, 10], ['Chest Supported Row', 3, 8, 12], ['Overhead Press', 3, 8, 10], ['Lat Pulldown', 3, 10, 12], ['Dumbbell Lateral Raise', 3, 12, 15], ['Triceps Pushdown', 2, 10, 15]]],
  ['Tue', 'Lower A', [['Back Squat', 3, 6, 8], ['Romanian Deadlift', 3, 8, 10], ['Leg Press', 3, 10, 12], ['Leg Curl', 3, 10, 15], ['Standing Calf Raise', 3, 12, 15]]],
  ['Thu', 'Upper B', [['Incline Dumbbell Press', 3, 8, 10], ['Pull-Up', 3, 6, 10], ['Seated Cable Row', 3, 8, 12], ['Machine Shoulder Press', 3, 8, 10], ['Cable Lateral Raise', 3, 12, 15], ['Dumbbell Curl', 2, 10, 15]]],
  ['Sat', 'Lower B', [['Deadlift', 3, 5, 6], ['Bulgarian Split Squat', 3, 8, 10], ['Hack Squat', 3, 8, 12], ['Seated Leg Curl', 3, 10, 15], ['Seated Calf Raise', 3, 12, 15]]]
];
const suggestedIds = {
  'Chest Supported Row': 'one-arm-dumbbell-row',
  'Overhead Press': 'barbell-overhead-press',
  'Incline Dumbbell Press': 'dumbbell-bench-press',
  'Machine Shoulder Press': 'machine-chest-press'
};
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const knownIds = {
  'Barbell Bench Press': 'barbell-bench-press', 'Lat Pulldown': 'lat-pulldown', 'Dumbbell Lateral Raise': 'lateral-raise', 'Triceps Pushdown': 'cable-triceps-pressdown',
  'Back Squat': 'back-squat', 'Romanian Deadlift': 'romanian-deadlift', 'Leg Press': 'leg-press', 'Leg Curl': 'leg-curl', 'Standing Calf Raise': 'calf-raise',
  'Pull-Up': 'pull-up', 'Seated Cable Row': 'seated-cable-row', 'Cable Lateral Raise': 'cable-lateral-raise', 'Dumbbell Curl': 'dumbbell-curl',
  Deadlift: 'deadlift', 'Bulgarian Split Squat': 'bulgarian-split-squat', 'Hack Squat': 'hack-squat', 'Seated Leg Curl': 'seated-leg-curl', 'Seated Calf Raise': 'seated-calf-raise'
};
const raw = { name: 'Weekly Workout Plan: Build Muscle, 4 days/week', days: sourceDays.map(([weekday, name, exercises]) => ({ weekday, name, location: 'Commercial gym', estimatedMinutes: 60, exercises: exercises.map(([sourceName, sets, repMin, repMax]) => ({ exerciseId: suggestedIds[sourceName] || knownIds[sourceName] || slug(sourceName), sourceName, sets, repMin, repMax, targetRir: null, restSeconds: null, notes: null, weightKg: null, setWeightsKg: null })) })) };
raw.days[0].exercises[0].weightKg = 999; raw.days[0].exercises[1].setWeightsKg = [999, 999, 999];
let sourceText = sourceDays.flatMap(([weekday, name, exercises]) => [`${weekday} · ${name}`, ...exercises.map(([exercise, sets, min, max]) => `${exercise} — ${sets} × ${min}–${max}`)]).join('\n');
sourceText = sourceText.replace('Barbell Bench Press — 3 × 8–10', 'Barbell Bench Press — 3 × 8–10 @ 80 kg').replace('Chest Supported Row — 3 × 8–12', 'Chest Supported Row — 3 × 8–12 · set 1 60kg, set 2 62.5kg, set 3 60kg');
const expected = sourceDays.flatMap(([, , exercises]) => exercises.map(([name]) => name));

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage(); const errors = [];
page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('dialog', dialog => dialog.accept());
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }));
await page.route('**/api/ai', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: raw }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Already have a plan/i }).click(); await page.getByPlaceholder(/Paste your workout notes/).fill(sourceText); await page.getByRole('button', { name: 'CREATE PREVIEW' }).click(); await page.getByRole('heading', { name: 'Review your plan' }).waitFor();
const previewNames = await page.locator('.import-exercise .plan-editor-heading > strong').allTextContents();
assert.deepEqual(previewNames, expected, 'preview preserves every source exercise in source order'); assert.equal(await page.getByText(/0 RIR/).count(), 0); await page.getByRole('button', { name: 'Edit Barbell Bench Press' }).click(); const benchCard = page.locator('.import-exercise').filter({ hasText: 'Barbell Bench Press' }).first(); await benchCard.getByRole('button', { name: 'EDIT', exact: true }).click(); assert.deepEqual(await page.getByRole('spinbutton', { name: /Kilograms for Barbell Bench Press set/ }).evaluateAll(inputs => inputs.map(input => input.value)), ['80', '80', '80'], 'preview exposes the explicit common kilogram load on demand'); await page.getByRole('button', { name: /^(Edit|Review) Chest Supported Row$/ }).click(); const rowCard = page.locator('.import-exercise').filter({ hasText: 'Chest Supported Row' }).first(); await rowCard.getByRole('button', { name: 'EDIT', exact: true }).click(); assert.deepEqual(await page.getByRole('spinbutton', { name: /Kilograms for Chest Supported Row set/ }).evaluateAll(inputs => inputs.map(input => input.value)), ['60', '62.5', '60'], 'preview exposes explicit per-set loads on demand');
const overheadPressCard = page.locator('.plan-editor-exercise').filter({ hasText: 'Overhead Press' }).first(); assert.equal(await overheadPressCard.evaluate(element => element.classList.contains('needs-review')), false, 'Overhead Press is a recognized catalog exercise');
const uncertainCount = await page.locator('.plan-editor-exercise.needs-review').count(); if (uncertainCount) { await page.getByRole('button', { name: 'KEEP ALL AS CUSTOM' }).click(); assert.equal(await page.locator('.plan-editor-exercise.needs-review').count(), 0, 'one bulk action confirms every remaining source name'); }
await page.getByRole('button', { name: 'USE THIS PLAN' }).click(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete);
let persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); const persistedNames = persisted.program.days.flatMap(day => day.exercises.map(exercise => exercise.originalImportedName));
assert.deepEqual(persistedNames, expected, 'saved program preserves source identity'); assert.deepEqual(persisted.program.days.map(day => day.weekday), sourceDays.map(([day]) => day), 'saved program preserves source day order');
assert.equal(persisted.program.days[2].exercises.find(exercise => exercise.originalImportedName === 'Machine Shoulder Press').exerciseId, 'machine-shoulder-press');
assert.equal(persisted.program.days[0].exercises.find(exercise => exercise.originalImportedName === 'Chest Supported Row').exerciseId, 'chest-supported-row');

await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
await page.getByRole('button', { name: 'Replace plan' }).click();
await page.getByRole('button', { name: /Import a different plan/ }).click();
await page.getByPlaceholder(/Paste your workout notes/).fill(sourceText);
await page.getByRole('button', { name: 'CREATE PREVIEW' }).click();
await page.getByRole('heading', { name: 'Review your plan' }).waitFor();
await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
assert.equal(await page.getByRole('button', { name: 'TODAY', exact: true }).getAttribute('aria-current'), 'page', 'replacement import returns to Today');
assert.equal(await page.locator('.plan-ready-notice').count(), 0, 'import does not show the generated-plan-only confirmation');

for (const [weekday, , exercises] of sourceDays) {
  await page.getByRole('button', { name: new RegExp(`^${weekday} `) }).click();
  assert.deepEqual(await page.locator('.exercise-preview strong').allTextContents(), exercises.map(([name]) => name), `${weekday} Today names match source`);
}
await page.getByRole('button', { name: /^Mon / }).click(); await page.getByRole('button', { name: 'START WORKOUT' }).click();
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.map(exercise => exercise.originalImportedName)), sourceDays[0][2].map(([name]) => name));
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.slice(0, 2).map(exercise => exercise.sets.map(set => set.weight))), [[80, 80, 80], [60, 62.5, 60]], 'active workout preserves common and per-set kilograms');
assert.equal(await page.locator('.exercise-heading h1').textContent(), 'Barbell Bench Press'); assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).inputValue(), '80'); assert.equal((await page.locator('.up-next').textContent()).includes('Chest Supported Row'), true);
await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click(); assert.equal(await page.locator('.exercise-heading h1').textContent(), 'Barbell Bench Press');
persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.deepEqual(persisted.activeWorkout.exercises.map(exercise => exercise.originalImportedName), sourceDays[0][2].map(([name]) => name), 'reload preserves active custom/imported identities');
await page.getByRole('button', { name: /^Overhead Press/ }).click(); assert.equal(await page.locator('.exercise-heading h1').textContent(), 'Overhead Press'); await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('30'); await page.getByRole('button', { name: 'Complete set 1' }).click(); await page.getByRole('button', { name: 'Finish', exact: true }).click(); await page.getByRole('button', { name: 'FINISH ANYWAY' }).click(); await page.getByRole('button', { name: 'DONE' }).click(); await page.getByRole('button', { name: 'PROGRESS' }).click(); assert.equal(await page.getByText('Overhead Press', { exact: true }).count(), 1, 'custom imported exercise appears in Progress after logging');
assert.deepEqual(errors, [], `browser console remains clean: ${errors.join('; ')}`); await browser.close();
console.log('Import fidelity QA passed: source → preview → save → Today → Active Workout → reload retained all 22 exercise identities.');
