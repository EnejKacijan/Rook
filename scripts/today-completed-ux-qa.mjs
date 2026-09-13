import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const base = process.env.QA_URL || 'http://127.0.0.1:4177';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/today-completed-ux';
await mkdir(out, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
const settle = page => page.evaluate(() => Promise.all(document.getAnimations()
  .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
  .map(animation => animation.finished.catch(() => {}))));

function fixture(count, style, appearance, active = false) {
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
  state.selectedDate = isoDay(); state.selectedDay = weekday(); state.ai.planUpgradeDismissed = true;
  for (let i = 0; i < count; i++) {
    state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
    Object.assign(state.activeWorkout.exercises[0].sets[0], { reps: 8, completed: true });
    state = completeWorkout(state);
    state.workouts.at(-1).completedAt = new Date(Date.now() - (count - i) * 60000).toISOString();
  }
  if (active) state = addFreestyleExercise(startFreestyleWorkout(state), 'push-up');
  return state;
}

async function open(seed, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true,
    isMobile: true, serviceWorkers: 'block', reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
  await context.addInitScript(value => {
    if (!localStorage.getItem('completed-ux-seeded')) {
      localStorage.setItem('lift-v2-state', JSON.stringify(value));
      localStorage.setItem('completed-ux-seeded', 'yes');
    }
  }, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
  await page.goto(base);
  await page.locator('.today-screen').waitFor();
  await settle(page);
  return { context, page, cdp, errors };
}

async function photos(page, add) {
  return page.evaluate(items => new Promise((resolve, reject) => {
    const request = indexedDB.open('rook-workout-media', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('photos', items ? 'readwrite' : 'readonly');
      if (items) for (const item of items) tx.objectStore('photos').put({ ...item,
        createdAt: new Date().toISOString(), mimeType: 'image/png', width: 1, height: 1,
        blob: new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GHEAAAAASUVORK5CYII='), c => c.charCodeAt(0))], { type: 'image/png' }),
      });
      const query = tx.objectStore('photos').getAll();
      tx.oncomplete = () => { db.close(); resolve(query.result.map(item => ({ id: item.id, workoutId: item.workoutId, size: item.blob.size }))); };
      tx.onerror = () => reject(tx.error);
    };
  }), add);
}

async function layout(page) {
  return page.locator('.completed-workout-detail').evaluate(panel => {
    const rect = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    return { panel: rect(panel), title: rect(panel.querySelector('h1')),
      summary: rect(panel.querySelector('.completed-workout-summary')), scroll: panel.scrollTop };
  });
}

async function menuQA(page, cdp, key, withPhoto, errors) {
  const initial = await stored(page), target = initial.workouts.at(-1);
  const initialPhotos = await photos(page);
  const detail = page.locator('.completed-workout-detail');
  await page.locator(`[data-workout-id="${target.id}"]`).click();
  await detail.waitFor(); await settle(page);
  // The underlying detail is intentionally aria-hidden/inert while its menu owns focus.
  const trigger = detail.locator('button[aria-label="Workout options"]');
  const original = await layout(page);
  const lock = await page.evaluate(() => document.body.style.cssText);
  const menu = page.locator('.completed-workout-actions-sheet');
  const openMenu = async () => {
    await trigger.click(); await menu.waitFor(); await settle(page);
    assert.deepEqual(await layout(page), original, 'Opening menu must not move detail content');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.ok(await detail.evaluate(panel => panel.inert));
    assert.equal(await menu.getByRole('button', { name: 'Edit workout', exact: true }).count(), 1);
    const remove = menu.getByRole('button', { name: 'Delete workout', exact: true });
    assert.ok((await remove.getAttribute('class')).includes('danger-text'));
    assert.ok(await menu.getByRole('button', { name: 'Drag down or tap to close', exact: true }).isVisible());
    const geometry = await menu.evaluate(panel => {
      const r = panel.getBoundingClientRect();
      return { bottom: r.bottom, padding: parseFloat(getComputedStyle(panel).paddingBottom),
        overflow: panel.scrollWidth > panel.clientWidth,
        width: panel.clientWidth, scrollWidth: panel.scrollWidth,
        children: [...panel.children].map(child => ({ tag: child.className, width: child.getBoundingClientRect().width })) };
    });
    assert.ok(geometry.bottom <= 845); assert.ok(geometry.padding >= 54); assert.equal(geometry.overflow, false, JSON.stringify(geometry));
  };
  const closed = async () => {
    await menu.waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('.completed-workout-detail').inert);
    assert.equal(await page.locator('.modal-layer').count(), 1);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await layout(page), original);
    assert.equal(await page.evaluate(() => document.body.style.cssText), lock);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Workout options');
  };
  for (const method of ['close', 'backdrop', 'escape', 'drag']) {
    await openMenu();
    if (withPhoto && (key.startsWith('390-') || key.includes('standard-dark')) && method === 'close') await page.screenshot({ path: `${out}/${key}-menu.png` });
    if (method === 'close') await menu.getByRole('button', { name: 'Close workout options', exact: true }).click();
    if (method === 'backdrop') { const bounds = await menu.boundingBox(); await page.mouse.click(8, bounds.y - 12); }
    if (method === 'escape') await page.keyboard.press('Escape');
    if (method === 'drag') {
      const bounds = await menu.getByRole('button', { name: 'Drag down or tap to close', exact: true }).boundingBox();
      const x = bounds.x + bounds.width / 2, y = bounds.y + 10;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 24 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await closed();
  }
  await openMenu();
  await menu.getByRole('button', { name: 'Edit workout', exact: true }).click();
  const editor = page.locator('.history-correction-editor'); await editor.waitFor();
  assert.equal(await menu.count(), 0);
  assert.equal(await page.locator('.modal-layer').count(), 1);
  await editor.getByRole('button', { name: 'CANCEL', exact: true }).click();
  await detail.waitFor();
  assert.deepEqual((await stored(page)).workouts, initial.workouts, 'Editor cancel preserves records');
  await trigger.click(); await menu.waitFor();
  await menu.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await page.getByRole('heading', { name: 'Delete this workout?', exact: true }).waitFor();
  assert.ok(await page.getByText('Any photos attached to this workout will also be deleted. This cannot be undone.', { exact: true }).isVisible());
  assert.equal(await menu.count(), 0);
  assert.deepEqual((await stored(page)).workouts, initial.workouts, 'Entering confirmation does not delete');
  await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
  assert.deepEqual((await stored(page)).workouts, initial.workouts);
  assert.deepEqual(await photos(page), initialPhotos);
  await trigger.click(); await menu.waitFor();
  await menu.getByRole('button', { name: 'Delete workout', exact: true }).click();
  await page.getByRole('heading', { name: 'Delete this workout?', exact: true }).waitFor();
  if (withPhoto && key.includes('standard-dark')) {
    await page.evaluate(() => {
      const set = Storage.prototype.setItem; let failed = false;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'lift-v2-state' && !failed) { failed = true; throw new DOMException('QA single write failure', 'QuotaExceededError'); }
        return set.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'DELETE WORKOUT', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /could not be deleted/ }).waitFor();
    assert.deepEqual((await stored(page)).workouts, initial.workouts);
    assert.deepEqual(await photos(page), initialPhotos, 'Failed delete retains photo bytes');
  }
  await page.getByRole('button', { name: 'DELETE WORKOUT', exact: true }).click();
  await page.waitForFunction(id => !JSON.parse(localStorage.getItem('lift-v2-state')).workouts.some(w => w.id === id), target.id);
  await page.locator('.modal-layer').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  assert.equal(await page.locator('[inert], [aria-hidden="true"].screen').count(), 0);
  // With the sole completed row removed, Today can fit in 844px. A shorter
  // viewport provides real overflow for the document-unlock check.
  await page.setViewportSize({ width: page.viewportSize().width, height: 500 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => scrollY > 0);
  await page.setViewportSize({ width: page.viewportSize().width, height: 844 });
  await page.reload(); await page.locator('.rest-up-next').waitFor();
  const final = await stored(page);
  assert.deepEqual(final.program, initial.program, 'Permanent plan unchanged');
  assert.deepEqual(final.workouts, initial.workouts.filter(w => w.id !== target.id));
  assert.deepEqual(await photos(page), initialPhotos.filter(photo => photo.workoutId !== target.id));
  assert.deepEqual(errors, []);
  return { repeatedDismissal: 'close/backdrop/escape/drag', editCancel: true, deleteCancel: true,
    deleteConfirm: true, withPhoto, reload: true, stableDetail: true, documentScrollRestored: true };
}

try {
  for (const width of [320, 390]) for (const style of ['standard', 'premium'])
    for (const appearance of ['light', 'dark']) for (const count of [0, 1, 2, 3]) {
      if (before && !(style === 'standard' && appearance === 'dark' && count === 2)) continue;
      const seed = fixture(count, style, appearance), withPhoto = count === 2;
      if (withPhoto) seed.workouts.at(-1).photoId = 'target-photo';
      const { context, page, cdp, errors } = await open(seed, width);
      const key = `${width}-${style}-${appearance}-${count}`;
      try {
        if (withPhoto) await photos(page, [{ id: 'target-photo', workoutId: seed.workouts.at(-1).id },
          { id: 'retained-photo', workoutId: seed.workouts[0].id }]);
        const list = page.locator('.today-completed-workouts');
        assert.equal(await list.count(), count ? 1 : 0);
        assert.equal(await list.locator('.eyebrow').count(), count > 1 ? 1 : 0);
        assert.deepEqual(await list.locator('.list-row').evaluateAll(rows => rows.map(row => row.dataset.workoutId)), seed.workouts.map(w => w.id).reverse());
        const geometry = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.today-completed-workouts > .list-row')];
          const next = document.querySelector('.rest-up-next');
          const last = rows.at(-1);
          return { rowBorders: rows.map(row => getComputedStyle(row).borderBottomWidth),
            rowPadding: rows.map(row => getComputedStyle(row).padding),
            rowHeights: rows.map(row => row.getBoundingClientRect().height),
            gap: last ? next.getBoundingClientRect().top - last.getBoundingClientRect().bottom : null,
            visualGap: last ? next.getBoundingClientRect().top - last.querySelector('span').getBoundingClientRect().bottom : null,
            nextBorder: getComputedStyle(next).borderTopWidth, nextMargin: getComputedStyle(next).marginTop,
            overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.deepEqual(geometry.rowBorders, Array.from({ length: count }, (_, i) => i === count - 1 ? '0px' : '1px'));
        assert.equal(geometry.nextBorder, '1px'); assert.equal(geometry.overflow, false);
        assert.ok(geometry.rowPadding.every(value => value === '15px 0px'));
        assert.equal(geometry.nextMargin, before || !count ? '30px' : '16px');
        if (!before && count) assert.ok(geometry.visualGap >= 24 && geometry.visualGap <= 32, JSON.stringify(geometry));
        if (count === 2 && style === 'standard' && appearance === 'dark') {
          await page.locator('.rest-up-next').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${out}/${phase}-${width}-list.png` });
        }
        let menu;
        if (before) {
          await list.locator('.list-row').first().click(); await settle(page);
          const initial = await layout(page);
          await page.getByRole('button', { name: 'Workout options', exact: true }).click();
          menu = { before: initial, after: await layout(page) };
          await page.screenshot({ path: `${out}/before-${width}-inline-menu.png` });
        } else if (count === 1 || count === 2) menu = await menuQA(page, cdp, key, withPhoto, errors);
        results.push({ key, geometry, menu }); console.log(`PASS ${phase} ${key}`);
      } catch (error) {
        await page.screenshot({ path: `${out}/failure-${key}.png` });
        await writeFile(`${out}/failure-${key}.html`, await page.content());
        throw error;
      } finally { await context.close(); }
    }
  if (!before) {
    const { context, page } = await open(fixture(1, 'standard', 'dark', true), 390);
    try {
      await page.locator('.today-completed-workouts .list-row').click();
      await page.getByRole('button', { name: 'Workout options', exact: true }).click();
      const menu = page.locator('.completed-workout-actions-sheet'); await menu.waitFor();
      assert.ok(await menu.getByRole('button', { name: 'Delete workout', exact: true }).isDisabled());
      assert.ok(await menu.getByText('Finish your active workout before deleting history.', { exact: true }).isVisible());
      results.push({ activeWorkoutDeletionGuard: true }); console.log('PASS active workout deletion guard');
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/${phase}.json`, `${JSON.stringify(results, null, 2)}\n`);
}
