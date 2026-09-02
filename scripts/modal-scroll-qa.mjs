import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { WEEKDAYS, buildProgram, isoDay, weekday } from '../src/domain.js';

const outputRoot = new URL('../artifacts/modal-scroll/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

async function openApp(state, viewport = { width: 390, height: 520 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
  const page = await context.newPage();
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, provider: null }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  return { context, page };
}

async function verifyScroller(page, locator, label) {
  await locator.waitFor();
  const state = await locator.evaluate(node => {
    const style = getComputedStyle(node);
    node.scrollTop = node.scrollHeight;
    return {
      overflowY: style.overflowY,
      overscroll: style.overscrollBehaviorY,
      touchAction: style.touchAction,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      scrollTop: node.scrollTop
    };
  });
  assert.match(state.overflowY, /auto|scroll/, `${label} has its own vertical scroll area`);
  assert.equal(state.overscroll, 'contain', `${label} does not scroll the frozen page behind it`);
  assert.match(state.touchAction, /pan-y/, `${label} allows native vertical touch gestures`);
  if (state.scrollHeight > state.clientHeight) assert.ok(state.scrollTop > 0, `${label} content can reach the bottom`);
  assert.equal(await page.evaluate(() => document.body.style.position), 'fixed', `${label} keeps the page behind fixed`);
  assert.equal(await page.locator('.app-content').getAttribute('inert'), '', `${label} makes the page behind inert`);
  await locator.evaluate(node => { node.scrollTop = 0; });
}

{
  const { context, page } = await openApp(createReturningUserFixture(6));
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  await page.getByRole('button', { name: /Logging & increments/ }).click();
  const logging = page.locator('.modal-layer > .detail-screen');
  await verifyScroller(page, logging, 'Logging');
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 568 });
    await page.screenshot({ path: output(`${width}-logging.png`) });
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.locator('.modal-layer').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Replace plan' }).click();
  await page.getByRole('button', { name: /Import from Notes|Import a different plan/ }).click();
  await verifyScroller(page, page.locator('.modal-layer > .import-plan-screen'), 'Import Plan');
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.locator('.modal-layer').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'PROGRESS', exact: true }).click();
  await page.locator('.working-weight-row').first().click();
  await verifyScroller(page, page.locator('.modal-layer > .detail-screen'), 'Exercise history');
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.locator('.modal-layer').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.position), '', 'closing restores normal document scrolling');
  await context.close();
}

{
  const state = createReturningUserFixture(2);
  const today = weekday();
  const todayIndex = WEEKDAYS.indexOf(today); state.profile.daysPerWeek = 2; state.profile.availableDays = [WEEKDAYS[(todayIndex + 2) % 7], WEEKDAYS[(todayIndex + 4) % 7]]; state.program = buildProgram(state.profile); state.profile.onboardingComplete = true;
  state.workouts = [];
  state.activeWorkout = null;
  state.selectedDay = today;
  state.selectedDate = isoDay();
  const { context, page } = await openApp(state, { width: 390, height: 430 });
  await page.getByRole('button', { name: 'Train today instead' }).click();
  await verifyScroller(page, page.locator('.modal-layer > .rest-training-sheet'), 'Rest-day menu');
  await page.screenshot({ path: output('390-rest-menu-short-height.png') });
  await context.close();
}

await browser.close();
console.log('Modal scroll QA passed: Logging, Import Plan, exercise history, and rest-day menus use native internal scrolling while the background stays locked.');
