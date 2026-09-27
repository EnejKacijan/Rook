import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  blankState,
  buildProgram,
  completeWorkout,
  isoDay,
  startWorkout,
  weekday,
} from '../src/domain.js';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

function fixture() {
  const state = blankState();
  const today = weekday();
  const availableDays = [...new Set([today, 'Tue', 'Sat'])];
  for (const candidate of ['Mon', 'Wed', 'Fri', 'Sun'])
    if (!availableDays.includes(candidate) && availableDays.length < 3)
      availableDays.push(candidate);
  state.profile = {
    ...state.profile,
    goal: 'Build muscle',
    experience: 'Intermediate',
    daysPerWeek: 3,
    availableDays: [...new Set(availableDays)].slice(0, 3),
    sessionMinutes: 60,
    environment: 'Commercial gym',
    equipment: ['full gym'],
    priorities: ['Balanced'],
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.activeWorkout = startWorkout(state, state.program.days.find(day => day.weekday === today));
  state.activeWorkout.startedAt = Date.now() - 6000;
  state.activeWorkout.exercises[0].sets[0].weight = 42.5;
  state.activeWorkout.sessionNote = 'Keep this note';
  return completeWorkout(state);
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
await context.addInitScript(
  state => { if (localStorage.getItem('lift-v2-state') === null) localStorage.setItem('lift-v2-state', JSON.stringify(state)); },
  fixture(),
);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.route('**/api/ai/status', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'SESSION ENDED · VIEW HISTORY' }).click();
const resumeRow = page.getByRole('button', {
  name: /Resume workout Reopen this accidentally completed empty session/,
});
assert.equal(await resumeRow.isVisible(), true, 'empty completion exposes resume');
await resumeRow.click();
await page.getByRole('heading', { name: 'Resume this workout?' }).waitFor();
await page.getByRole('button', { name: 'CANCEL' }).click();
assert.equal(
  (await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).workouts.length)),
  1,
  'cancel leaves history unchanged',
);
await resumeRow.click();
await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
await page.locator('.workout-screen').waitFor();

const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
assert.equal(resumed.workouts.length, 0, 'empty completion is removed from progress');
assert.equal(resumed.workoutCorrections.length, 1, 'original completion is archived');
assert.equal(resumed.activeWorkout.sessionNote, 'Keep this note');
assert.equal(resumed.activeWorkout.exercises[0].sets[0].weight, 42.5);
assert.ok(resumed.activeWorkout.resumedFromCompletionId);
assert.equal(await page.locator('.workout-screen').isVisible(), true);
await page.reload({waitUntil:'networkidle'});
await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
await page.locator('.workout-screen').waitFor();
const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
assert.deepEqual(reloaded.activeWorkout, resumed.activeWorkout, 'reload preserves the exact resumed session');
assert.deepEqual(reloaded.workoutCorrections, resumed.workoutCorrections, 'reload preserves the correction audit');
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log('Workout resume QA passed: guarded UI, cancel safety, frozen-session restore, correction audit, persistence, and active-workout navigation are correct.');
