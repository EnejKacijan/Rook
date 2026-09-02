import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const artifactRoot = new URL('../artifacts/plan-reorder/', import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const state = createReturningUserFixture(3);
state.activeWorkout = null;
const originalDays = [...state.program.days]
  .sort((a, b) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(a.weekday) - ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(b.weekday));
const originalWeekdays = originalDays.map(day => day.weekday);
const originalDayIds = originalDays.map(day => day.id);
const firstExerciseIds = originalDays[0].exercises.map(exercise => exercise.id);

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
await context.addInitScript(value => {
  localStorage.setItem('lift-v2-state', JSON.stringify(value));
}, state);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.route('**/api/ai/status', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ available: false }),
}));
await page.goto(`http://127.0.0.1:4173/?plan-reorder-qa=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
});
await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
await page.getByRole('button', { name: /Edit plan/ }).click();
await page.getByRole('heading', { name: 'Edit your plan' }).waitFor();
await page.screenshot({
  path: fileURLToPath(new URL('edit-plan-reorder-390.png', artifactRoot)),
  fullPage: false,
});

assert.equal(
  await page.getByText('Press and hold a workout or exercise to reorder.').count(),
  1,
  'reorder instruction is shown once rather than repeated on every row',
);
assert.equal(
  await page.locator('[data-reorder-kind="exercise"]').count() > 0,
  true,
  'exercise summaries expose a long-press drag surface',
);
assert.equal(
  await page.locator('[data-reorder-kind="workout"]').count(),
  originalDays.length,
  'each workout exposes a dedicated drag surface outside its input',
);

const firstDay = page.locator('.import-day').first();
const moveExerciseLater = firstDay.locator('.exercise-reorder-a11y').first().getByRole('button', { name: 'MOVE LATER' });
await moveExerciseLater.focus();
await page.keyboard.press('Enter');
let draftExerciseIds = await firstDay.locator('.plan-editor-exercise').evaluateAll(cards =>
  cards.map(card => card.id.replace('import-exercise-', '')),
);
assert.deepEqual(
  draftExerciseIds.slice(0, 2),
  [firstExerciseIds[1], firstExerciseIds[0]],
  'fallback control uses the same local reorder mutation',
);
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
assert.deepEqual(
  stored.program.days.find(day => day.id === originalDayIds[0]).exercises.map(exercise => exercise.id),
  firstExerciseIds,
  'reorder remains draft-only before Save',
);

const moveWorkoutLast = page.locator('.import-day').first().locator('.plan-workout-reorder-bar .plan-reorder-a11y')
  .getByRole('button', { name: 'MOVE LAST' });
await moveWorkoutLast.focus();
await page.keyboard.press('Enter');
const draftWeekdayLabels = await page.locator('.plan-workout-drag-surface > span').allTextContents();
assert.deepEqual(
  draftWeekdayLabels,
  originalWeekdays.map(day => `${day.toUpperCase()} WORKOUT`),
  'weekday slots stay fixed after workout reorder',
);

await page.getByRole('button', { name: 'SAVE CHANGES' }).click();
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
const savedDays = [...stored.program.days]
  .sort((a, b) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(a.weekday) - ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(b.weekday));
assert.deepEqual(savedDays.map(day => day.weekday), originalWeekdays);
assert.deepEqual(savedDays.map(day => day.id), [...originalDayIds.slice(1), originalDayIds[0]]);
assert.deepEqual(
  savedDays.at(-1).exercises.slice(0, 2).map(exercise => exercise.id),
  [firstExerciseIds[1], firstExerciseIds[0]],
  'exercise order travels with the moved workout identity',
);
assert.deepEqual(errors, []);

await context.close();

const dragState = createReturningUserFixture(3);
dragState.activeWorkout = null;
const dragContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
await dragContext.addInitScript(value => {
  localStorage.setItem('lift-v2-state', JSON.stringify(value));
}, dragState);
const dragPage = await dragContext.newPage();
const dragErrors = [];
dragPage.on('pageerror', error => dragErrors.push(error.message));
await dragPage.route('**/api/ai/status', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ available: false }),
}));
await dragPage.goto(`http://127.0.0.1:4173/?plan-reorder-drag-qa=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
});
await dragPage.getByRole('button', { name: 'PROFILE', exact: true }).click();
await dragPage.getByRole('button', { name: /Edit plan/ }).click();
await dragPage.getByRole('heading', { name: 'Edit your plan' }).waitFor();
const dragDay = dragPage.locator('.import-day').first();
const dragCards = dragDay.locator('.plan-editor-exercise');
const dragIdsBefore = await dragCards.evaluateAll(cards => cards.map(card => card.id));
const sourceSummary = dragCards.nth(0).locator('.plan-editor-summary');
const nextSummary = dragCards.nth(1).locator('.plan-editor-summary');
await sourceSummary.scrollIntoViewIfNeeded();
const sourceBox = await sourceSummary.boundingBox();
const nextBox = await nextSummary.boundingBox();
assert.ok(sourceBox && nextBox, 'drag targets have measurable geometry');
await dragPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
await dragPage.mouse.down();
await dragPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 + 6, { steps: 2 });
await dragPage.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height - 2, { steps: 8 });
assert.equal(await dragPage.locator('.plan-reorder-preview').count(), 1, 'drag preview appears after intentional movement');
assert.equal(
  await dragCards.nth(0).evaluate(card => getComputedStyle(card).visibility),
  'hidden',
  'the source card becomes a real empty footprint while dragging',
);
assert.notEqual(
  await dragCards.nth(1).evaluate(card => getComputedStyle(card).transform),
  'none',
  'crossed sibling moves live before the exercise is dropped',
);
await dragPage.screenshot({
  path: fileURLToPath(new URL('exercise-live-displacement.png', artifactRoot)),
  fullPage: false,
});
await dragPage.mouse.up();
await dragPage.waitForTimeout(50);
const dragIdsAfter = await dragCards.evaluateAll(cards => cards.map(card => card.id));
assert.notDeepEqual(dragIdsAfter, dragIdsBefore, 'desktop pointer drag commits after crossing a valid block boundary');
assert.deepEqual([...dragIdsAfter].sort(), [...dragIdsBefore].sort(), 'pointer drag preserves every stable exercise entry ID');
assert.ok(dragIdsAfter.indexOf(dragIdsBefore[0]) > 0, 'dragged source moves later in the workout');
assert.equal(await dragPage.locator('.plan-editor-fields').count(), 0, 'drop suppresses the summary click');
assert.equal(
  await dragCards.nth(0).evaluate(card => card.style.transform),
  '',
  'transient sibling transforms are cleared after drop',
);

const workoutSections = dragPage.locator('.import-day');
const workoutIdsBeforeCancel = await workoutSections.evaluateAll(sections =>
  sections.map(section => section.getAttribute('data-reorder-id')),
);
const workoutSource = workoutSections.nth(0).locator('.plan-workout-drag-surface');
const workoutTarget = workoutSections.nth(1).locator('.plan-workout-drag-surface');
await workoutSource.scrollIntoViewIfNeeded();
const workoutSourceBox = await workoutSource.boundingBox();
const workoutTargetBox = await workoutTarget.boundingBox();
assert.ok(workoutSourceBox && workoutTargetBox, 'workout drag targets have measurable geometry');
await dragPage.mouse.move(
  workoutSourceBox.x + workoutSourceBox.width / 2,
  workoutSourceBox.y + workoutSourceBox.height / 2,
);
await dragPage.mouse.down();
await dragPage.mouse.move(
  workoutSourceBox.x + workoutSourceBox.width / 2,
  workoutSourceBox.y + workoutSourceBox.height / 2 + 6,
  { steps: 2 },
);
await dragPage.mouse.move(
  workoutTargetBox.x + workoutTargetBox.width / 2,
  workoutTargetBox.y + workoutTargetBox.height - 2,
  { steps: 8 },
);
assert.notEqual(
  await workoutSections.nth(1).evaluate(section => getComputedStyle(section).transform),
  'none',
  'a neighboring workout section yields live before drop',
);
await dragPage.keyboard.press('Escape');
await dragPage.waitForTimeout(50);
assert.deepEqual(
  await workoutSections.evaluateAll(sections =>
    sections.map(section => section.getAttribute('data-reorder-id')),
  ),
  workoutIdsBeforeCancel,
  'Escape cancels a live workout reorder without mutating the draft',
);
assert.equal(
  await dragPage.locator('.plan-reorder-preview').count(),
  0,
  'cancel removes the drag overlay',
);
assert.equal(
  await workoutSections.nth(1).evaluate(section => section.style.transform),
  '',
  'cancel clears transient workout displacement',
);
assert.deepEqual(dragErrors, []);
await dragContext.close();

const touchState = createReturningUserFixture(3);
touchState.activeWorkout = null;
const touchContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: 'block',
});
await touchContext.addInitScript(value => {
  localStorage.setItem('lift-v2-state', JSON.stringify(value));
}, touchState);
const touchPage = await touchContext.newPage();
await touchPage.route('**/api/ai/status', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ available: false }),
}));
await touchPage.goto(`http://127.0.0.1:4173/?plan-reorder-touch-qa=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
});
await touchPage.getByRole('button', { name: 'PROFILE', exact: true }).click();
await touchPage.getByRole('button', { name: /Edit plan/ }).click();
await touchPage.getByRole('heading', { name: 'Edit your plan' }).waitFor();
const touchCards = touchPage.locator('.import-day').first().locator('.plan-editor-exercise');
const touchIdsBefore = await touchCards.evaluateAll(cards => cards.map(card => card.id));
const touchSource = touchCards.first().locator('.plan-editor-summary');
const touchTarget = touchCards.nth(1).locator('.plan-editor-summary');
await touchSource.scrollIntoViewIfNeeded();
const touchSourceBox = await touchSource.boundingBox();
const touchTargetBox = await touchTarget.boundingBox();
const fireTouch = async (type, x, y) => touchSource.evaluate((element, payload) => {
  const touch = new Touch({
    identifier: 42,
    target: element,
    clientX: payload.x,
    clientY: payload.y,
    screenX: payload.x,
    screenY: payload.y,
    pageX: payload.x + window.scrollX,
    pageY: payload.y + window.scrollY,
  });
  const active = payload.type === 'touchend' || payload.type === 'touchcancel' ? [] : [touch];
  element.dispatchEvent(new TouchEvent(payload.type, {
    bubbles: true,
    cancelable: true,
    touches: active,
    targetTouches: active,
    changedTouches: [touch],
  }));
}, { type, x, y });
await fireTouch('touchstart', touchSourceBox.x + 24, touchSourceBox.y + touchSourceBox.height / 2);
await touchPage.waitForTimeout(380);
assert.equal(await touchPage.locator('.plan-reorder-preview').count(), 1, '350 ms stationary touch hold activates reorder');
await fireTouch('touchmove', touchTargetBox.x + 24, touchTargetBox.y + touchTargetBox.height - 2);
await fireTouch('touchend', touchTargetBox.x + 24, touchTargetBox.y + touchTargetBox.height - 2);
await touchPage.waitForTimeout(50);
const touchIdsAfter = await touchCards.evaluateAll(cards => cards.map(card => card.id));
assert.notDeepEqual(touchIdsAfter, touchIdsBefore, 'touch long-press drag changes block order');
assert.deepEqual([...touchIdsAfter].sort(), [...touchIdsBefore].sort(), 'touch drag preserves stable IDs');
assert.equal(await touchPage.locator('.plan-editor-fields').count(), 0, 'touch drop does not also open the exercise editor');
await touchContext.close();
await browser.close();
console.log('Plan reorder QA passed: drag surfaces, accessible controls, draft persistence, stable workout identity, and fixed weekday slots are correct.');
