import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, startWorkout, weekday } from '../src/domain.js';

const phase = process.argv[2] === 'before' ? 'before' : 'after';
const output = new URL('../artifacts/logger-today-layout-review/', import.meta.url);
const appUrl = process.env.ROOK_QA_URL || 'http://127.0.0.1:4273';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const saved = [];
const dateAfter = days => { const date = new Date(); date.setDate(date.getDate() + days); return date; };

function fixture({ appearance, style, scenario, long }) {
  const state = blankState();
  const today = weekday();
  const second = weekday(dateAfter(1));
  const third = weekday(dateAfter(2));
  Object.assign(state.profile, {
    goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: [today, second, third], sessionMinutes: 60,
    environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'],
    onboardingComplete: true, showExerciseImages: true,
    recommendedWarmupsEnabled: false, restTimerEnabled: false,
    appearancePreference: appearance, stylePreference: style,
    themePreference: style === 'premium' ? 'premium' : appearance,
  });
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.activeWorkout = startWorkout(state, state.program.days.find(day => day.weekday === today));
  if (long) {
    state.activeWorkout.exercises[0].importedName = 'Single-Arm Behind-the-Body Cable Lateral Raise With Adjustable Cable Position';
    state.activeWorkout.name = 'Long-Named Upper-Body Strength and Stability Workout';
  }
  if (scenario !== 'logger') {
    const offset = scenario === 'today-other' ? 2 : 1;
    state.selectedDate = isoDay(dateAfter(offset));
    state.selectedDay = weekday(dateAfter(offset));
    if (scenario === 'today-no-active') state.activeWorkout = null;
  }
  return state;
}

async function open(width, appearance, style, scenario, long) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const state = fixture({ appearance, style, scenario, long });
  await context.addInitScript(value => {
    if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value));
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  if (scenario === 'logger') {
    await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
    await page.locator('.exercise-heading h1').waitFor();
    await page.locator('.exercise-heading-art').evaluate(image => image.decode().catch(() => {}));
  } else {
    await page.locator(scenario === 'today-no-active' ? '.today-day-header' : '.active-workout-notice').waitFor();
  }
  return { context, page, errors };
}

try {
  for (const width of [320, 390, 430])
  for (const appearance of ['light', 'dark'])
  for (const style of ['standard', 'premium']) {
    for (const long of [false, true]) {
      const { context, page, errors } = await open(width, appearance, style, 'logger', long);
      const geometry = await page.evaluate(() => {
        const box = selector => { const node = document.querySelector(selector); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }; };
        return {
          heading: box('.exercise-heading'), topline: box('.exercise-heading-topline'),
          art: box('.exercise-heading-art-button'), image: box('.exercise-heading-art'),
          title: box('.exercise-heading h1'), meta: box('.exercise-meta'),
          history: box('.exercise-history-meta'), sets: box('.sets'),
          actionHeights: [...document.querySelectorAll('.workout-exercise-actions button')].map(node => node.getBoundingClientRect().height),
          titleFont: getComputedStyle(document.querySelector('.exercise-heading h1')).fontSize,
          imageFit: getComputedStyle(document.querySelector('.exercise-heading-art')).objectFit,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.deepEqual(errors, []);
      if (phase === 'after') {
        assert.equal(geometry.overflow, false);
        assert.ok(geometry.topline.bottom <= geometry.art.y + 1, 'actions stay above illustration');
        assert.ok(geometry.title.x >= geometry.art.right + 5, 'title stays right of illustration');
        assert.ok(geometry.art.width >= (width === 320 ? 88 : 108));
        assert.ok(geometry.art.width <= 112.5);
        assert.equal(geometry.imageFit, 'contain');
        assert.ok(geometry.actionHeights.every(height => height >= 44));
        assert.ok(geometry.sets.y - geometry.heading.y < (long ? 330 : 250), 'sets remain near the header');
      }
      saved.push({ phase, width, appearance, style, scenario: 'logger', long, geometry });
      if (width === 390 && appearance === 'dark' && style === 'standard')
        await page.screenshot({ path: fileURLToPath(new URL(`logger-${long ? 'long' : 'short'}-${phase}.png`, output)) });
      await context.close();
    }
    for (const scenario of ['today-active', 'today-other', 'today-no-active']) {
      const { context, page, errors } = await open(width, appearance, style, scenario, true);
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('.active-workout-notice');
        const day = document.querySelector('.today-day-header');
        const hero = document.querySelector('.today-hero');
        const week = document.querySelector('.week-selector');
        return {
          card: card ? { bottom: card.getBoundingClientRect().bottom, height: card.getBoundingClientRect().height } : null,
          day: { top: day.getBoundingClientRect().top },
          gap: card ? day.getBoundingClientRect().top - card.getBoundingClientRect().bottom : null,
          heroMarginTop: hero ? getComputedStyle(hero).marginTop : null,
          heroPaddingTop: hero ? getComputedStyle(hero).paddingTop : null,
          weekToDay: week ? day.getBoundingClientRect().top - week.getBoundingClientRect().bottom : null,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.deepEqual(errors, []);
      if (phase === 'after') {
        assert.equal(geometry.overflow, false);
        if (scenario === 'today-no-active') {
          assert.equal(geometry.card, null);
          assert.ok(geometry.weekToDay <= 32, 'no active workout leaves no reserved notice gap');
        }
        else assert.ok(geometry.gap >= 20 && geometry.gap <= 28, `${scenario} gap ${geometry.gap}`);
      }
      saved.push({ phase, width, appearance, style, scenario, long: true, geometry });
      if (width === 390 && appearance === 'dark' && style === 'standard' && scenario === 'today-active')
        await page.screenshot({ path: fileURLToPath(new URL(`today-resume-${phase}.png`, output)) });
      await context.close();
    }
  }
  if (phase === 'after') for (const width of [320, 390, 430])
    for (const appearance of ['light', 'dark'])
      for (const style of ['standard', 'premium']) {
        const cases = saved.filter(item => item.width === width && item.appearance === appearance && item.style === style && item.scenario === 'logger');
        assert.equal(cases.length, 2);
        assert.equal(cases[0].geometry.art.width, cases[1].geometry.art.width, 'art size is independent of title length');
        assert.equal(cases[0].geometry.titleFont, cases[1].geometry.titleFont, 'long names keep the same title size');
      }
  await writeFile(new URL(`${phase}-geometry.json`, output), JSON.stringify(saved, null, 2));
  console.log(`${phase}: ${saved.length} logger/Today viewport-theme cases passed`);
} finally {
  await browser.close();
}
