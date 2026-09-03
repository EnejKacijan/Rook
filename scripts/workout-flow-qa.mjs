import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout } from '../src/domain.js';

const target = new URL('../artifacts/workout-flow/', import.meta.url);
await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

function activeFixture() {
  const state = blankState();
  state.profile = {
    ...state.profile,
    name: 'Alex',
    goal: 'Build muscle',
    experience: 'Intermediate',
    daysPerWeek: 2,
    availableDays: ['Tue', 'Sat'],
    sessionMinutes: 75,
    environment: 'Commercial gym',
    equipment: ['full gym'],
    priorities: ['Balanced'],
    onboardingComplete: true
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = state.program.days[0].weekday;
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.exercises[0].importedName = 'Single-Arm Incline Dumbbell Bench Press';
  return state;
}

async function openWorkout(state = activeFixture(), width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  await context.addInitScript(value => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value)); }, state);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
  return { context, page, errors };
}

async function snap(page, name, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.screenshot({ path: output(`${width}-${name}.png`), fullPage: false });
}

async function skipRest(page) {
  const timer = page.locator('.rest-timer');
  if (await timer.isVisible()) await timer.getByRole('button', { name: 'SKIP' }).click();
}

async function completeCurrentExercise(page) {
  while (await page.getByRole('button', { name: /^Complete set / }).count()) {
    const activeRow = page.locator('.set-row.set-active').first();
    const activeCheck = activeRow.locator('button.check');
    if (await activeCheck.isDisabled()) {
      const weight = activeRow.getByRole('spinbutton', { name: /Weight in/ });
      if (await weight.count()) await weight.fill('20');
    }
    const current = page.locator('.set-row:not(.set-done) button.check:not([disabled])');
    if (!(await current.count())) break;
    await current.first().click();
    await skipRest(page);
  }
}

// A one-set exercise advances cleanly without inventing additional work.
{
  const state = activeFixture();
  state.activeWorkout.exercises = [state.activeWorkout.exercises[0]];
  state.activeWorkout.exercises[0].sets = [state.activeWorkout.exercises[0].sets[0]];
  const { context, page, errors } = await openWorkout(state, 320);
  assert.match(await page.locator('.workout-header small').innerText(), /0 \/ 1 set · \d{2}:\d{2}/);
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('135');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await skipRest(page);
  assert.match(await page.locator('.workout-header small').innerText(), /1 \/ 1 set · \d{2}:\d{2}/);
  assert.equal(await page.locator('.set-row').count(), 1, 'completing a one-set exercise does not add a set implicitly');
  assert.equal(await page.getByRole('button', { name: 'FINISH WORKOUT' }).getAttribute('class').then(value => value.includes('primary')), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, [], `one-set console errors: ${errors.join('; ')}`);
  await context.close();
}

// Sequential sets, persistence, extra sets, direct next navigation, and full completion.
{
  const { context, page, errors } = await openWorkout();
  const activeExerciseName = await page.locator('.exercise-heading h1').innerText();
  assert.equal(await page.locator('.workout-warmup-toggle small').innerText(), `For ${activeExerciseName}`, 'collapsed warm-up derives its target name from the current active exercise entry');
  for (const width of [375, 390, 430, 500]) await snap(page, 'first-exercise', width);
  await page.setViewportSize({ width: 390, height: 844 });

  const heading = await page.locator('.exercise-heading p').boundingBox();
  const labels = await page.locator('.set-labels').boundingBox();
  assert.ok(labels.y - (heading.y + heading.height) <= 35, 'set controls sit close to exercise metadata');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).getAttribute('placeholder'), 'Enter weight');
  assert.equal(await page.getByRole('button', { name: 'Complete set 1' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Complete set 2' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Complete set 3' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'NEXT EXERCISE →' }).getAttribute('class').then(value => value.includes('secondary')), true, 'Next Exercise stays secondary while prescribed sets are incomplete');

  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('20');
  assert.equal(await page.getByRole('button', { name: 'Complete set 1' }).isEnabled(), true);
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 2/ }).inputValue(), '20', 'first entered load fills the next empty set');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 3/ }).inputValue(), '20', 'first entered load fills every remaining empty set');
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('22.5');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 2/ }).inputValue(), '22.5', 'changing the source set updates the next auto-filled set');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 3/ }).inputValue(), '22.5', 'changing the source set updates the full auto-filled chain');
  await page.getByRole('spinbutton', { name: /Weight in kg for set 2/ }).fill('17.5');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).inputValue(), '22.5', 'editing an individual set does not overwrite another set');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 3/ }).inputValue(), '17.5', 'an auto-filled later set follows the newly customized previous set');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  assert.equal(await page.getByRole('button', { name: 'Complete set 2' }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Complete set 3' }).isDisabled(), true);
  assert.equal(await page.locator('.rest-timer').isVisible(), true);
  await snap(page, 'after-set-1');
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('25');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 2/ }).inputValue(), '17.5', 'later edits do not cascade over a customized set');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 3/ }).inputValue(), '17.5', 'the following auto-filled set continues to follow its immediate customized predecessor');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
  assert.equal(await page.locator('.workout-warmup-toggle small').innerText(), `For ${activeExerciseName}`, 'reload cannot restore a stale cached warm-up target name');
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).inputValue(), '25');
  assert.equal(await page.getByRole('button', { name: 'Complete set 2' }).isEnabled(), true);
  assert.equal(await page.locator('.rest-timer').isVisible(), true, 'active rest timer survives reload');
  await page.getByRole('button', { name: 'Reopen set 1' }).click();
  assert.equal(await page.getByRole('button', { name: 'Complete set 1' }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Complete set 2' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await skipRest(page);

  await page.getByRole('button', { name: '+ ADD SET' }).click();
  const extraRemove = page.getByRole('button', { name: /^Remove extra set / });
  await extraRemove.waitFor();
  assert.equal(await extraRemove.count(), 1);
  assert.equal(await page.getByRole('spinbutton', { name: /Weight in kg for set 4/ }).inputValue(), '17.5', 'a new set inherits the immediately previous set rather than the first set');
  await snap(page, 'extra-set');
  await extraRemove.click();
  await extraRemove.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: /^Remove extra set / }).count(), 0);
  await page.getByRole('button', { name: '+ ADD SET' }).click();
  await completeCurrentExercise(page);
  assert.equal(await page.locator('.set-row.set-done').count(), await page.locator('.set-row').count());
  assert.equal(await page.getByRole('button', { name: 'NEXT EXERCISE →' }).getAttribute('class').then(value => value.includes('primary')), true, 'Next Exercise becomes primary when prescribed sets are complete');
  const totalBeforeExtra = Number((await page.locator('.workout-header small').innerText()).match(/\/ (\d+) sets/)[1]);
  await page.getByRole('button', { name: '+ ADD SET' }).click();
  await page.waitForFunction(
    expected => document.querySelector('.workout-header small')?.textContent.includes(`/ ${expected} sets ·`),
    totalBeforeExtra + 1,
  );
  assert.match(await page.locator('.workout-header small').innerText(), new RegExp(`/ ${totalBeforeExtra + 1} sets ·`), 'an added working set immediately updates the workout total');
  assert.equal(await page.locator('.set-row').last().getAttribute('data-set-state'), 'ready', 'an added set becomes the current actionable set after the prescribed work is complete');
  assert.equal(await page.getByRole('button', { name: 'NEXT EXERCISE →' }).getAttribute('class').then(value => value.includes('secondary')), true, 'an unfinished added set makes the exercise incomplete again');
  await completeCurrentExercise(page);
  assert.equal(await page.getByRole('button', { name: 'NEXT EXERCISE →' }).getAttribute('class').then(value => value.includes('primary')), true, 'completing the added set restores the ready exercise state');
  await snap(page, 'all-first-exercise-sets');

  const nextName = (await page.locator('.up-next button').first().locator('span').textContent()).trim();
  assert.equal(await page.locator('.workout-primary-action small').count(), 0, 'next exercise name is not duplicated below the primary action');
  assert.equal(await page.locator('.up-next').textContent().then(text => text.includes('Single-Arm Incline Dumbbell Bench Press')), false);
  await page.getByRole('button', { name: 'NEXT EXERCISE →' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('.exercise-heading h1').textContent(), nextName);
  await snap(page, 'second-exercise');
  const firstCompletedSets = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].sets.filter(set => set.completed).length);
  assert.equal(await page.getByRole('button', { name: '← PREVIOUS EXERCISE' }).count(), 1, 'later exercises provide a clear way back');
  await page.getByRole('button', { name: '← PREVIOUS EXERCISE' }).click();
  assert.equal(await page.getByRole('button', { name: '← PREVIOUS EXERCISE' }).count(), 0, 'the previous action is hidden on the first exercise');
  assert.equal(await page.locator('.set-row.set-done').count(), firstCompletedSets, 'returning preserves completed sets');
  await page.getByRole('button', { name: 'NEXT EXERCISE →' }).click();
  assert.equal(await page.locator('.exercise-heading h1').textContent(), nextName);

  while (true) {
    await completeCurrentExercise(page);
    const next = page.getByRole('button', { name: 'NEXT EXERCISE →' });
    if (await next.count()) await next.click();
    else break;
  }
  await snap(page, 'ready-to-finish');
  await page.getByRole('button', { name: 'FINISH WORKOUT' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('heading', { name: 'Workout complete' }).waitFor();
  await snap(page, 'full-completion');
  assert.match(await page.locator('.stat-grid').textContent(), /\d+ setsLOGGED/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-funnel-events-v1')).some(event => event.name === 'first_workout_completed')), true, 'first completed workout closes the measurable activation funnel');
  assert.deepEqual(errors, [], `full-flow console errors: ${errors.join('; ')}`);
  await context.close();
}

// Incomplete exercise navigation keeps skipped sets incomplete.
{
  const { context, page, errors } = await openWorkout();
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('20');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  const originalId = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].id);
  await page.getByRole('button', { name: 'NEXT EXERCISE →' }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').textContent(), /sets are still incomplete/);
  const dragHandle = page.getByRole('button', { name: 'Drag down or tap to close' });
  assert.equal(await dragHandle.count(), 1, 'incomplete-exercise confirmation has one functional drag handle');
  await snap(page, 'incomplete-next-confirmation');
  const sheet = page.locator('.workout-confirm'); const initialSheetBox = await sheet.boundingBox(); const titleBox = await page.getByRole('heading', { name: /still incomplete/ }).boundingBox();
  await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + 18, { steps: 3 });
  await page.waitForTimeout(90);
  assert.notEqual(await sheet.evaluate(element => getComputedStyle(element).transform), 'none', 'the full sheet follows a drag started away from the handle');
  await page.mouse.up();
  await page.waitForTimeout(220);
  assert.equal(await page.getByRole('dialog').count(), 1, 'a short surface drag springs back');
  assert.ok(Math.abs((await sheet.boundingBox()).y - initialSheetBox.y) < 1, 'the sheet returns to its resting position');
  const actionBox = await page.getByRole('button', { name: 'RETURN TO EXERCISE' }).boundingBox();
  await page.mouse.move(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(actionBox.x + actionBox.width / 2, actionBox.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(id => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; return active.exerciseIndex === 0 && active.exercises[0].id === id; }, originalId), true, 'dragging down returns to the current exercise without changing workout state');
  await page.locator('.workout-primary-action .button').click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(40);
  await page.getByRole('button', { name: 'RETURN TO EXERCISE' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.exercise-heading').getAttribute('data-test-id'), null);
  await page.getByRole('button', { name: 'NEXT EXERCISE →' }).click();
  await page.getByRole('button', { name: 'SKIP INCOMPLETE SETS' }).click();
  const persisted = await page.evaluate(id => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; const first = active.exercises.find(item => item.id === id); return { index: active.exerciseIndex, completed: first.sets.map(set => set.completed) }; }, originalId);
  assert.equal(persisted.index, 1);
  assert.deepEqual(persisted.completed.slice(0, 3), [true, false, false]);
  assert.equal(await page.locator('.rest-timer').count(), 0, 'changing exercise clears the prior rest timer');
  assert.deepEqual(errors, [], `incomplete-next console errors: ${errors.join('; ')}`);
  await context.close();
}

// Header Finish confirms and records a truthful early ending.
{
  const { context, page, errors } = await openWorkout();
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('20');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await skipRest(page);
  const planned = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.flatMap(item => item.sets).length);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Drag down or tap to close' }).count(), 1, 'early-finish confirmation uses the same drag interaction');
  assert.match(await dialog.textContent(), new RegExp(`1 of ${planned} sets is complete[\\s\\S]*Only completed sets will be logged`));
  await snap(page, 'early-finish-confirmation');
  await page.getByRole('button', { name: 'FINISH ANYWAY' }).click();
  await page.getByRole('heading', { name: 'Workout ended early' }).waitFor();
  assert.match(await page.locator('.stat-grid').textContent(), new RegExp(`1 of ${planned} setsCOMPLETED`));
  await snap(page, 'early-completion');
  assert.deepEqual(errors, [], `early-finish console errors: ${errors.join('; ')}`);
  await context.close();
}

await browser.close();
console.log('Workout flow QA passed: sequence, editing, persistence, extras, navigation, confirmations, full/early completion, and 375–500 px screenshots.');
