import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, isoDay, weekday, startWorkout, completeWorkout } from '../src/domain.js';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/week-strip-theme-parity';
await mkdir(out, { recursive: true });
const baseline = before ? [] : JSON.parse(await readFile(`${out}/before.json`, 'utf8'));
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });

function fixture(status, style, appearance) {
  let state = blankState();
  const index = WEEKDAYS.indexOf(weekday());
  const next = WEEKDAYS[(index + 1) % 7];
  const later = WEEKDAYS[(index + 3) % 7];
  Object.assign(state.profile, {
    goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2,
    availableDays: status === 'rest' ? [next, later] : [weekday(), later],
    sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
    priorities: ['Balanced'], onboardingComplete: true,
    stylePreference: style, appearancePreference: appearance,
    themePreference: style === 'premium' ? 'premium' : appearance,
  });
  state.program = buildProgram(state.profile);
  state.selectedDay = weekday();
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  if (status === 'completed' || status === 'active') {
    state.activeWorkout = startWorkout(state, state.program.days.find(day => day.weekday === weekday()));
    if (status === 'completed') {
      Object.assign(state.activeWorkout.exercises[0].sets[0], { completed: true, reps: 8 });
      state = completeWorkout(state);
    }
  }
  return state;
}

async function measure(page) {
  return page.locator('.week-strip > button').evaluateAll(buttons => buttons.map(button => {
    const css = getComputedStyle(button);
    const after = getComputedStyle(button, '::after');
    const dot = button.querySelector('i');
    const dotCss = dot && getComputedStyle(dot);
    const rect = button.getBoundingClientRect();
    const tokenColor = token => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      button.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return {
      label: button.getAttribute('aria-label'), classes: button.className.trim(),
      selected: button.getAttribute('aria-pressed'), today: button.getAttribute('aria-current'),
      geometry: { width: rect.width, height: rect.height, x: rect.x, padding: css.padding, radius: css.borderRadius },
      structure: {
        border: css.borderWidth, borderStyle: css.borderStyle, outline: css.outlineWidth,
        outlineStyle: css.outlineStyle, shadow: css.boxShadow,
        underline: after.content, underlineWidth: after.width, underlineHeight: after.height,
        underlineBottom: after.bottom, weight: getComputedStyle(button.querySelector('strong')).fontWeight,
        dot: dot?.className || null, dotWidth: dotCss?.width || null,
        dotBorder: dotCss?.borderWidth || null, dotStyle: dotCss?.borderStyle || null,
        dotHollow: dotCss ? dotCss.backgroundColor === 'rgba(0, 0, 0, 0)' : null,
      },
      colors: { background: css.backgroundColor, border: css.borderColor, text: css.color, underline: after.backgroundColor },
      expectedBorder: tokenColor(button.matches('.selected-day') ? '--rook-week-selected-line' : button.matches('.workout-rest') ? '--rook-week-rest-line' : '--rook-week-planned-line'),
    };
  }));
}

try {
  for (const width of [320, 390]) for (const appearance of ['light', 'dark']) for (const style of ['premium', 'standard']) {
    for (const status of ['rest', 'planned', 'completed', 'active']) {
      const state = fixture(status, style, appearance);
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
      try {
        await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
        await page.goto(process.env.QA_URL || 'http://127.0.0.1:4177');
        const strip = page.locator('.week-strip');
        await strip.waitFor();
        assert.equal(await page.locator('html').getAttribute('data-style'), style);
        assert.equal(await page.locator('html').getAttribute('data-appearance'), appearance);
        const programBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program);
        for (const selection of ['today', 'planned', 'rest', 'return-today']) {
          const target = selection === 'today' || selection === 'return-today'
            ? strip.locator('[aria-current="date"]')
            : strip.locator(`.workout-${selection}:not(.today-date)`).first();
          await target.tap();
          await page.waitForFunction(() => document.querySelector('.week-strip [aria-pressed="true"]')?.matches(':focus') || document.activeElement === document.body);
          // Wait for the existing short color transition, not a navigation delay.
          await page.evaluate(() => Promise.all([...document.querySelectorAll('.week-strip > button')].flatMap(button => button.getAnimations().map(animation => animation.finished.catch(() => {})))));
          assert.equal(await target.getAttribute('aria-pressed'), 'true');
          assert.equal(await strip.locator('[aria-pressed="true"]').count(), 1);
          const cards = await measure(page);
          const key = `${width}-${appearance}-${style}-${status}-${selection}`;
          assert.equal(cards.length, 7);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          if (!before) {
            const previous = baseline.find(item => item.key === key);
            assert.ok(previous);
            assert.deepEqual(cards.map(card => card.geometry), previous.cards.map(card => card.geometry), `${key}: unchanged card layout`);
            assert.deepEqual(cards.map(card => card.structure), previous.cards.map(card => card.structure), `${key}: preserve approved indicator geometry`);
            for (const card of cards) {
              assert.equal(card.colors.border, card.expectedBorder, `${key}: ${card.label} border comes only from selected/workout state`);
              assert.equal(card.structure.border, card.selected === 'true' ? '2px' : '1px');
              assert.equal(card.structure.outlineStyle, 'none', `${key}: touch does not add another outline`);
              if (card.selected === 'true') {
                assert.deepEqual(card.colors, previous.cards.find(item => item.label === card.label).colors, `${key}: selected treatment unchanged`);
              }
              assert.equal(card.structure.underline, card.today ? '""' : 'none');
            }
            if (style === 'standard') {
              const premium = results.find(item => item.key === key.replace('-standard-', '-premium-'));
              assert.ok(premium);
              assert.deepEqual(cards.map(card => card.structure), premium.cards.map(card => card.structure), `${key}: identical Premium/Standard indicators`);
            }
          }
          if (status === 'planned' && ['today', 'planned'].includes(selection)) {
            await strip.screenshot({ path: `${out}/${phase}-${width}-${appearance}-${style}-${selection}.png` });
          }
          results.push({ key, cards });
        }
        // Keyboard focus remains a separate, visible accessibility indicator.
        await page.keyboard.press('Tab');
        await strip.locator('button').first().focus();
        assert.equal(await strip.locator('button').first().evaluate(button => button.matches(':focus-visible')), true);
        assert.ok(parseFloat(await strip.locator('button').first().evaluate(button => getComputedStyle(button).outlineWidth)) > 0);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program), programBefore);
        assert.deepEqual(errors, []);
        console.log(`PASS ${phase} ${width} ${appearance} ${style} ${status}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/${phase}.json`, `${JSON.stringify(results, null, 2)}\n`);
}
