import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, isoDay, weekday, WEEKDAYS } from '../src/domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';

const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/rest-day-action-priority';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true }), results = [];
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
const settle = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
function fixture(count, style, appearance, active = false) {
  let state = blankState(); const index = WEEKDAYS.indexOf(weekday());
  Object.assign(state.profile, { onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate',
    daysPerWeek: 2, availableDays: [WEEKDAYS[(index + 1) % 7], WEEKDAYS[(index + 3) % 7]],
    sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'],
    stylePreference: style, appearancePreference: appearance, themePreference: style === 'premium' ? 'premium' : appearance });
  state.program = buildProgram(state.profile); state.selectedDate = isoDay(); state.selectedDay = weekday(); state.ai.planUpgradeDismissed = true;
  for (let i = 0; i < count; i++) {
    state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
    Object.assign(state.activeWorkout.exercises[0].sets[0], { reps: 8, completed: true });
    state = completeWorkout(state);
    state.workouts.at(-1).completedAt = new Date(Date.now() - (count - i) * 60000).toISOString();
  }
  if (active) state = startFreestyleWorkout(state);
  return state;
}
async function open(state, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true,
    serviceWorkers: 'block', reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
  await context.addInitScript(state => {
    if (!localStorage.getItem('rest-priority-seeded')) {
      localStorage.setItem('lift-v2-state', JSON.stringify(state)); localStorage.setItem('rest-priority-seeded', 'yes');
    }
  }, state);
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:4177'); await page.locator('.today-screen').waitFor(); await settle(page);
  return { context, page, cdp, errors };
}
async function checkRest(page, count) {
  const rest = page.locator('.rest-day-state'); await rest.waitFor();
  assert.equal(await rest.getByRole('button', { name: 'Start freestyle workout', exact: true }).count(), count ? 0 : 1);
  assert.equal(await rest.getByText('Choose exercises as you go. Your plan won’t change.', { exact: true }).count(), count ? 0 : 1);
  assert.equal(await rest.locator('.today-completed-workouts > .list-row').count(), count);
  assert.equal(await rest.locator('.today-completed-workouts > .eyebrow').count(), count > 1 ? 1 : 0);
  assert.equal(await rest.getByRole('button', { name: 'Train today instead', exact: true }).count(), 1);
  const geometry = await rest.evaluate(el => {
    const list = el.querySelector('.today-completed-workouts'), last = list?.lastElementChild, next = el.querySelector('.rest-up-next');
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      contentGap: list ? list.getBoundingClientRect().top - el.querySelector(':scope > p').getBoundingClientRect().bottom : null,
      upNextGap: last ? next.getBoundingClientRect().top - last.querySelector('span').getBoundingClientRect().bottom : null,
      borders: [...el.querySelectorAll('.today-completed-workouts > .list-row')].map(e => getComputedStyle(e).borderBottomWidth),
      sectionBorder: getComputedStyle(next).borderTopWidth };
  });
  assert.equal(geometry.overflow, false); assert.equal(geometry.sectionBorder, '1px');
  if (count) {
    assert.ok(geometry.contentGap >= 16 && geometry.contentGap <= 32, JSON.stringify(geometry));
    assert.ok(geometry.upNextGap >= 24 && geometry.upNextGap <= 32, JSON.stringify(geometry));
    assert.deepEqual(geometry.borders, Array.from({ length: count }, (_, i) => i === count - 1 ? '0px' : '1px'));
  }
  return geometry;
}
async function openOptions(page) {
  await page.getByRole('button', { name: 'Today options', exact: true }).click();
  const menu = page.locator('.today-actions-sheet'); await menu.waitFor(); await settle(page); return menu;
}
async function closeOptions(page, menu) {
  await menu.getByRole('button', { name: 'Close More options', exact: true }).click();
  await page.locator('.modal-layer').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  assert.equal(await page.locator('.app-content').evaluate(e => e.inert), false);
}
async function deleteFirst(page, remaining) {
  const before = await stored(page);
  await page.locator('.today-completed-workouts > .list-row').first().click();
  await page.getByRole('button', { name: 'Workout options', exact: true }).click();
  await page.locator('.completed-workout-actions-sheet').getByRole('button', { name: 'Delete workout', exact: true }).click();
  await page.getByRole('heading', { name: 'Delete this workout?', exact: true }).waitFor();
  assert.equal((await stored(page)).workouts.length, before.workouts.length);
  await page.getByRole('button', { name: 'DELETE WORKOUT', exact: true }).click();
  await page.locator('.modal-layer').waitFor({ state: 'detached' });
  await checkRest(page, remaining);
}
try {
  for (const width of [320, 390]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
    for (const count of [0, 1, 2, 3]) {
      const seed = fixture(count, style, appearance), { context, page, errors } = await open(seed, width);
      const key = `${width}-${style}-${appearance}-${count}`;
      try {
        const initial = await stored(page), geometry = await checkRest(page, count);
        assert.deepEqual(await page.locator('.today-completed-workouts > .list-row').evaluateAll(rows => rows.map(e => e.dataset.workoutId)), initial.workouts.map(w => w.id).reverse());
        assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.style, document.documentElement.dataset.appearance]), [style, appearance]);
        if (count === 1 || count === 3) await page.screenshot({ path: `${out}/${key}.png`, fullPage: true });
        const menu = await openOptions(page);
        assert.equal(await menu.getByRole('button', { name: 'Drag down or tap to close', exact: true }).count(), 1);
        assert.equal(await menu.getByRole('button', { name: 'Start another freestyle workout', exact: true }).count(), count ? 1 : 0);
        assert.equal(await menu.getByRole('button', { name: 'Adjust week', exact: true }).count(), 1);
        assert.equal((await stored(page)).activeWorkout, null);
        await closeOptions(page, menu);
        // Existing availability on non-today dates is unchanged (no future/past creation).
        const other = WEEKDAYS.find(day => day !== weekday() && !seed.profile.availableDays.includes(day));
        await page.locator(`.week-strip button[aria-label^="${other} "]`).click();
        await page.locator('.rest-day-state').waitFor();
        assert.equal(await page.locator('.today-completed-workouts').count(), 0);
        assert.equal(await page.locator('.today-screen').getByRole('button', { name: 'Start freestyle workout', exact: true }).count(), 0);
        await page.locator('.week-strip button[aria-current="date"]').click(); await checkRest(page, count);
        await page.reload(); await page.locator('.today-screen').waitFor(); await checkRest(page, count);
        if (count === 1 || count === 3) {
          await deleteFirst(page, count - 1); await page.reload(); await page.locator('.today-screen').waitFor(); await checkRest(page, count - 1);
        }
        assert.deepEqual((await stored(page)).program, initial.program); assert.deepEqual(errors, []);
        results.push({ key, geometry, passed: true, dateSwitch: true, reload: true, deletion: count === 1 || count === 3 }); console.log('PASS', key);
      } finally { await context.close(); }
    }
    // Real UI lifecycle: start, cancel empty, start, log, finish, secondary start, resume, cancel.
    const seed = fixture(0, style, appearance), { context, page, cdp, errors } = await open(seed, width);
    const key = `${width}-${style}-${appearance}-lifecycle`;
    try {
      const plan = (await stored(page)).program;
      await page.getByRole('button', { name: 'Start freestyle workout', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel workout', exact: true }).click(); await checkRest(page, 0);
      await page.getByRole('button', { name: 'Start freestyle workout', exact: true }).click();
      await page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search exercises', exact: true }).fill('Push Up');
      await page.locator('.freestyle-picker .list-row').filter({ hasText: /^Push-up\s*bodyweight/ }).click();
      await page.getByRole('spinbutton', { name: 'Reps for set 1', exact: true }).fill('8');
      await page.getByRole('button', { name: 'Log set 1', exact: true }).click();
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await page.locator('.complete-screen').waitFor();
      await page.getByRole('button', { name: 'DONE', exact: true }).click(); await checkRest(page, 1);
      for (const method of ['drag', 'backdrop', 'close']) {
        const menu = await openOptions(page);
        if (method === 'drag') {
          const r = await menu.getByRole('button', { name: 'Drag down or tap to close', exact: true }).boundingBox();
          const x = r.x + r.width / 2, y = r.y + 12;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let i = 1; i <= 6; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 24 }] }); await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else if (method === 'backdrop') { const r = await menu.boundingBox(); await page.mouse.click(8, r.y - 12); }
        else await closeOptions(page, menu);
        await page.locator('.modal-layer').waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      }
      const menu = await openOptions(page);
      if (appearance === 'dark') await page.screenshot({ path: `${out}/${key}-overflow.png` });
      assert.ok(await menu.evaluate(e => parseFloat(getComputedStyle(e).paddingBottom) >= 54));
      await menu.getByRole('button', { name: 'Start another freestyle workout', exact: true }).click();
      // Preserve existing entry and safety checks; selecting a menu action alone creates no session.
      assert.equal((await stored(page)).activeWorkout, null);
      await page.locator('.today-actions-sheet').getByRole('button', { name: 'Start freestyle workout', exact: true }).click();
      await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
      await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).waitFor();
      assert.equal(await page.locator('.today-completed-workouts > .list-row').count(), 1);
      assert.equal(await page.locator('.today-screen').getByRole('button', { name: 'Start freestyle workout', exact: true }).count(), 0);
      const activeMenu = await openOptions(page); assert.equal(await activeMenu.locator('.list-row').count(), 1); await closeOptions(page, activeMenu);
      await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel workout', exact: true }).click(); await checkRest(page, 1);
      await deleteFirst(page, 0); assert.deepEqual((await stored(page)).program, plan); assert.deepEqual(errors, []);
      results.push({ key, passed: true, zeroSetCancel: true, actualCompletion: true, secondaryStart: true, activePrecedence: true, menuDismissal: ['drag', 'backdrop', 'close'] }); console.log('PASS', key);
    } catch (error) { await page.screenshot({ path: `${out}/${key}-failure.png` }); throw error; }
    finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
