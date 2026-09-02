import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, exerciseCatalog, isoDay, startWorkout, weekday, WEEKDAYS } from '../src/domain.js';

const outputRoot = new URL('../artifacts/system-polish/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const today = weekday();

function fixture(source = 'ai') {
  const state = blankState();
  const other = WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7];
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, other], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true };
  state.program = buildProgram(state.profile); state.program.source = source; state.selectedDay = today; state.selectedDate = isoDay();
  return state;
}

async function open(state, { width = 390, height = 844, ai = false, coachReply = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: ai, provider: ai ? 'qa' : null }) }));
  if (coachReply) await page.route('**/api/ai', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: coachReply }) }));
  await page.goto(`http://127.0.0.1:4173/?system-polish=${Date.now()}`, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

{
  const state = fixture(); state.coachDraft = 'Remember my left shoulder note';
  const { context, page, errors } = await open(state);
  await page.getByRole('button', { name: 'COACH', exact: true }).click();
  await page.getByText('AI Coach is unavailable. Logging and data-based progression still work locally.', { exact: true }).waitFor();
  assert.equal(await page.locator('.prompt-list button:enabled').count(), 0, 'AI shortcuts are disabled while Coach is unavailable');
  assert.equal(await page.getByRole('button', { name: 'Send message' }).isDisabled(), true);
  assert.equal(await page.getByLabel('Ask Coach').getAttribute('placeholder'), 'Coach unavailable');
  assert.equal(await page.getByLabel('Ask Coach').inputValue(), state.coachDraft, 'the existing draft is preserved');
  await page.screenshot({ path: output('390-coach-unavailable.png'), fullPage: false });
  assert.deepEqual(errors, []); await context.close();
}

{
  const state = fixture('imported'); state.profile.priorities = ['Balanced'];
  const { context, page, errors } = await open(state);
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  assert.equal(await page.getByText('COACHING PREFERENCES', { exact: true }).count(), 1);
  assert.equal(await page.getByText('TRAINING PRIORITIES', { exact: true }).count(), 0);
  assert.equal(await page.getByText('No priority areas selected.', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Used by Coach and future generated plans. Changes don’t update this plan.', { exact: true }).count(), 1);
  await page.screenshot({ path: output('390-imported-profile-preferences.png'), fullPage: false });
  assert.deepEqual(errors, []); await context.close();
}

{
  const state = fixture();
  const { context, page, errors } = await open(state, { width: 340, height: 620 });
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  await page.getByRole('button', { name: /^Environment/ }).click();
  await page.getByRole('button', { name: 'Home gym' }).click();
  const footer = page.locator('.profile-setting-footer'); const button = page.getByRole('button', { name: 'SAVE SETUP' });
  await footer.waitFor(); const [footerBox, viewport] = await Promise.all([footer.boundingBox(), page.evaluate(() => ({ width: innerWidth, height: innerHeight }))]);
  assert.ok(footerBox.x >= 0 && footerBox.x + footerBox.width <= viewport.width + .5, `setup footer fits the narrow viewport: ${JSON.stringify({ footerBox, viewport })}`);
  assert.ok(footerBox.y + footerBox.height <= viewport.height + .5, `setup footer clears the dynamic viewport bottom: ${JSON.stringify({ footerBox, viewport })}`);
  assert.ok((await button.boundingBox()).height >= 48, 'setup action retains its touch target');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 340);
  await page.screenshot({ path: output('340-setup-footer.png'), fullPage: false });
  assert.deepEqual(errors, []); await context.close();
}

{
  let state = fixture(); const template = state.program.days.find(day => day.weekday === today); const active = startWorkout(state, template);
  active.exercises[0].sets[0].completed = true; active.exercises[0].sets[0].weight = null; active.exercises[0].sets[0].reps = 8; state.activeWorkout = active; state = completeWorkout(state);
  const { context, page, errors } = await open(state);
  await page.getByRole('button', { name: 'PROGRESS', exact: true }).click();
  assert.equal(await page.getByText('THIS WEEK', { exact: true }).count(), 1);
  assert.equal(await page.getByText('No weight logged', { exact: true }).count(), 1);
  assert.match(await page.locator('.consistency').getAttribute('aria-label'), /planned sessions completed this week$/);
  await page.locator('.working-weight-row').first().click();
  assert.equal(await page.getByRole('heading', { name: 'Not set yet' }).count(), 1);
  assert.equal(await page.getByText('Log a weight on a completed working set to establish this.', { exact: true }).count(), 1);
  await page.screenshot({ path: output('390-missing-load-detail.png'), fullPage: false });
  assert.deepEqual(errors, []); await context.close();
}

{
  const state = fixture(); const source = state.program.days.find(day => day.weekday === today); const kept = source.exercises.slice(0, Math.max(1, source.exercises.length - 1));
  const action = { type: 'adapt-today', label: 'APPLY TO TODAY', targetDate: isoDay(), programDayId: source.id, exerciseIds: kept.map(item => item.exerciseId), setTargets: kept.map(item => ({ exerciseId: item.exerciseId, sets: item.sets.length })), skippedExerciseIds: source.exercises.slice(kept.length).map(item => item.exerciseId), requestedMinutes: 35, estimatedMinutes: 35, minutes: 35 };
  const { context, page, errors } = await open(state, { ai: true, coachReply: { text: 'I prepared a shorter version for review.', action } });
  await page.getByRole('button', { name: 'COACH', exact: true }).click(); await page.getByLabel('Ask Coach').fill('Adapt today to 35 minutes.'); await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'APPLY TO TODAY' }).waitFor();
  const skippedName = exerciseCatalog[action.skippedExerciseIds[0]].name;
  assert.equal(await page.getByText(`Skip today: ${skippedName}`, { exact: true }).count(), 1, 'direct apply names the removed exercise');
  await page.getByRole('button', { name: 'APPLY TO TODAY' }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  await page.screenshot({ path: output('390-coach-applied-with-undo.png'), fullPage: false });
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByRole('heading', { name: 'Changes undone' }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.equal(stored.todayAdaptation, null, 'Undo restores the prior occurrence state');
  assert.equal(stored.conversations.at(-1).actionResult.status, 'undone');
  assert.deepEqual(errors, []); await context.close();
}

await browser.close();
console.log('System polish QA passed: Coach availability and undo, weekly Progress semantics, missing load, imported-plan preferences, and narrow setup footer are correct.');
