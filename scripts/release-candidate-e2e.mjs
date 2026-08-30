import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { exerciseName, isoDay, weekday } from '../src/domain.js';

const root = new URL('../artifacts/release-candidate/', import.meta.url); await mkdir(root, { recursive: true });
const output = name => fileURLToPath(new URL(name, root));
const state = createReturningUserFixture(2); const currentWeekday = weekday(); const scheduledToday = state.program.days.find(item => item.weekday === currentWeekday); const day = scheduledToday || state.program.days[0];
if (!scheduledToday) { const replacedWeekday = day.weekday; day.weekday = currentWeekday; state.profile.availableDays = state.profile.availableDays.map(item => item === replacedWeekday ? currentWeekday : item); }
state.program.rotationStartDate = null;
for (const workout of state.workouts) for (const exercise of workout.exercises) exercise.sets.forEach(set => { set.completed = true; set.weight = 50; set.reps = exercise.repMax; set.rir = exercise.targetRir; });
state.selectedDay = day.weekday; state.selectedDate = isoDay(); let recurringProgram = null; const initialWorkoutCount = state.workouts.length;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await context.addInitScript(value => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value)); }, state);
let page = await context.newPage(); const errors = []; const watch = target => { target.on('pageerror', error => errors.push(error.message)); target.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); }); }; watch(page);
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload({ waitUntil: 'networkidle' }); recurringProgram = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program);

const startButton = page.getByRole('button', { name: 'START WORKOUT' });
if (!await startButton.count()) throw new Error(`Expected a startable workout on ${currentWeekday}. Visible UI:\n${await page.locator('body').innerText()}`);
await startButton.click(); const useRecommendation = page.getByRole('button', { name: 'USE', exact: true }); if (!await useRecommendation.count()) throw new Error(`Expected a progression recommendation. Visible UI:\n${await page.locator('body').innerText()}`); await useRecommendation.click(); await page.getByRole('status').filter({ hasText: 'Applied to this workout' }).waitFor();
const activeAfterStart = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout); const secondName = exerciseName(activeAfterStart.exercises[1]); await page.locator('.up-next button').filter({ hasText: secondName }).click(); await page.getByRole('button', { name: 'Replace ›' }).click(); const replacementName = await page.locator('.choice-row').first().locator('strong').textContent(); await page.locator('.choice-row').first().click();
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); const replacement = stored.activeWorkout.exercises[stored.activeWorkout.exerciseIndex]; assert.equal(exerciseName(replacement), replacementName); assert.deepEqual(stored.program, recurringProgram, 'today-only replacement leaves the recurring program unchanged'); assert.equal(replacement.sets.every(set => set.weight === null && !set.completed), true, 'replacement does not inherit incompatible load or completion state');
await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('30'); await page.getByRole('button', { name: 'Complete set 1' }).click();

await page.getByRole('button', { name: 'Back to Today' }).click(); await page.getByRole('button', { name: 'COACH' }).click(); await page.getByRole('button', { name: 'Adapt today to 35 minutes.' }).click(); await page.getByRole('button', { name: 'APPLY TO TODAY' }).click(); await page.getByRole('status').filter({ hasText: 'Today updated' }).waitFor();
await page.getByRole('button', { name: 'View workout →' }).click(); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();

await context.setOffline(true); await page.screenshot({ path: output('390-offline-active.png'), fullPage: false }); await page.getByRole('button', { name: 'Back to Today' }).click(); await page.getByRole('button', { name: 'COACH' }).click(); await page.getByText('AI Coach is unavailable. Logging and data-based progression still work locally.', { exact: true }).waitFor(); await page.screenshot({ path: output('390-coach-offline.png'), fullPage: false }); await page.getByRole('button', { name: 'TODAY', exact: true }).click(); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click(); const activeButtons = await page.locator('button.check:not([disabled])[aria-label^="Complete set"]').count(); if (activeButtons) await page.locator('button.check:not([disabled])[aria-label^="Complete set"]').first().click();
await page.getByRole('button', { name: 'Finish', exact: true }).click(); await page.getByRole('button', { name: 'FINISH ANYWAY' }).click(); await page.getByRole('heading', { name: 'Workout ended early' }).waitFor(); await page.screenshot({ path: output('390-complete-offline.png'), fullPage: false });
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.activeWorkout, null); assert.equal(stored.workouts.length, initialWorkoutCount + 1); const completedSession = stored.workouts.at(-1); assert.ok(completedSession.exercises.some(item => item.exerciseId === replacement.exerciseId && item.sets.some(set => set.completed)), 'history remains attached to the exercise actually performed');

await page.reload({ waitUntil: 'domcontentloaded' }); await context.setOffline(false); await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'PROGRESS' }).click(); await page.setViewportSize({ width: 430, height: 844 }); await page.screenshot({ path: output('430-progress-after-reconnect.png'), fullPage: false });
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.workouts.length, initialWorkoutCount + 1, 'offline finish/reconnect does not duplicate the session'); assert.equal(stored.activeWorkout, null, 'completed workout cannot resume after reconnect'); assert.deepEqual(stored.program, recurringProgram); assert.deepEqual(errors, []);
await context.close(); await browser.close(); console.log('Release-candidate E2E passed: progression, today-only replacement, Coach adaptation, offline logging/finish, reconnect and Progress share one canonical persisted state.');
