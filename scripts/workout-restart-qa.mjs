import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/workout-restart/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

function fixture(themePreference = 'light') {
  const state = blankState();
  const today = weekday();
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3, availableDays: [today, 'Tue', 'Sat'].filter((day, index, all) => all.indexOf(day) === index), sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, themePreference, restTimerEnabled: true, restTimerAutoStart: true, restTimerSeconds: 90 };
  while (state.profile.availableDays.length < 3) state.profile.availableDays.push(['Mon', 'Wed', 'Fri'].find(day => !state.profile.availableDays.includes(day)));
  state.profile.daysPerWeek = state.profile.availableDays.length;
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  return state;
}

async function open(themePreference) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(state => localStorage.setItem('lift-v2-state', JSON.stringify(state)), fixture(themePreference));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  return { context, page, errors };
}

{
  const { context, page, errors } = await open('light');
  const initial = await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('lift-v2-state')); return { startedAt: state.activeWorkout.startedAt, exercises: state.activeWorkout.restartSnapshot.exercises, warmup: state.activeWorkout.restartSnapshot.warmup, program: state.program, historyCount: state.workouts.length }; });
  assert.equal(await page.getByRole('button', { name: 'Workout options' }).count(), 0, 'restart stays hidden for a pristine workout');
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('42.5');
  assert.equal(await page.getByRole('button', { name: 'Workout options' }).count(), 1, 'a meaningful edit reveals workout-level options');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  assert.equal(await page.locator('.rest-timer').isVisible(), true, 'a running rest timer exists before restart');
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('heading', { name: 'Workout options' }).waitFor();
  const restartRow = page.getByRole('button', { name: /Restart workout Clear this session/ });
  assert.equal(await restartRow.isVisible(), true);
  await restartRow.click();
  await page.getByRole('heading', { name: 'Restart workout?' }).waitFor();
  assert.equal(await page.getByText('This will clear all progress from this workout and start it again from the beginning. This can’t be undone.', { exact: true }).count(), 1);
  const danger = page.getByRole('button', { name: 'RESTART WORKOUT' });
  const dangerColor = await danger.evaluate(node => getComputedStyle(node).backgroundColor.match(/[\d.]+/g).map(Number));
  assert.ok(dangerColor[0] > dangerColor[1] * 1.8 && dangerColor[0] > dangerColor[2] * 1.6, `confirmation uses a restrained destructive red: ${dangerColor}`);
  await page.getByRole('button', { name: 'CANCEL' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Workout options' }).count(), 1, 'cancel returns without mutation');
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].sets[0].completed)), true);
  await page.getByRole('button', { name: /Restart workout Clear this session/ }).click();
  await page.getByRole('button', { name: 'RESTART WORKOUT' }).click();
  await page.locator('.active-workout-options-sheet').waitFor({ state: 'detached' });
  const restarted = await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('lift-v2-state')); return { active: state.activeWorkout, program: state.program, historyCount: state.workouts.length, scrollTop: document.querySelector('.workout-screen').scrollTop }; });
  assert.ok(restarted.active.startedAt > initial.startedAt, 'elapsed time restarts from a new timestamp');
  assert.equal(restarted.active.exerciseIndex, 0);
  assert.equal(restarted.active.rest, null);
  assert.deepEqual(restarted.active.exercises, initial.exercises);
  assert.deepEqual(restarted.active.warmup, initial.warmup);
  assert.deepEqual(restarted.program, initial.program, 'restart does not change the recurring plan');
  assert.equal(restarted.historyCount, initial.historyCount, 'restart creates no abandoned history record');
  assert.equal(restarted.scrollTop, 0);
  assert.equal(await page.getByRole('button', { name: 'Workout options' }).count(), 0, 'restart becomes unavailable again once pristine');
  await page.waitForTimeout(240);
  await page.screenshot({ path: output('390-light-restarted.png'), fullPage: false });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open('dark');
  await page.getByRole('spinbutton', { name: /Weight in kg for set 1/ }).fill('30');
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: /Restart workout Clear this session/ }).click();
  await page.screenshot({ path: output('390-dark-confirmation.png'), fullPage: false });
  const sheet = await page.locator('.active-workout-options-sheet').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }));
  assert.notEqual(sheet.background, 'rgb(246, 245, 242)');
  assert.notEqual(sheet.background, sheet.color);
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log('Workout restart QA passed: hidden pristine state, guarded confirmation, cancel safety, atomic session reset, plan/history isolation, timer reset, scroll reset, and Light/Dark presentation are correct.');
