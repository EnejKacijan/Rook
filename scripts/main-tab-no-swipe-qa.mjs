// Regression: main-tab navigation is button-driven, not gesture-driven.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const output = 'artifacts/main-tab-no-swipe'; await mkdir(output, { recursive: true });
// Test app gestures independently of Chromium's native browser-history swipe.
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--overscroll-history-navigation=0'] });
try {
 for (const width of [320, 390]) {
  const state = createReturningUserFixture(2); state.activeWorkout = null;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } })); await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400); // Capture the hydrated, persisted baseline, not the legacy seed.
  const cdp = await context.newCDPSession(page);
  // Remove the harness's initial about:blank history entry, so native browser
  // back cannot be mistaken for application tab navigation.
  await cdp.send('Page.resetNavigationHistory');
  const swipe = async (direction, short = false) => {
    await page.locator('main.screen h1').first().scrollIntoViewIfNeeded();
    const r = await page.locator('main.screen h1').first().boundingBox(), y = r.y + 12;
    const start = direction < 0 ? width - 55 : 55, distance = short ? 28 : width - 110;
    const navBefore = await page.locator('.bottom-nav').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + direction * distance * i / 5, y }] });
    assert.deepEqual(await page.locator('.bottom-nav').boundingBox(), navBefore, 'footer stays fixed');
    assert.equal(await page.locator('main.screen').first().evaluate(el=>getComputedStyle(el).transform), 'none', 'content does not follow horizontal swipes');
    if (!short) await page.screenshot({ path: `${output}/${width}-drag.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(450);
    if (!await page.locator('.bottom-nav').count()) {
      await page.screenshot({path:`${output}/${width}-unexpected-state.png`});
      throw new Error(`Navigation missing after gesture: ${page.url()} ${(await page.locator('body').innerText()).slice(0,500)}`);
    }
  };
  const current = () => page.locator('.bottom-nav [aria-current="page"]').getAttribute('aria-label');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  await swipe(-1, true); assert.equal(await current(), 'TODAY');
  for (const tab of ['TODAY', 'COACH', 'PROGRESS', 'PROFILE']) {
    await page.getByRole('button', {name:tab, exact:true}).click(); assert.equal(await current(), tab);
    await swipe(-1); assert.equal(await current(), tab);
    await swipe(1); assert.equal(await current(), tab);
    await page.screenshot({ path: `${output}/${width}-${tab.toLowerCase()}.png` });
  }
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.deepEqual(after.program, before.program); assert.deepEqual(after.workouts, before.workouts);
  assert.deepEqual(errors, []); await context.close(); console.log(`PASS ${width}: horizontal swipes do not navigate, all four navigation buttons work, fixed footer and unchanged workout data`);
 }
} finally { await browser.close(); }
