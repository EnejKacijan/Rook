import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const baseUrl = process.env.QA_URL || 'http://127.0.0.1:4177';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/today-completed-divider';
await mkdir(out, { recursive: true });
const baseline = before ? [] : JSON.parse(await readFile(`${out}/before.json`, 'utf8'));
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390]) {
    for (const style of ['standard', 'premium']) {
      for (const appearance of ['light', 'dark']) {
        for (const count of [0, 1, 2, 3]) {
          let state = blankState();
          const index = WEEKDAYS.indexOf(weekday());
          Object.assign(state.profile, {
            onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate',
            daysPerWeek: 2, availableDays: [WEEKDAYS[(index + 1) % 7], WEEKDAYS[(index + 3) % 7]],
            sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
            priorities: ['Balanced'], stylePreference: style, appearancePreference: appearance,
            themePreference: style === 'premium' ? 'premium' : appearance,
          });
          state.program = buildProgram(state.profile);
          state.selectedDate = isoDay();
          state.selectedDay = weekday();
          state.ai.planUpgradeDismissed = true;
          for (let i = 0; i < count; i++) {
            state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
            Object.assign(state.activeWorkout.exercises[0].sets[0], { reps: 8, completed: true });
            state = completeWorkout(state);
            state.workouts.at(-1).completedAt = new Date(Date.now() - (count - i) * 60000).toISOString();
          }
          const expectedIds = state.workouts.map(workout => workout.id).reverse();
          const context = await browser.newContext({
            viewport: { width, height: 844 }, isMobile: true, hasTouch: true,
            serviceWorkers: 'block', reducedMotion: 'reduce',
          });
          try {
            await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
            const page = await context.newPage();
            await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
            await page.goto(baseUrl);
            await page.locator('.rest-up-next').waitFor();
            const list = page.locator('.today-completed-workouts');
            assert.equal(await list.count(), count ? 1 : 0);
            assert.equal(await list.locator('.eyebrow').count(), count > 1 ? 1 : 0);
            assert.deepEqual(await list.locator('.list-row').evaluateAll(rows => rows.map(row => row.dataset.workoutId)), expectedIds);
            const geometry = await page.evaluate(() => {
              const section = document.querySelector('.today-completed-workouts');
              const next = document.querySelector('.rest-up-next');
              const rows = [...document.querySelectorAll('.today-completed-workouts > .list-row')];
              const nextStyle = getComputedStyle(next);
              return {
                rowBorders: rows.map(row => getComputedStyle(row).borderBottomWidth),
                rowPadding: rows.map(row => getComputedStyle(row).padding),
                rowMinHeights: rows.map(row => getComputedStyle(row).minHeight),
                sectionMargin: section ? getComputedStyle(section).marginTop : null,
                nextBorder: nextStyle.borderTopWidth,
                nextMargin: nextStyle.marginTop,
                nextPadding: nextStyle.paddingTop,
                gap: section ? next.getBoundingClientRect().top - section.getBoundingClientRect().bottom : null,
                overflow: document.documentElement.scrollWidth > innerWidth,
              };
            });
            assert.deepEqual(geometry.rowBorders, Array.from({ length: count }, (_, i) => !before && i === count - 1 ? '0px' : '1px'));
            assert.equal(geometry.nextBorder, '1px');
            assert.equal(geometry.overflow, false);
            const key = `${width}-${style}-${appearance}-${count}`;
            if (!before) {
              const previous = baseline.find(item => item.key === key);
              assert.ok(previous, `Missing before measurement: ${key}`);
              for (const field of ['rowPadding', 'rowMinHeights', 'sectionMargin', 'nextPadding']) {
                assert.deepEqual(geometry[field], previous.geometry[field], `${key}: unchanged ${field}`);
              }
              // Follow-up: the final row's 15px padding plus 16px section margin
              // now provide 31px visual separation; empty lists remain unchanged.
              assert.equal(geometry.nextMargin, count ? '16px' : previous.geometry.nextMargin);
              assert.equal(geometry.gap, count ? 16 : previous.geometry.gap);
            }
            if (count === 2 && style === 'standard' && appearance === 'dark') {
              await page.locator('.rest-up-next').scrollIntoViewIfNeeded();
              await page.screenshot({ path: `${out}/${phase}-${width}.png` });
            }
            if (count) {
              const historyBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).workouts);
              await list.locator('.list-row').last().click();
              await page.locator('.completed-workout-detail').waitFor();
              assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).workouts), historyBefore);
            }
            results.push({ key, geometry });
            console.log(`PASS ${phase} ${key}`);
          } finally {
            await context.close();
          }
        }
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/${phase}.json`, `${JSON.stringify(results, null, 2)}\n`);
}
