import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { isoDay, weekday } from '../src/domain.js';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const state = createReturningUserFixture(0); const currentWeekday = weekday(); const scheduledToday = state.program.days.find(item => item.weekday === currentWeekday); const day = scheduledToday || state.program.days[0];
if (!scheduledToday) { const replacedWeekday = day.weekday; day.weekday = currentWeekday; state.profile.availableDays = state.profile.availableDays.map(item => item === replacedWeekday ? currentWeekday : item); }
state.program.rotationStartDate = null;
state.selectedDay = day.weekday; state.selectedDate = isoDay();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await context.addInitScript(value => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value)); }, state);
let page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
await page.goto(baseUrl, { waitUntil: 'networkidle' }); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload({ waitUntil: 'networkidle' });
const cacheState = await page.evaluate(async () => ({ controlled: Boolean(navigator.serviceWorker.controller), caches: await Promise.all((await caches.keys()).map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(request => request.url) }))) }));
await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); const startButton = page.getByRole('button', { name: 'START WORKOUT' }); if (!await startButton.count()) throw new Error(`Expected cached app with a startable workout. Cache state: ${JSON.stringify(cacheState)}. Errors: ${JSON.stringify(errors)}. Page:\n${await page.content()}`); await startButton.click();
const sessionId = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.id); await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('40'); await page.getByRole('button', { name: 'Complete set 1' }).click(); await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
const offlineRecovered = await page.evaluate(() => { const active = JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout; return { id: active.id, weight: active.exercises[0].sets[0].weight, completed: active.exercises[0].sets[0].completed }; }); assert.deepEqual(offlineRecovered, { id: sessionId, weight: 40, completed: true });
await context.setOffline(false); await page.reload({ waitUntil: 'networkidle' }); const reconnected = await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('lift-v2-state')); return { id: state.activeWorkout.id, completed: state.activeWorkout.exercises.flatMap(item => item.sets).filter(set => set.completed).length }; }); assert.deepEqual(reconnected, { id: sessionId, completed: 1 }); assert.deepEqual(errors, []);
await context.close(); await browser.close(); console.log('Offline PWA QA passed: cached cold start, offline logging/reload and reconnect preserve one active session and one mutation.');
