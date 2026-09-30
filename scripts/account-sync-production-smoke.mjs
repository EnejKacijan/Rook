// Opt-in, isolated synthetic profile. Never runs against an existing browser profile.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

if (process.env.ROOK_PRODUCTION_SYNC_SMOKE !== '1')
  throw new Error('Set ROOK_PRODUCTION_SYNC_SMOKE=1 to create an isolated synthetic cloud-backup QA profile.');

const url = process.env.ROOK_PRODUCTION_URL || 'https://rook-training.netlify.app/';
const fixture = createReturningUserFixture(1);
const identity = {
  profileId: fixture.profile.id,
  programId: fixture.program.id,
  workoutIds: fixture.workouts.map(workout => workout.id),
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(state => localStorage.setItem('lift-v2-state', JSON.stringify(state)), fixture);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Account and sync' });
  await panel.waitFor();
  try { await panel.getByText('Synced', { exact: true }).waitFor({ timeout: 90000 }); }
  catch (error) { throw new Error(`Synthetic production backup did not complete: ${await panel.innerText()}`, { cause: error }); }
  const result = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lift-v2-state') || 'null');
    const ledger = JSON.parse(localStorage.getItem('rook-account-sync-ledger-v1') || 'null');
    return {
      profileId: state?.profile?.id,
      programId: state?.program?.id,
      workoutIds: state?.workouts?.map(workout => workout.id),
      uidBound: Boolean(ledger?.accountUid),
      pending: ledger?.pending?.length,
      onboardingComplete: state?.profile?.onboardingComplete,
    };
  });
  assert.deepEqual(result, { ...identity, uidBound: true, pending: 0, onboardingComplete: true });
  assert.deepEqual(errors, []);
  console.log(`PASS isolated production anonymous backup: ${result.workoutIds.length} workouts, stable IDs, empty outbox`);
  await context.close();
} finally { await browser.close(); }
