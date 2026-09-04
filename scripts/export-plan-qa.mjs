import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const appUrl = process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
const state = createReturningUserFixture(1);
state.program.days[0].exercises[0].notes = 'Seat position 3';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(appUrl, { waitUntil: 'networkidle' });

assert.equal(await page.getByRole('button', { name: 'SHARE WORKOUT' }).count(), 0, 'Today does not expose a single-workout export');
await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
const exportPlan = page.getByRole('button', { name: /Export workout plan/ });
assert.equal(await exportPlan.count(), 1, 'Profile owns the full-plan export entry point');
assert.match(await exportPlan.innerText(), /Share, copy or download the full plan/);
await exportPlan.click();
assert.equal(await page.locator('.detail-header').getByText('Export workout plan', { exact: true }).count(), 1, 'export screen is explicitly scoped to the full plan');
assert.equal(await page.getByText('Share workout', { exact: true }).count(), 0, 'export screen has no single-workout mode');
assert.equal(await page.getByText('EXPORT PLAN', { exact: true }).count(), 1);
assert.equal(await page.getByRole('heading', { name: state.program.name, exact: true }).count(), 1);
assert.equal(await page.getByText('Weekly plan', { exact: true }).count(), 1);
assert.equal(await page.getByText('A text version of your plan, generated privately on this device.', { exact: true }).count(), 1);
assert.equal(await page.getByText('Nothing is uploaded by ROOK.', { exact: true }).count(), 1);
assert.equal(await page.getByText('PREVIEW', { exact: true }).count(), 1);
const includeNotes = page.getByRole('switch', { name: /Include notes/ });
assert.equal(await includeNotes.count(), 1, 'Include notes uses the standard switch control');
assert.equal(await includeNotes.isChecked(), false, 'notes remain off by default');
await page.getByText('Include notes', { exact: true }).click();
assert.equal(await includeNotes.isChecked(), true, 'the full Include notes row is tappable');
const exportedText = await page.locator('.export-preview').innerText();
for (const day of state.program.days) assert.ok(exportedText.includes(day.name), `full-plan export includes ${day.name}`);
assert.equal(await page.getByRole('button', { name: 'COPY', exact: true }).count(), 1);
assert.equal(await page.getByRole('button', { name: 'DOWNLOAD .TXT', exact: true }).count(), 1);
const exportGeometry = await page.locator('.export-sheet').evaluate(element => {
  element.scrollTop = element.scrollHeight;
  const panel = element.getBoundingClientRect();
  const lastAction = element.querySelector('.export-actions button:last-child')?.getBoundingClientRect();
  const styles = getComputedStyle(element);
  return {
    bottomGap: lastAction ? panel.bottom - lastAction.bottom : Number.POSITIVE_INFINITY,
    height: panel.height,
    maxHeight: Number.parseFloat(styles.maxHeight),
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  };
});
assert.ok(exportGeometry.bottomGap <= 35, `export actions end close to the sheet edge (${exportGeometry.bottomGap}px gap)`);
assert.ok(exportGeometry.height <= exportGeometry.maxHeight + 1, 'export sheet respects the viewport height cap');
assert.ok(exportGeometry.scrollHeight >= exportGeometry.clientHeight, 'long exports remain safely scrollable inside the sheet');
const artifactRoot = new URL('../artifacts/export-plan/', import.meta.url);
await mkdir(artifactRoot, { recursive: true });
await page.locator('.export-sheet').evaluate(element => { element.scrollTop = 0; });
await page.screenshot({
  path: fileURLToPath(new URL('light-mobile.png', artifactRoot)),
  fullPage: false,
});
assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);

await context.close();
await browser.close();
console.log('Export plan QA passed: Today omits per-workout sharing and Profile exports the complete program.');
