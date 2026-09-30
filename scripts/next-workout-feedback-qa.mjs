import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday } from '../src/domain.js';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

function fixture(rating, appearance, style) {
  const state = blankState();
  const today = weekday();
  Object.assign(state.profile, {
    goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: [...new Set([today, 'Tue', 'Sat', 'Mon'])].slice(0, 3),
    sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
    priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false,
    appearancePreference: appearance, stylePreference: style,
    themePreference: style === 'premium' ? 'premium' : appearance,
  });
  for (const key of Object.keys(state.profile.increments)) state.profile.increments[key] = 1;
  state.program = buildProgram(state.profile);
  const day = state.program.days.find(item => item.weekday === today);
  state.activeWorkout = startWorkout(state, day);
  const current = state.activeWorkout.exercises[0];
  current.repMin = 6;
  current.repMax = 8;
  current.targetRir = 1;
  current.defaultIncrement = 1;
  state.workouts = [1, 2].map(index => ({
    id: `prior-${index}`,
    completedAt: `2026-09-${index === 1 ? '01' : '08'}T12:00:00Z`,
    sessionFeedback: index === 2 ? rating : 'about_right',
    exercises: [{ ...structuredClone(current), sets: current.sets.map(set => ({
      ...structuredClone(set), planned: true, added: false, completed: true,
      weight: 50, reps: 8, rir: 1,
    })) }],
  }));
  return state;
}

try {
  for (const [width, appearance, style] of [[320, 'dark', 'standard'], [390, 'light', 'premium']])
  for (const [rating, title, apply] of [
    ['harder', 'Repeat before increasing', false],
    ['easier', 'Ready to progress', true],
    ['about_right', 'Ready to progress', true],
  ]) {
    const initial = fixture(rating, appearance, style);
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(state => {
      if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(state));
    }, initial);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
    await page.goto('http://127.0.0.1:4273', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    assert.equal(await page.locator('.recommendation strong').textContent(), title);
    assert.equal(await page.locator('.recommendation button').count(), Number(apply));
    assert.match(await page.locator('.recommendation').innerText(), /whole last session/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(saved.activeWorkout.exercises[0].sets[0].weight, initial.activeWorkout.exercises[0].sets[0].weight);
    assert.equal(saved.workouts[1].exercises[0].sets[0].weight, 50);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    assert.equal(await page.locator('.recommendation strong').textContent(), title);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width} ${style} ${appearance} ${rating}: guidance and reload passed`);
  }
} finally {
  await browser.close();
}
