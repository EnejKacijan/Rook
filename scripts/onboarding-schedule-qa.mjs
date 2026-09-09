import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, STORAGE_KEY } from '../src/domain.js';

const root = 'artifacts/onboarding-schedule';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const widths = [320, 390, 430];
const themes = ['light', 'dark', 'premium-light', 'premium-dark'];

async function reachSchedule(page) {
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
  await page.getByRole('combobox', { name: 'Age range' }).click();
  await page.getByRole('option', { name: '18–29' }).click();
  await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Build muscle' }).click();
  await page.getByRole('button', { name: /^Beginner/ }).click();
}

try {
  for (const width of widths) for (const theme of themes) {
    const state = blankState();
    Object.assign(state.profile, {
      appearancePreference: theme.endsWith('dark') ? 'dark' : 'light',
      stylePreference: theme.startsWith('premium') ? 'premium' : 'standard',
      themePreference: theme.startsWith('premium') ? 'premium' : theme,
    });
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: state });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await reachSchedule(page);

    const shot = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width} ${theme} has no horizontal overflow`);
      await page.screenshot({ path: `${root}/${width}-${theme}-${name}.png`, animations: 'disabled' });
    };
    const days = page.locator('.schedule-days .day-options .onboarding-option');
    const anyDay = page.getByLabel('Any day works');
    const continueButton = page.getByRole('button', { name: 'CONTINUE' });
    assert.equal(await days.count(), 7);
    assert.equal(await page.locator('.schedule-duration .onboarding-option').count(), 6);
    assert.equal(await continueButton.isDisabled(), true);
    await shot('01-nothing-selected');

    await page.getByRole('button', { name: '4 days', exact: true }).click();
    await days.nth(0).click(); await days.nth(2).click();
    assert.equal(await page.getByText('Choose at least 4 available days.', { exact: true }).count(), 1);
    assert.equal(await continueButton.isDisabled(), true);
    await shot('02-four-workouts-two-days');

    await days.nth(4).click(); await days.nth(6).click();
    assert.equal(await page.getByText('Choose at least 4 available days.', { exact: true }).count(), 0);
    assert.equal(await continueButton.isDisabled(), true, 'duration remains required');
    await shot('03-four-workouts-four-days');

    await page.getByRole('button', { name: '3 days', exact: true }).click();
    await days.nth(1).click();
    assert.equal(await page.getByText('5 days selected', { exact: true }).count(), 1);
    await shot('04-three-workouts-five-days');

    await anyDay.check();
    assert.equal(await anyDay.isChecked(), true);
    assert.equal(await days.evaluateAll(nodes => nodes.every(node => node.disabled && node.getAttribute('aria-pressed') === 'true')), true);
    const anyDayVisual = await page.locator('.select-all-check > i').evaluate(node => ({ width: node.getBoundingClientRect().width, background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }));
    assert.equal(anyDayVisual.width, 16);
    assert.notEqual(anyDayVisual.background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(anyDayVisual.color, 'rgba(0, 0, 0, 0)');
    await shot('05-any-day-works');

    await anyDay.uncheck();
    assert.equal(await page.getByText('5 days selected', { exact: true }).count(), 1, 'manual selection is restored');
    for (const index of [0, 1, 2, 4, 6]) await days.nth(index).click();
    await page.getByRole('button', { name: '60 min', exact: true }).click();
    assert.equal(await continueButton.isDisabled(), true);
    await shot('06-duration-selected');

    for (const index of [0, 1, 2, 4]) await days.nth(index).click();
    await page.getByRole('button', { name: '4 days', exact: true }).click();
    assert.equal(await continueButton.isEnabled(), true);
    assert.equal(await days.evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-pressed') === 'true').length), 4);
    await shot('07-fully-valid');

    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width} ${theme}: passed`);
  }
} finally {
  await browser.close();
}
