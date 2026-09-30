import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { saveState } from '../src/domain.js';
import { ensureAccountSyncLedger } from '../src/accountSyncOutbox.js';
import { PRIMARY_KEY } from '../src/localStateStorage.js';

const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4273';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const themes = [['standard', 'light'], ['standard', 'dark'], ['premium', 'light'], ['premium', 'dark']];
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
try {
  if (process.env.ROOK_ACCOUNT_QA_ONLY !== '1') for (const width of [320, 390, 430]) for (const [visualStyle, appearance] of themes) {
    for (const trainingStyle of ['plan', 'own-workouts', 'freestyle']) {
      const state = createReturningUserFixture(1);
      Object.assign(state.profile, { preferredTrainingStyle: trainingStyle,
        stylePreference: visualStyle, appearancePreference: appearance,
        themePreference: visualStyle === 'premium' ? 'premium' : appearance });
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true,
        reducedMotion: width === 320 ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
      await context.addInitScript(data => localStorage.setItem('lift-v2-state', JSON.stringify(data)), state);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
      await page.goto(`${origin}/?training-style-qa=${trainingStyle}-${width}-${visualStyle}-${appearance}`, { waitUntil: 'commit' });
      if (trainingStyle === 'plan') await page.locator('.today-screen .week-strip').first().waitFor();
      else {
        await page.locator('.no-plan-today').waitFor();
        assert.equal(await page.locator('.today-screen .week-strip').count(), 0);
        assert.equal(await page.getByText('Return to your saved plan').count(), 1);
        if (trainingStyle === 'freestyle') assert.equal(await page.locator('.freestyle-entry .button.primary').count(), 1);
        else assert.equal(await page.locator('.freestyle-entry .button.secondary').count(), 1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
        `${trainingStyle}/${width}/${visualStyle}/${appearance} overflow`);
      assert.equal(await page.locator('html').getAttribute('data-style'), visualStyle);
      assert.equal(await page.locator('html').getAttribute('data-appearance'), appearance);
      const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), PRIMARY_KEY);
      assert.equal(persisted.program?.id, state.program.id);
      assert.deepEqual(persisted.workouts.map(workout => workout.id), state.workouts.map(workout => workout.id));
      if (trainingStyle === 'freestyle' && width === 390 && visualStyle === 'premium' && appearance === 'dark') {
        await page.getByRole('button', { name: 'Return to your saved plan' }).click();
        await page.locator('.today-screen .week-strip').first().waitFor();
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).program?.id, PRIMARY_KEY), state.program.id);
      }
      assert.deepEqual(errors, [], `${trainingStyle}/${width}/${visualStyle}/${appearance} page error`);
      await context.close();
    }
  }

  if (process.env.ROOK_ACCOUNT_QA_ONLY !== '1') for (const width of [320, 390, 430]) for (const [visualStyle, appearance] of themes) {
    const state = createReturningUserFixture(0);
    Object.assign(state.profile, { stylePreference: visualStyle, appearancePreference: appearance,
      themePreference: visualStyle === 'premium' ? 'premium' : appearance });
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true,
      reducedMotion: width === 320 ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
    await context.addInitScript(([data, key]) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('rook-account-signed-out-v1', 'true');
    }, [state, PRIMARY_KEY]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?account-lock-layout-qa=${width}-${visualStyle}-${appearance}`, { waitUntil: 'commit' });
    await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-style'), visualStyle);
    assert.equal(await page.locator('html').getAttribute('data-appearance'), appearance);
    await page.getByRole('button', { name: 'Use another ROOK profile' }).click();
    await page.getByRole('button', { name: 'START WITHOUT AN ACCOUNT' }).click();
    await page.getByRole('dialog', { name: 'Start a separate ROOK profile?' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
      `account lock ${width}/${visualStyle}/${appearance} overflow`);
    const targets = await page.getByRole('dialog', { name: 'Start a separate ROOK profile?' }).locator('button').evaluateAll(buttons =>
      buttons.map(button => ({ label: button.textContent, height: button.getBoundingClientRect().height })));
    assert.ok(targets.every(target => target.height >= 44), `account confirm ${width}/${visualStyle}/${appearance} touch target`);
    assert.deepEqual(errors, []);
    await context.close();
  }

  const owner = createReturningUserFixture(2), store = memoryStorage();
  assert.equal(saveState(owner, { storage: store, reason: 'qa-owner' }), true);
  ensureAccountSyncLedger(store, owner.profile.id, { accountUid: 'qa-owner-uid' });
  store.setItem('rook-account-signed-out-v1', 'true');
  const ownerRaw = store.getItem(PRIMARY_KEY), seed = [...store.values];
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true,
    reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(entries => {
    if (localStorage.getItem('rook-qa-profile-seeded') === 'true') return;
    for (const [key, value] of entries) localStorage.setItem(key, value);
    localStorage.setItem('rook-qa-profile-seeded', 'true');
  }, seed);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
  await page.goto(`${origin}/?account-lock-qa`, { waitUntil: 'commit' });
  await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
  await mkdir('artifacts/training-style-account', { recursive: true });
  await page.screenshot({ path: 'artifacts/training-style-account/locked-320.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.getByRole('button', { name: 'Use another ROOK profile' }).click();
  await page.getByRole('button', { name: 'START WITHOUT AN ACCOUNT' }).click();
  await page.getByRole('dialog', { name: 'Start a separate ROOK profile?' }).waitFor();
  await page.screenshot({ path: 'artifacts/training-style-account/separate-confirm-320.png' });
  await page.getByRole('button', { name: 'GO BACK' }).click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), PRIMARY_KEY), ownerRaw);
  await page.getByRole('button', { name: 'START WITHOUT AN ACCOUNT' }).click();
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
  await page.getByText('STARTING POINT', { exact: true }).waitFor();
  assert.notEqual(await page.evaluate(key => localStorage.getItem(key), PRIMARY_KEY), ownerRaw);
  assert.equal(await page.evaluate(([id, key]) => {
    const slot = JSON.parse(localStorage.getItem(`rook-profile-slot-v1:${id}`));
    return slot.bundle[key];
  }, [owner.profile.id, PRIMARY_KEY]), ownerRaw);
  await page.getByRole('button', { name: 'Back to plan options' }).click();
  await page.getByRole('heading', { name: 'A plan that fits your week.' }).waitFor();
  await page.getByRole('button', { name: 'Return to saved profile' }).click();
  await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), PRIMARY_KEY), ownerRaw);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(process.env.ROOK_ACCOUNT_QA_ONLY === '1'
    ? 'PASS: locked → separate → saved profile cycle'
    : 'PASS: 36 Training Style cases, 12 locked-account layouts, and profile switch cycle');
} finally { await browser.close(); }
