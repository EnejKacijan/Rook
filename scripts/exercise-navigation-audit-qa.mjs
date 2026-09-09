import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const scenario of ['zero', 'partial', 'full', 'rest', 'amrap', 'drop', 'rest_pause', 'per_side']) {
    const state = blankState(), today = weekday();
    Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]], sessionMinutes: 60, equipment: ['full gym'], environment: 'Commercial gym', onboardingComplete: true, rirEnabled: true });
    state.program = buildProgram(state.profile);
    state.selectedDay = today; state.selectedDate = isoDay(); state.ai.planUpgradeDismissed = true;
    state.activeWorkout = startWorkout(state, state.program.days.find(d => d.weekday === today));
    const active = state.activeWorkout;
    active.exercises = active.exercises.slice(0, 2);
    active.exercises.forEach(e => { delete e.supersetId; });
    active.exercises[0].sets.forEach((set, i) => {
      Object.assign(set, { weight: 40 + i, reps: 8 + i, rir: i, completed: scenario === 'full' || (['partial', 'rest'].includes(scenario) && i === 0) });
      if (set.completed) set.completedAt = Date.now() - 2000;
      if (['amrap', 'drop', 'rest_pause'].includes(scenario)) set.setType = scenario;
      if (['drop', 'rest_pause'].includes(scenario)) set.segments = [{ id: `segment-${i}`, weight: 30, reps: 4 }];
      if (scenario === 'per_side') set.sides = { left: { reps: 9 }, right: { reps: 8 } };
    });
    if (scenario === 'per_side') active.exercises[0].loggingMode = 'per_side';
    if (scenario === 'rest') active.rest = { seconds: 90, endsAt: Date.now() + 90000 };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(s => { if (!sessionStorage.getItem('navigation-fixture')) { localStorage.setItem('lift-v2-state', JSON.stringify(s)); sessionStorage.setItem('navigation-fixture', '1'); } }, state);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
    await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173');
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    const before = await read();
    await page.getByRole('button', { name: 'NEXT EXERCISE →', exact: true }).click();
    if (scenario !== 'full') {
      await page.getByRole('dialog').waitFor();
      assert.deepEqual((await read()).activeWorkout, before.activeWorkout, 'opening confirmation changes no persisted workout state');
      await page.getByRole('button', { name: 'RETURN TO EXERCISE', exact: true }).click();
      assert.deepEqual((await read()).activeWorkout, before.activeWorkout, 'cancel preserves values and running rest timer');
      await page.getByRole('button', { name: 'NEXT EXERCISE →', exact: true }).click();
      await page.getByRole('button', { name: /^SKIP INCOMPLETE SET/ }).click();
    }
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex === 1);
    const after = await read();
    assert.ok(after.activeWorkout.updatedAt >= before.activeWorkout.updatedAt);
    assert.deepEqual(after.activeWorkout, { ...before.activeWorkout, exerciseIndex: 1, rest: null, updatedAt: after.activeWorkout.updatedAt }, 'navigation changes only index, rest and update timestamp; no completion/skip/value mutation');
    assert.deepEqual(after.workouts, before.workouts, 'no completed session created');
    assert.deepEqual(after.program, before.program, 'permanent plan untouched');
    if (scenario === 'rest') assert.equal(await page.locator('.rest-timer').count(), 0, 'existing navigation stops rest');
    await page.getByRole('button', { name: '← PREVIOUS EXERCISE', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex === 0);
    const returned = (await read()).activeWorkout;
    assert.deepEqual(returned, { ...before.activeWorkout, rest: null, updatedAt: returned.updatedAt }, 'return preserves all exercises and set values exactly');
    await page.reload();
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    assert.deepEqual((await read()).activeWorkout.exercises, before.activeWorkout.exercises, 'all values survive reload');
    assert.deepEqual(errors, []);
    console.log(`PASS ${scenario}: next, cancel where applicable, previous, reload, immutable exercise/set data`);
    await context.close();
  }
} finally { await browser.close(); }
