// Full-width Back: a drag that starts anywhere follows the finger, reveals the
// view it returns to, and never takes a horizontal gesture another control owns.
// Real Chromium CDP touch sequences at 320/393 px, light and dark.
// Run against `npm run dev -- --port 4173`. ROOK_CHROME overrides the browser.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, weekday, isoDay, WEEKDAYS, startWorkout } from '../src/domain.js';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startFreestyle } from './qa-current-navigation.mjs';

const out = 'artifacts/full-width-swipe-back';
await mkdir(out, { recursive: true });
const executablePath = process.env.ROOK_CHROME || undefined;
const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { channel: 'chrome', headless: true });

function freshState(appearance) {
  const state = blankState(), day = weekday();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: [day, WEEKDAYS[(WEEKDAYS.indexOf(day) + 2) % 7], WEEKDAYS[(WEEKDAYS.indexOf(day) + 4) % 7]],
    sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'],
    onboardingComplete: true, appearancePreference: appearance, themePreference: appearance });
  state.program = buildProgram(state.profile); state.selectedDate = isoDay(); state.selectedDay = day;
  return state;
}

async function session({ width, appearance, state = freshState(appearance), standalone = true }) {
  const context = await browser.newContext({ viewport: { width, height: 852 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await context.addInitScript(([seed, installed]) => {
    if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(seed));
    if (installed) Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
  }, [state, standalone]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
  await page.goto('http://127.0.0.1:4173');
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y }] });
  const settled = () => page.waitForFunction(() => !document.documentElement.dataset.edgeBackActive && !document.querySelector('[data-swipe-parent]'));
  async function drag({ x, y, dx, dy = 0, shot, end = 'touchEnd' }) {
    await still(); await page.waitForTimeout(220);
    await touch('touchStart', x, y);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', x + dx * i / 8, y + dy * i / 8); await page.waitForTimeout(16); }
    if (shot) { await page.waitForTimeout(50); await page.screenshot({ path: `${out}/${shot}.png` }); }
    await page.waitForTimeout(120); await touch(end); await settled(); await page.waitForTimeout(260);
  }
  // Let page and sheet entrances finish: a finger that lands before the page
  // has slid in touches nothing.
  const still = () => page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const backs = () => page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Back"]')]
    .filter(button => button.getClientRects().length).map(button => button.getAttribute('aria-label')));
  return { context, page, drag, touch, backs, still, errors };
}

const results = [];
try {
  for (const width of [320, 393]) for (const appearance of ['light', 'dark']) {
    const key = `${width}-${appearance}`;
    // 1. Settings page: a mid-screen drag on a row returns to Profile, no row opens.
    {
      const { context, page, drag, backs, still, errors } = await session({ width, appearance });
      await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
      await page.locator('[data-profile-area="preferences"]').click();
      await page.getByRole('button', { name: 'Back to Profile' }).waitFor(); await still();
      const row = await page.getByRole('button', { name: /Logging & increments/ }).boundingBox();
      await drag({ x: row.x + row.width / 2, y: row.y + 10, dx: 30 });
      assert.deepEqual(await backs(), ['Back to Profile'], 'a short drag cancels');
      assert.equal(await page.locator('.modal-layer').count(), 0, 'the row under the finger did not open');
      await drag({ x: row.x + row.width / 2, y: row.y + 10, dx: width * .45, shot: `${key}-settings-drag` });
      assert.deepEqual(await backs(), [], 'mid-screen drag went Back');
      assert.equal(await page.locator('.modal-layer').count(), 0);
      assert.deepEqual(errors, []); await context.close();
    }
    // 2. Sheet steps reveal the previous step; the first Back slides the sheet away.
    {
      const state = createReturningUserFixture(6); state.profile.appearancePreference = appearance; state.profile.themePreference = appearance;
      const { context, page, drag, backs, errors } = await session({ width, appearance, state });
      await page.getByRole('button', { name: 'PROGRESS', exact: true }).click();
      await page.getByRole('button', { name: /^View all progression/ }).click();
      await page.getByRole('button', { name: 'Back to Progress' }).waitFor(); await page.waitForTimeout(350);
      await page.locator('.modal-layer button', { hasText: 'Romanian Deadlift' }).first().click();
      await page.getByRole('button', { name: 'Back to exercise progression' }).waitFor(); await page.waitForTimeout(350);
      await drag({ x: width * .4, y: 520, dx: width * .45, shot: `${key}-sheet-step-drag` });
      assert.deepEqual(await backs(), ['Back to Progress']);
      await drag({ x: width * .4, y: 520, dx: width * .45, shot: `${key}-sheet-close-drag` });
      await page.locator('.modal-layer').waitFor({ state: 'detached' });
      assert.deepEqual(errors, []); await context.close();
    }
    // 3. Active workout logger stays edge-only.
    {
      const state = createReturningUserFixture(6); state.profile.appearancePreference = appearance; state.profile.themePreference = appearance; state.selectedDate = isoDay();
      state.activeWorkout = startWorkout(state, structuredClone(state.program.days[0]));
      const { context, page, drag, backs, errors } = await session({ width, appearance, state });
      await page.getByRole('button', { name: /RESUME WORKOUT/i }).first().click();
      await page.getByRole('button', { name: 'Back to Today' }).waitFor(); await page.waitForTimeout(300);
      await drag({ x: width * .5, y: 300, dx: width * .45 });
      assert.deepEqual(await backs(), ['Back to Today'], 'mid-screen drag keeps the logger');
      await drag({ x: 4, y: 300, dx: width * .6 });
      assert.equal(await page.locator('[data-active-workout]').count(), 0, 'edge drag still leaves the logger');
      assert.deepEqual(errors, []); await context.close();
    }
    results.push(key); console.log('PASS', key);
  }
  // 4. Browser tab: mid-screen Back works. The edge stays the browser's own
  // history gesture (edgeBack.test.js covers that our handler never claims it).
  {
    const { context, page, drag, backs, errors } = await session({ width: 393, appearance: 'light', standalone: false });
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.locator('[data-profile-area="preferences"]').click();
    await page.getByRole('button', { name: 'Back to Profile' }).waitFor();
    await drag({ x: 150, y: 420, dx: 200 }); assert.deepEqual(await backs(), []);
    assert.deepEqual(errors, []); await context.close(); console.log('PASS browser-tab');
  }
  // 5. Freestyle Add rows keep their rightward swipe.
  {
    const { context, page, drag, errors } = await session({ width: 393, appearance: 'light' });
    await startFreestyle(page);
    await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click();
    const row = page.locator('[data-swipe-mode="add"] [data-swipe-row][data-swipe-enabled="true"]').first();
    await row.waitFor(); await page.waitForTimeout(350);
    const sheet = await page.locator('.modal-layer > main').count(), box = await row.boundingBox();
    await drag({ x: box.x + 60, y: box.y + box.height / 2, dx: 180 });
    assert.equal(await page.locator('.modal-layer > main').count(), sheet, 'Add swipe did not navigate Back');
    assert.deepEqual(errors, []); await context.close(); console.log('PASS freestyle-add-row');
  }
} finally { await browser.close(); }
console.log(`Full-width swipe Back passed: ${results.join(', ')}, browser tab, freestyle Add rows. Screenshots in ${out}.`);
