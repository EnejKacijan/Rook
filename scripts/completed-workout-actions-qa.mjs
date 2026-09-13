import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, weekday, isoDay, WEEKDAYS, startWorkout } from '../src/domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';

const before = process.argv.includes('--before');
const guardsOnly = process.argv.includes('--guards-only');
const base = process.env.QA_URL || 'http://127.0.0.1:4177';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/completed-workout-actions';
await mkdir(out, { recursive: true });
const results = [], browser = await chromium.launch({ channel: 'chrome', headless: true });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
const settle = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
function fixture(style, appearance, kind, photo) {
  let s = blankState(); const today = weekday(), index = WEEKDAYS.indexOf(today);
  Object.assign(s.profile, { onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2,
    availableDays: [today, WEEKDAYS[(index + 3) % 7]], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
    priorities: ['Balanced'], stylePreference: style, appearancePreference: appearance, themePreference: style === 'premium' ? 'premium' : appearance });
  s.program = buildProgram(s.profile); s.selectedDate = isoDay(); s.selectedDay = today; s.ai.planUpgradeDismissed = true;
  for (let i = 0; i < 2; i++) {
    s = addFreestyleExercise(startFreestyleWorkout(s), 'push-up');
    Object.assign(s.activeWorkout.exercises[0].sets[0], { reps: 8, completed: true }); s = completeWorkout(s);
  }
  if (kind === 'planned') {
    s.activeWorkout = startWorkout(s, s.program.days.find(d => d.weekday === today));
    for (const e of s.activeWorkout.exercises) for (const set of e.sets) Object.assign(set, { reps: 8, completed: true });
    s = completeWorkout(s);
    s.workouts.at(-1).name = 'Upper body strength — a longer completed workout title for narrow screens';
  }
  s.workouts.at(-1).sessionNote = 'Keep this note · brez spremembe.';
  if (photo) s.workouts.at(-1).photoId = 'target-photo';
  return s;
}
async function photos(page, add) {
  return page.evaluate(items => new Promise((resolve, reject) => {
    const request = indexedDB.open('rook-workout-media', 3);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('photos')) request.result.createObjectStore('photos', { keyPath: 'id' }); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('photos', items ? 'readwrite' : 'readonly');
      if (items) for (const item of items) tx.objectStore('photos').put({ ...item, createdAt: new Date().toISOString(), mimeType: 'image/png', width: 1, height: 1,
        blob: new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GHEAAAAASUVORK5CYII='), c => c.charCodeAt(0))], { type: 'image/png' }) });
      const q = tx.objectStore('photos').getAll(); tx.oncomplete = () => { db.close(); resolve(q.result.map(p => ({ id: p.id, workoutId: p.workoutId, bytes: p.blob.size }))); }; tx.onerror = () => reject(tx.error);
    };
  }), add);
}
async function open(seed, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
  await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, seed);
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
  await page.goto(base); await page.locator('.today-screen').waitFor(); await settle(page);
  if (seed.workouts.at(-1).photoId) await photos(page, [{ id: 'target-photo', workoutId: seed.workouts.at(-1).id }, { id: 'retained-photo', workoutId: seed.workouts[0].id }]);
  const row = page.locator(`[data-workout-id="${seed.workouts.at(-1).id}"]`);
  if (await row.count()) await row.click();
  else await page.getByRole('button', { name: 'WORKOUT COMPLETE · VIEW HISTORY', exact: true }).click();
  await page.locator('.completed-workout-detail').waitFor(); await settle(page);
  return { context, page, cdp, errors };
}
const layout = page => page.locator('.completed-workout-detail').evaluate(p => {
  const rect = e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  return { panel: rect(p), title: rect(p.querySelector('h1')), summary: rect(p.querySelector('.completed-workout-summary')), scroll: p.scrollTop, body: document.body.style.cssText };
});
try {
  for (const width of guardsOnly ? [] : [320, 390]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
    if (before && !(style === 'standard' && appearance === 'dark')) continue;
    const kind = style === 'standard' ? 'planned' : 'freestyle', withPhoto = appearance === 'dark';
    const seed = fixture(style, appearance, kind, withPhoto), key = `${width}-${style}-${appearance}`;
    const { context, page, cdp, errors } = await open(seed, width);
    try {
      const detail = page.locator('.completed-workout-detail');
      if (before) {
        await page.screenshot({ path: `${out}/before-${width}-detail.png` });
        await detail.getByRole('button', { name: 'Workout options', exact: true }).click(); await settle(page);
        await page.screenshot({ path: `${out}/before-${width}-options.png` }); continue;
      }
      const trigger = detail.getByRole('button', { name: 'Delete workout', exact: true }), confirmation = page.locator('.completed-workout-delete-confirm');
      assert.equal(await detail.getByRole('button', { name: 'Workout options', exact: true }).count(), 0);
      const geometry = await detail.locator('.completed-workout-detail-actions button').evaluateAll(buttons => buttons.map(b => { const r = b.getBoundingClientRect(), css = getComputedStyle(b); return { x: r.x, y: r.y, width: r.width, height: r.height, background: css.backgroundColor, border: css.borderWidth, color: css.color }; }));
      assert.ok(geometry.every(b => b.width >= 44 && b.height >= 44 && b.background === 'rgba(0, 0, 0, 0)' && b.border === '0px'));
      assert.equal(geometry[0].y, geometry[1].y); assert.ok(geometry[0].x + geometry[0].width < geometry[1].x);
      assert.equal(await detail.locator('.completed-workout-detail-actions').evaluate(p => p.scrollWidth > p.clientWidth), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${out}/${key}-detail.png` });
      // Existing Edit handler and correction save path, not the removed menu.
      await detail.getByRole('button', { name: 'Edit', exact: true }).click(); const editor = page.locator('.history-correction-editor'); await editor.waitFor();
      if (width === 390 && appearance === 'light') {
        await editor.getByRole('textbox', { name: 'Session note', exact: true }).fill('Edited through the existing correction flow.');
        await editor.getByRole('button', { name: 'REVIEW CHANGES', exact: true }).click();
        await editor.getByRole('button', { name: 'SAVE CHANGES', exact: true }).click();
      } else await editor.getByRole('button', { name: 'CANCEL', exact: true }).click();
      await detail.waitFor(); await settle(page);
      await detail.locator('.session-log-trigger').first().click(); await settle(page);
      await trigger.scrollIntoViewIfNeeded();
      // Keep a nonzero scroll while Delete is visible, then compare exact DOM and geometry.
      await detail.evaluate(p => { const b = p.querySelector('[aria-label="Delete workout"]').getBoundingClientRect(); if (b.top - p.getBoundingClientRect().top > 100) p.scrollTop += 20; });
      await page.evaluate(() => { window.__qaDetail = document.querySelector('.completed-workout-detail'); window.__qaNote = window.__qaDetail.querySelector('textarea'); });
      const original = await layout(page), initial = await stored(page), initialPhotos = await photos(page);
      const openConfirm = async () => {
        await trigger.click(); await confirmation.waitFor(); await settle(page);
        assert.deepEqual(await layout(page), original, 'Confirmation leaves detail layout and scroll unchanged');
        assert.equal(await page.evaluate(() => window.__qaDetail === document.querySelector('.completed-workout-detail') && window.__qaNote.isConnected), true);
        assert.equal(await detail.evaluate(p => p.inert), true);
        assert.deepEqual((await stored(page)).workouts, initial.workouts);
        assert.ok(await confirmation.getByText('Any photos attached to this workout will also be deleted. This cannot be undone.', { exact: true }).isVisible());
        assert.equal(await confirmation.evaluate(p => p.scrollWidth > p.clientWidth), false);
      };
      for (const method of ['cancel', 'back', 'escape', 'backdrop', 'drag']) {
        await openConfirm();
        if (method === 'cancel') { await page.screenshot({ path: `${out}/${key}-confirmation.png` }); await confirmation.getByRole('button', { name: 'CANCEL', exact: true }).click(); }
        if (method === 'back') await confirmation.getByRole('button', { name: 'Back to workout details', exact: true }).click();
        if (method === 'escape') await page.keyboard.press('Escape');
        if (method === 'backdrop') { const bounds = await confirmation.boundingBox(); await page.mouse.click(8, bounds.y - 12); }
        if (method === 'drag') {
          const b = await confirmation.getByRole('button', { name: 'Drag down or tap to close', exact: true }).boundingBox(), x = b.x + b.width / 2, y = b.y + 10;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 25 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        await confirmation.waitFor({ state: 'detached' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Delete workout');
        assert.deepEqual(await layout(page), original);
        assert.equal(await detail.locator('.session-log-trigger').first().getAttribute('aria-expanded'), 'true');
        assert.equal(await detail.getByRole('textbox', { name: 'Session note' }).inputValue(), initial.workouts.at(-1).sessionNote);
        assert.deepEqual(await photos(page), initialPhotos);
      }
      // Tab must retain the normal keyboard focus indicator on both actions.
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
      assert.ok(await trigger.evaluate(b => b === document.activeElement && b.matches(':focus-visible') && getComputedStyle(b).outlineStyle !== 'none'));
      const initialBounds = await trigger.boundingBox();
      await page.touchscreen.tap(initialBounds.x + initialBounds.width / 2, initialBounds.y + initialBounds.height / 2);
      await page.touchscreen.tap(initialBounds.x + initialBounds.width / 2, initialBounds.y + initialBounds.height / 2);
      await confirmation.waitFor(); await settle(page);
      assert.deepEqual((await stored(page)).workouts, initial.workouts, 'Repeated initial tap cannot delete');
      // A second touch may hit the backdrop and cancel a compact confirmation.
      // That is safe; reopen before the independent explicit confirmation below.
      if (await confirmation.count() && await confirmation.evaluate(p => Boolean(p.style.transition))) await confirmation.waitFor({ state: 'detached' });
      if (!await confirmation.count()) await openConfirm();
      let rollback = false;
      if (withPhoto && style === 'standard') {
        await page.evaluate(() => { const originalSet = Storage.prototype.setItem; let failed = false; Storage.prototype.setItem = function(k, v) { if (k === 'lift-v2-state' && !failed) { failed = true; throw new DOMException('QA one-shot persistence failure', 'QuotaExceededError'); } return originalSet.call(this, k, v); }; });
        await confirmation.getByRole('button', { name: 'DELETE WORKOUT', exact: true }).click();
        await confirmation.getByRole('alert').waitFor();
        assert.deepEqual((await stored(page)).workouts, initial.workouts); assert.deepEqual(await photos(page), initialPhotos); rollback = true;
      }
      await confirmation.getByRole('button', { name: 'DELETE WORKOUT', exact: true }).click();
      const id = seed.workouts.at(-1).id;
      await page.waitForFunction(id => !JSON.parse(localStorage.getItem('lift-v2-state')).workouts.some(w => w.id === id), id);
      await page.locator('.modal-layer').waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.locator('.screen[inert], .screen[aria-hidden="true"]').count(), 0);
      await page.reload(); await page.locator('.today-screen').waitFor();
      const final = await stored(page); assert.deepEqual(final.program, initial.program);
      assert.deepEqual(final.workouts, initial.workouts.filter(w => w.id !== id));
      assert.deepEqual(await photos(page), initialPhotos.filter(p => p.workoutId !== id)); assert.deepEqual(errors, []);
      results.push({ key, kind, withPhoto, geometry, stableDetail: true, noteAndDisclosureRetained: true, dismissals: 5, keyboardFocus: true, doubleTapSafe: true, rollback, exactIdDeletion: true, reload: true });
      console.log(`PASS ${key}`);
    } catch (error) { await page.screenshot({ path: `${out}/failure-${key}.png` }); throw error; }
    finally { await context.close(); }
  }
  if (!before) for (const guard of ['activeWorkout', 'activeOptionalSession', 'history-entry']) {
    let seed = fixture('standard', 'dark', 'freestyle', false);
    if (guard === 'activeWorkout') seed = startFreestyleWorkout(seed);
    if (guard === 'activeOptionalSession') seed.activeOptionalSession = { id: 'active-optional', date: isoDay(), kind: 'Mobility', activity: 'Mobility', status: 'active', startedAt: Date.now(), elapsedSeconds: 0 };
    const { context, page, errors } = await open(seed, 390);
    try {
      const initial = await stored(page);
      if (guard !== 'history-entry') {
        assert.ok(await page.locator('.completed-workout-detail').getByRole('button', { name: 'Delete workout', exact: true }).isDisabled());
        assert.ok(await page.getByText('Finish your active workout before deleting history.', { exact: true }).isVisible());
      } else {
        await page.getByRole('button', { name: 'Close workout details', exact: true }).click();
        await page.locator('.completed-workout-detail').waitFor({ state: 'detached' });
        // The independent Today menu still uses its existing shared sheet.
        await page.getByRole('button', { name: 'Today options', exact: true }).click();
        const menu = page.locator('.today-actions-sheet'); await menu.waitFor();
        assert.ok(await menu.getByRole('button', { name: 'Drag down or tap to close', exact: true }).isVisible());
        await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
        await page.getByRole('button', { name: /^progress$/i }).click();
        await page.locator('.recent-session-row').first().click();
        const detail = page.locator('.completed-workout-detail'); await detail.waitFor();
        await detail.getByRole('button', { name: 'Delete workout', exact: true }).click();
        await page.locator('.completed-workout-delete-confirm').getByRole('button', { name: 'CANCEL', exact: true }).click();
        await page.locator('.completed-workout-delete-confirm').waitFor({ state: 'detached' });
        assert.deepEqual((await stored(page)).workouts, initial.workouts);
      }
      assert.deepEqual(errors, []); results.push({ guard, pass: true }); console.log(`PASS ${guard}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${out}/${before ? 'before' : guardsOnly ? 'guards' : 'results'}.json`, JSON.stringify(results, null, 2)); }
