import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { isoDay, startWorkout, weekday } from '../src/domain.js';

const root = new URL('../artifacts/workout-recovery/', import.meta.url);
await mkdir(root, { recursive: true });
const output = name => fileURLToPath(new URL(name, root));
const state = createReturningUserFixture(0);
const day = state.program.days.find(item => item.weekday === weekday()) || state.program.days[0];
state.selectedDay = day.weekday; state.selectedDate = isoDay(); state.activeWorkout = startWorkout(state, day);
state.profile.restTimerEnabled = true; state.profile.restTimerAutoStart = true; state.profile.restTimerSeconds = 120;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(value => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value)); }, state);
const page = await context.newPage(); const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();

const weight = page.getByRole('spinbutton', { name: /Weight in kg for set 1/ });
await page.screenshot({ path: output('375-first-session-empty-weight.png'), fullPage: false });
await weight.focus(); await page.screenshot({ path: output('375-direct-weight-entry-focused.png'), fullPage: false });
await weight.fill('50'); await page.getByRole('spinbutton', { name: /Reps for set 1/ }).fill('8');
const sessionId = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.id);
await page.getByRole('button', { name: 'Complete set 1' }).dblclick({ delay: 40 });
const completed = await page.evaluate(() => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; return { sessionId: active.id, set: active.exercises[0].sets[0], rest: active.rest, count: active.exercises.flatMap(item => item.sets).filter(set => set.completed).length }; });
assert.equal(completed.count, 1, 'rapid double completion produces one completed set'); assert.equal(completed.set.weight, 50); assert.equal(completed.set.reps, 8); assert.ok(completed.rest.endsAt > Date.now());

await page.waitForTimeout(20_000); await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
const recovered = await page.evaluate(() => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; return { id: active.id, set: active.exercises[0].sets[0], restLeft: Math.ceil((active.rest.endsAt - Date.now()) / 1000), count: active.exercises.flatMap(item => item.sets).filter(set => set.completed).length }; });
assert.equal(recovered.id, sessionId, 'reload preserves active session identity'); assert.equal(recovered.set.weight, 50); assert.equal(recovered.set.reps, 8); assert.equal(recovered.set.completed, true); assert.ok(recovered.restLeft >= 97 && recovered.restLeft <= 101, `timer reconstructs from deadline after 20 seconds: ${recovered.restLeft}`);

await context.setOffline(true); await page.getByRole('button', { name: 'Complete set 2' }).click(); await context.setOffline(false); await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
const reconnected = await page.evaluate(() => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; return { id: active.id, completed: active.exercises.flatMap(item => item.sets).filter(set => set.completed).length }; });
assert.equal(reconnected.id, sessionId); assert.equal(reconnected.completed, 2, 'offline completion survives reconnect exactly once');
assert.deepEqual(errors, []); await context.close(); await browser.close();
console.log('Workout recovery QA passed: same session and values survive reload, timer reconstructs from its deadline, double tap is idempotent, and offline logging survives reconnect.');
