import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { blankState, buildProgram, isoDay, startWorkout, weekday, WEEKDAYS } from '../src/domain.js';

const phase = process.argv[2] || 'after';
const out = new URL('../artifacts/other-active-day-polish/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const width of [320, 390, 430]) for (const appearance of ['light', 'dark']) for (const style of ['standard', 'premium']) {
  const state = blankState(), today = weekday(), otherDay = WEEKDAYS[(WEEKDAYS.indexOf(today) + 1) % 7];
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, otherDay], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
  state.program = buildProgram(state.profile);
  state.activeWorkout = startWorkout(state, state.program.days.find(day => day.weekday === today));
  state.activeWorkout.startedAt = Date.now() - 18 * 60 * 1000;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  state.selectedDay = otherDay; state.selectedDate = isoDay(tomorrow);
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, state);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/ai/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('.active-workout-start-lock').waitFor();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.active-workout-notice').count(), 1);
  assert.equal(await page.locator('.today-exercise-edit-toggle').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'START WORKOUT', exact: true }).count(), 0);
  const name = `${width}-${style}-${appearance}`;
  const geometry = await page.evaluate(() => {
    const card = document.querySelector('.active-workout-notice').getBoundingClientRect();
    const title = document.querySelector('.today-day-header > .eyebrow').getBoundingClientRect();
    const selectors = ['.active-workout-notice', '.today-hero h1', '.week-strip', '.exercise-preview .list-row'];
    return { gap: title.top - card.bottom, parts: selectors.map(s => { const e = document.querySelector(s), c = getComputedStyle(e), r = e.getBoundingClientRect(); return { text: e.textContent, width: r.width, height: r.height, font: c.fontSize }; }), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(geometry.overflow, false);
  if (phase === 'after') {
    // Current regression invariant; do not depend on an old date/fixture's screenshot geometry.
    assert.ok(geometry.gap >= 38 && geometry.gap <= 64, 'selected-day content retains restrained separation');
    assert.equal(await page.getByText('Finish your active workout to edit exercises.', { exact: true }).count(), 0);
    assert.equal(await page.locator('.active-workout-start-lock').count(), 1);
    const reference = await page.locator('.today-exercise-edit-toggle').getAttribute('aria-describedby');
    assert.equal(await page.locator(`#${reference}`).count(), 1, 'disabled Edit retains accessible explanation');
  }
  await writeFile(new URL(`${name}-${phase}.json`, out), JSON.stringify(geometry, null, 2));
  await page.screenshot({ path: fileURLToPath(new URL(`${name}-${phase}.png`, out)), fullPage: true });
  if (phase === 'after') {
    await page.locator('.active-workout-notice button').click();
    await page.locator('.exercise-heading h1').waitFor();
    assert.equal(await page.locator('.exercise-heading h1').count(), 1, 'Resume still opens active workout');
  }
  assert.deepEqual(errors, []); await context.close();
}
await browser.close();
console.log(`${phase}: 12 viewport/theme cases passed.`);
