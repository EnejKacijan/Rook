import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';

const output = new URL('../artifacts/header-alignment/', import.meta.url);
const appUrl = process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const width of [320, 390, 430]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
  const state = blankState(), today = weekday();
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance, rirEnabled: true };
  state.program = buildProgram(state.profile);
  state.selectedDay = today; state.selectedDate = isoDay(); state.ai.planUpgradeDismissed = true;
  state.activeWorkout = startWorkout(state, state.program.days.find(d => d.weekday === today));
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'RESUME WORKOUT' }).click();
  await page.waitForTimeout(300);
  const measure = () => page.evaluate(() => {
    const row = document.querySelector('.set-labels.with-rir');
    const rect = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const textRect = el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); const r = range.getBoundingClientRect(); return [r.x, r.y + r.height / 2]; };
    return { labels: [row.children[1], row.children[2], row.querySelector('.help-popover-term')].map(textRect), row: rect(row), controls: [...document.querySelectorAll('.set-row')].map(rect), icon: rect(row.querySelector('.help-popover-mark')), trigger: rect(row.querySelector('.help-popover-trigger')) };
  });
  const current = await measure();
  const centeringError = await page.evaluate(() => {
    const label = document.querySelector('.set-label-help .help-popover-term').getBoundingClientRect();
    const field = document.querySelector('.set-row select').getBoundingClientRect();
    return Math.abs(label.x + label.width / 2 - field.x - field.width / 2);
  });
  assert.ok(centeringError <= 1, `RIR must center over its input (1px row-border tolerance): ${centeringError}px`);
  assert.ok(Math.max(...current.labels.map(r => r[1])) - Math.min(...current.labels.map(r => r[1])) <= .5, JSON.stringify(current.labels));
  assert.deepEqual(current.trigger, current.icon, 'native button bounds must equal the visible circle');
  assert.deepEqual(current.icon.slice(2), [18, 18]);
  const legacy = await page.addStyleTag({ content: `.set-label-help {height:44px} .set-labels.with-rir > span:not(.set-label-help), .set-labels.with-rir .set-label-help > .help-popover {height:44px;padding-block-start:36px}` });
  const before = await measure();
  assert.deepEqual(current.controls.map(r => [r[0], r[2], r[3]]), before.controls.map(r => [r[0], r[2], r[3]]), 'set row widths and heights unchanged');
  assert.ok(current.controls.every((r, i) => Math.abs(before.controls[i][1] - r[1] - 16) < .5), 'only the gap above the table shrinks by 16px');
  assert.deepEqual(current.labels.map(r => r[0]), before.labels.map(r => r[0]), 'column horizontal alignment unchanged');
  assert.ok(current.labels.every((r, i) => Math.abs(before.labels[i][1] - r[1] - 16) < .5), 'all labels move up together by 16px');
  await legacy.evaluate(el => el.remove());
  await page.screenshot({ path: fileURLToPath(new URL(`${width}-${style}-${appearance}.png`, output)) });
  await page.evaluate(y => {
    const guide = document.createElement('div');
    guide.style.cssText = `position:fixed;pointer-events:none;left:0;right:0;top:${y}px;height:1px;background:#f08080;z-index:100`;
    document.body.append(guide);
  }, current.labels[0][1]);
  await page.screenshot({ path: fileURLToPath(new URL(`${width}-${style}-${appearance}-guide.png`, output)) });
  const help = page.getByRole('button', { name: 'What is RIR?', exact: true });
  const [x,y,w,h] = current.icon;
  for (const [px,py] of [[x-2,y+h/2],[x+w+2,y+h/2],[x+w/2,y-2],[x+w/2,y+h+2]]) {
    await page.mouse.click(px,py);
    assert.equal(await page.getByRole('tooltip').count(),0,'outside the visible mark must not open help');
    await page.touchscreen.tap(px,py);
    assert.equal(await page.getByRole('tooltip').count(),0,'touch outside the circle must not open help');
  }
  await page.locator('.set-label-help .help-popover-term').click();
  assert.equal(await page.getByRole('tooltip').count(),0);
  await help.locator('.help-popover-mark').click();
  await page.getByRole('tooltip').waitFor();
  await page.keyboard.press('Escape');
  await page.touchscreen.tap(x+w/2,y+h/2);
  await page.getByRole('tooltip').waitFor();
  await page.keyboard.press('Escape');
  await help.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('tooltip').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await page.getByRole('tooltip').waitFor();
  await context.close();
}
await browser.close();
console.log('12 header cases passed: unchanged geometry, 18px mark-only pointer target, surrounding taps ignored, keyboard Enter/Space and Escape preserved.');
