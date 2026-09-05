import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';

const output = new URL('../artifacts/header-alignment/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const width of [320, 390, 430]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
  const state = blankState(), today = weekday();
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance, rirEnabled: true };
  state.program = buildProgram(state.profile);
  state.selectedDay = today; state.selectedDate = isoDay(); state.ai.planUpgradeDismissed = true;
  state.activeWorkout = startWorkout(state, state.program.days.find(d => d.weekday === today));
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
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
  assert.deepEqual(current.trigger.slice(2), [44, 44]);
  assert.deepEqual(current.icon.slice(2), [18, 18]);
  const legacy = await page.addStyleTag({ content: `.set-labels.with-rir > span:not(.set-label-help) { height:auto; padding-block-start:0; display:block; transform:translateY(18px); } .set-labels.with-rir .set-load-heading {display:flex!important} .set-labels.with-rir .set-label-help > .help-popover {height:auto;padding-block-start:0;line-height:1;} .set-labels.with-rir .help-popover-term {line-height:inherit;} .set-labels.with-rir .set-label-help :is(.help-popover-term,.help-popover-mark){transform:translateY(16px);}` });
  const before = await measure();
  assert.deepEqual(current.controls, before.controls, 'set rows unchanged');
  assert.deepEqual(current.row, before.row, 'header dimensions unchanged');
  assert.deepEqual(current.labels.slice(0, 2), before.labels.slice(0, 2), 'KG and REPS unchanged');
  await legacy.evaluate(el => el.remove());
  await page.screenshot({ path: fileURLToPath(new URL(`${width}-${style}-${appearance}.png`, output)) });
  await page.evaluate(y => {
    const guide = document.createElement('div');
    guide.style.cssText = `position:fixed;pointer-events:none;left:0;right:0;top:${y}px;height:1px;background:#f08080;z-index:100`;
    document.body.append(guide);
  }, current.labels[0][1]);
  await page.screenshot({ path: fileURLToPath(new URL(`${width}-${style}-${appearance}-guide.png`, output)) });
  await page.getByRole('button', { name: 'What is RIR?', exact: true }).click();
  await page.getByRole('tooltip').waitFor();
  await context.close();
}
await browser.close();
console.log('12 header alignment cases passed: text centers, unchanged horizontal layout/header/set rows, 44px help target, 18px icon and tooltip.');
