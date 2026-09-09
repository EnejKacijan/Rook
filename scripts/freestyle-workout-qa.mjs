import assert from 'node:assert/strict';
import {startFreestyle} from './qa-current-navigation.mjs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday, startWorkout, completeWorkout } from '../src/domain.js';
const out = 'artifacts/freestyle-workout'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
 for (const width of [320, 390]) for (const style of ['standard', 'premium']) for (const appearance of ['dark', 'light']) {
  const state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3, availableDays: [...new Set([weekday(), 'Wed', 'Fri', 'Tue'])].slice(0,3), sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, rirEnabled: true, appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
  state.program = buildProgram(state.profile); state.selectedDate = isoDay(); state.selectedDay = weekday(); state.ai.planUpgradeDismissed = true;
  const prior = startWorkout(state, { name: 'Previous workout', exercises: [{ id: 'prior-bench', exerciseId: 'barbell-bench-press', repMin: 8, repMax: 8, sets: [{ weight: 80, reps: 8 }] }] });
  prior.id = 'previous-workout'; prior.completedAt = new Date(Date.now()-86400000*7).toISOString(); prior.canonicalPlanDate = isoDay(new Date(Date.now()-86400000*7)); prior.workoutDateKey = prior.canonicalPlanDate;
  Object.assign(prior.exercises[0].sets[0], { weight: 80, reps: 8, completed: true }); state.workouts = [prior];
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, state);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const prefix = `${width}-${style}-${appearance}`;
  const shot = async name => {
    if (['empty', 'previous', 'logged', 'new-exercise'].includes(name)) await page.getByRole('button', { name: 'Back to Today', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(350); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (['empty', 'previous', 'new-exercise'].includes(name)) {
      const title = await page.locator('.workout-header-center').boundingBox(), actions = await page.locator('.workout-header-actions').boundingBox();
      assert.ok(title.x + title.width <= actions.x, 'header title and Finish never overlap');
    }
    await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
  };
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  const originalProgram = (await stored()).program;
  await shot('today');
  await startFreestyle(page);
  await page.getByRole('heading', { name: 'No exercises yet' }).waitFor(); await shot('empty');
  assert.equal(await page.getByRole('button', { name: 'Finish', exact: true }).isEnabled(), false);
  const emptyId = (await stored()).activeWorkout.id;
  await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
  assert.equal((await stored()).activeWorkout.id, emptyId);
  await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click(); await shot('picker');
  assert.ok(await page.getByRole('searchbox', { name: 'Search exercises', exact: true }).evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
  await page.keyboard.press('Escape');
  assert.equal((await stored()).activeWorkout.id, emptyId);
  await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search exercises', exact: true }).fill('Bench Press');
  await page.locator('.freestyle-picker .list-row').filter({ hasText: /^Bench Press/ }).first().click();
  await page.locator('.freestyle-copy').waitFor(); await shot('previous');
  assert.equal((await stored()).activeWorkout.exercises[0].sets[0].weight, null);
  await page.locator('.freestyle-copy').click();
  assert.equal((await stored()).activeWorkout.exercises[0].sets[0].weight, 80);
  await page.getByRole('button', { name: 'Log set 1', exact: true }).click(); await shot('logged');
  const before = (await stored()).activeWorkout;
  await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search exercises', exact: true }).fill('Dumbbell Bench Press');
  await page.locator('.freestyle-picker .list-row').filter({ hasText: /^Dumbbell Bench Press/ }).first().click();
  const after = (await stored()).activeWorkout;
  assert.deepEqual(after.exercises[0], before.exercises[0]); assert.deepEqual(after.rest, before.rest); assert.equal(after.startedAt, before.startedAt);
  assert.equal(after.exercises.length, 2);
  await page.getByRole('button', { name: 'NEXT EXERCISE →', exact: true }).click();
  await page.getByRole('heading', { name: 'Dumbbell Bench Press', exact: true }).waitFor(); await shot('new-exercise');
  await page.getByRole('button',{name:'Exercise options',exact:true}).click();
  await page.getByRole('button', { name: 'Remove exercise', exact: true }).click();
  assert.equal((await stored()).activeWorkout.exercises.length, 1);
  await page.getByRole('button', { name: 'Finish', exact: true }).click(); await page.locator('.complete-screen').waitFor(); await shot('complete');
  assert.equal((await stored()).workouts.at(-1).source, 'freestyle');
  assert.deepEqual((await stored()).program, originalProgram);
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'START WORKOUT', exact: true }).isEnabled(), true);
  await page.locator('.freestyle-entry .list-row').scrollIntoViewIfNeeded(); await shot('history');
  assert.equal((await stored()).activeWorkout,null);
  await startFreestyle(page); await page.getByRole('button', { name: 'Cancel workout', exact: true }).click();
  assert.equal((await stored()).activeWorkout, null); assert.equal((await stored()).workouts.length, 2);
  if (style === 'standard' && ((width === 320 && appearance === 'dark') || (width === 390 && appearance === 'light'))) {
    const baseline = await stored(); const planned = structuredClone(baseline);
    planned.activeWorkout = startWorkout(planned, planned.program.days.find(d => d.weekday === weekday()));
    for (const e of planned.activeWorkout.exercises) for (const s of e.sets) Object.assign(s, { completed: true, weight: 30, reps: 8 });
    await page.evaluate(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), completeWorkout(planned)); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'WORKOUT COMPLETE · VIEW HISTORY', exact: true }).waitFor();
    assert.equal((await stored()).activeWorkout,null); await shot('completed-day');
    const rest = baseline; rest.profile.availableDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].filter(day => day !== weekday()).slice(0,3); rest.program = buildProgram(rest.profile);
    await page.evaluate(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), rest); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Rest day', exact: true }).waitFor(); await shot('rest-day');
    await startFreestyle(page);
    await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search exercises', exact: true }).fill('no-such-exercise-xyz');
    await page.getByText('No compatible exercises found.', { exact: false }).waitFor(); await shot('no-match');
    await page.getByRole('button', { name: 'Close Add exercise', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Start freestyle workout', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel workout', exact: true }).click();
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if (k === 'lift-v2-state') throw new DOMException('Quota', 'QuotaExceededError'); return original.call(this,k,v); }; });
    await startFreestyle(page);
    await page.locator('.persistence-warning').waitFor(); await shot('save-warning');
  }
  assert.deepEqual(errors, []); console.log(`PASS ${prefix}`); await context.close();
 }
} finally { await browser.close(); }
