import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { isoDay, startWorkout, weekday } from '../src/domain.js';

const out = 'artifacts/release-regression/recommendation-theme';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

function fixture({ appearance, style, stateType }) {
  const state = createReturningUserFixture(5);
  Object.assign(state.profile, {
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === 'premium' ? 'premium' : appearance,
  });
  const today = weekday();
  let day = state.program.days.find(item => item.weekday === today);
  if (!day) {
    day = state.program.days[0];
    day.weekday = today;
  }
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.activeWorkout = startWorkout(state, day);
  state.activeWorkout.exerciseIndex = 0;
  const activeExercise = state.activeWorkout.exercises[0];
  const reps = stateType === 'progress' ? activeExercise.repMax : Math.max(1, activeExercise.repMin - 2);
  const historyExercise = structuredClone(activeExercise);
  historyExercise.sets.forEach(set => Object.assign(set, {
    completed: true,
    planned: true,
    added: false,
    weight: 100,
    reps,
    rir: activeExercise.targetRir ?? 2,
  }));
  const completed = offset => ({
    id: `recommendation-${stateType}-${offset}`,
    startedAt: new Date(Date.now() - offset * 86400000 - 3600000).toISOString(),
    completedAt: new Date(Date.now() - offset * 86400000).toISOString(),
    exercises: [structuredClone(historyExercise)],
  });
  state.workouts = [completed(4), completed(1)];
  return state;
}

function parseRgb(value) {
  return value.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function contrast(left, right) {
  const lum = value => parseRgb(value).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const [a, b] = [lum(left), lum(right)];
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

const themes = [
  ['standard-light', 'light', 'standard'],
  ['standard-dark', 'dark', 'standard'],
  ['premium-light', 'light', 'premium'],
  ['premium-dark', 'dark', 'premium'],
];

try {
  for (const [name, appearance, style] of themes) {
    for (const stateType of ['progress', 'hold']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
      await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), fixture({ appearance, style, stateType }));
      const page = await context.newPage();
      await page.route('**/api/ai/status', route => route.fulfill({ json: { available: false } }));
      await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
      const recommendation = page.locator(`.recommendation.${stateType}`);
      await recommendation.waitFor();
      const colors = await recommendation.evaluate(node => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('span');
        probe.style.color = root.getPropertyValue(node.classList.contains('hold') ? '--rook-warning-text' : '--rook-accent-strong').trim();
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return {
          strong: getComputedStyle(node.querySelector('strong')).color,
          detail: getComputedStyle(node.querySelector('p')).color,
          background: getComputedStyle(node).backgroundColor,
          expected,
        };
      });
      assert.equal(colors.strong, colors.detail, `${name} ${stateType} title and detail share the semantic foreground`);
      assert.equal(colors.detail, colors.expected, `${name} ${stateType} uses its semantic theme token`);
      assert.ok(contrast(colors.detail, colors.background) >= 4.5, `${name} ${stateType} recommendation remains readable`);
      if (name === 'premium-light') assert.notEqual(colors.detail, 'rgb(26, 92, 65)', `${stateType} does not leak legacy Standard green`);
      await page.screenshot({ path: `${out}/${name}-${stateType}.png`, fullPage: false });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log('Recommendation theme QA passed: progress and hold semantics are token-driven, readable, and correct in all four themes.');
