import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, weekday, WEEKDAYS, isoDay } from '../src/domain.js';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
for (const width of [320, 390]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
  const state = blankState();
  const day = weekday();
  state.profile = { ...state.profile, onboardingComplete: true, daysPerWeek: 2, availableDays: [day, WEEKDAYS[(WEEKDAYS.indexOf(day)+2)%7]], environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance };
  state.program = buildProgram(state.profile);
  state.selectedDay = day; state.selectedDate = isoDay();
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage();
  await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4173');
  const edit = page.getByRole('button', { name: 'Edit exercises', exact: true });
  await edit.waitFor(); await edit.scrollIntoViewIfNeeded();
  assert.equal((await edit.innerText()).trim(), 'Edit');
  assert.equal(await edit.locator('svg').count(), 1);
  const styleCheck = await edit.evaluate(button => {
    const css = getComputedStyle(button);
    return { background: css.backgroundColor, border: css.borderTopWidth };
  });
  assert.equal(styleCheck.background, 'rgba(0, 0, 0, 0)');
  assert.equal(styleCheck.border, '0px');
  const check = () => page.locator('.today-exercise-list-heading').evaluate(header => {
    const button = header.querySelector('button'), label = header.firstElementChild;
    const b = button.getBoundingClientRect(), l = label.getBoundingClientRect();
    return b.height >= 44 && b.width >= 44 && l.right <= b.left && b.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  });
  assert.ok(await check());
  await page.screenshot({ path: `${out}/today-edit-${width}-${style}-${appearance}.png` });
  await edit.click(); await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.today-exercise-list-heading').evaluate(header => { header.firstElementChild.textContent = 'DANAŠNJE VADBE IN VAJE'; header.querySelector('button').lastChild.textContent = 'Uredi vaje'; });
  assert.ok(await check(), 'Long-label layout must not overlap');
  await context.close(); console.log(`PASS ${width} ${style} ${appearance}`);
}
} finally { await browser.close(); }
