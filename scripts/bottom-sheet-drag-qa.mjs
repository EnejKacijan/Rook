import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const outputRoot = new URL('../artifacts/bottom-sheet-drag/', import.meta.url); await mkdir(outputRoot, { recursive: true }); const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const state = createReturningUserFixture(3); state.profile.ageRange = null;
await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
const page = await context.newPage(); const errors = [];
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:4173/?bottom-sheet-drag=1', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'PROFILE', exact: true }).click();

async function openScreen(buttonName) {
  await page.getByRole('button', { name: buttonName }).click(); const panel = page.locator('.modal-layer > .screen'); await panel.waitFor(); const handle = page.getByRole('button', { name: 'Drag down or tap to close' }); await handle.waitFor();
  assert.equal(await handle.count(), 1, `${buttonName} receives exactly one shared drag handle`); return { panel, handle };
}

{
  const { panel, handle } = await openScreen('Edit plan'); await page.waitForTimeout(220); const box = await handle.boundingBox(); const startX = box.x + 24; const startY = box.y + 8;
  assert.ok(box.width >= 350 && box.height >= 44, 'the whole top edge is a wide Spotify-style drag surface, not just the visible indicator');
  assert.equal(await handle.evaluate(element => getComputedStyle(element).cursor), 'default', 'desktop does not show a hand/grab cursor');
  await page.screenshot({ path: output('390-edit-plan-handle.png'), fullPage: false });
  await page.mouse.move(startX, startY); await page.mouse.down(); await page.mouse.move(startX, startY + 30, { steps: 3 }); await page.waitForTimeout(90); await page.mouse.move(startX, startY + 58, { steps: 3 }); await page.waitForTimeout(90);
  assert.notEqual(await panel.evaluate(element => getComputedStyle(element).transform), 'none', 'sheet follows the pointer during a partial drag');
  assert.notEqual(await page.locator('.modal-layer').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(27, 26, 25, 0.35)', 'backdrop fades with drag progress');
  await page.mouse.up(); await page.waitForTimeout(220); assert.equal(await page.locator('.modal-layer').count(), 1, 'short drag springs the sheet back'); assert.equal(await panel.evaluate(element => getComputedStyle(element).transform), 'none');
  const resetBox = await handle.boundingBox(); await page.mouse.move(resetBox.x + 24, resetBox.y + 8); await page.mouse.down(); await page.mouse.move(resetBox.x + 24, resetBox.y + 132, { steps: 7 }); await page.mouse.up(); await page.locator('.modal-layer').waitFor({ state: 'detached' });
}

{
  const { panel } = await openScreen('Edit plan'); await page.mouse.click(8, 8); await page.waitForTimeout(40); assert.notEqual(await panel.evaluate(element => getComputedStyle(element).transform), 'none', 'tapping the backdrop starts the same downward sheet animation before close'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
}

{
  const { panel, handle } = await openScreen('Logging & increments');
  assert.match(await panel.evaluate(element => getComputedStyle(element).animationName), /rook-sheet-enter/, 'bottom sheets use the shared upward entrance animation');
  assert.equal(await handle.evaluate(element => getComputedStyle(element).animationName), 'none', 'the grabber does not run a separate entrance animation');
  assert.equal(await handle.evaluate(element => element.parentElement?.classList.contains('detail-header')), true, 'the grabber is physically part of the sheet header');
  const [openingPanelTop, openingHandleTop] = await Promise.all([
    panel.boundingBox().then(box => box.y),
    handle.boundingBox().then(box => box.y),
  ]);
  await page.waitForTimeout(100);
  const [enteredPanelTop, enteredHandleTop] = await Promise.all([
    panel.boundingBox().then(box => box.y),
    handle.boundingBox().then(box => box.y),
  ]);
  assert.ok(Math.abs((enteredHandleTop - openingHandleTop) - (enteredPanelTop - openingPanelTop)) <= 1, 'the header grabber travels upward with the sheet as one surface');
  assert.match(await page.locator('.modal-layer').evaluate(element => getComputedStyle(element).animationName), /rook-sheet-backdrop-in/, 'the backdrop fades in with the sheet');
  await handle.click(); await page.waitForTimeout(40); assert.notEqual(await panel.evaluate(element => getComputedStyle(element).transform), 'none', 'tapping the top handle starts the standard downward close animation'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
}

{
  const { panel } = await openScreen('Logging & increments'); const close = page.getByRole('button', { name: 'Close Logging' }); assert.equal((await close.innerText()).trim(), '×', 'Logging uses a neutral close control instead of a back arrow'); await close.click(); await page.waitForTimeout(40); assert.notEqual(await panel.evaluate(element => getComputedStyle(element).transform), 'none', 'the close button uses the same downward sheet animation'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
}

for (const name of ['Logging & increments', 'Review priorities', 'Add a few details']) {
  const { handle } = await openScreen(name); if (name === 'Logging & increments') { await page.screenshot({ path: output('390-logging-handle.png'), fullPage: false }); await page.waitForTimeout(220); const box = await handle.boundingBox(); const x = box.x + 18; const y = box.y + 24; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 132, { steps: 7 }); await page.mouse.up(); await page.locator('.modal-layer').waitFor({ state: 'detached' }); } else { await handle.press('Enter'); await page.locator('.modal-layer').waitFor({ state: 'detached' }); }
}

await page.getByRole('button', { name: 'Replace plan' }).click(); let compactGrabZone = page.getByRole('button', { name: 'Drag down or tap to close' }); assert.equal(await compactGrabZone.count(), 1, 'compact Change Plan sheet retains its functional native handle'); assert.equal(await compactGrabZone.evaluate(element => element.parentElement?.classList.contains('sheet-header-chrome')), true, 'compact-sheet grabber is part of its fixed header chrome'); let compactBox = await compactGrabZone.boundingBox(); assert.ok(compactBox.width >= 350 && compactBox.height >= 44, 'compact-sheet grab zone also extends well beyond the visible line'); await compactGrabZone.click(); await page.locator('.modal-layer').waitFor({ state: 'detached' });

await page.getByRole('button', { name: 'Replace plan' }).click(); compactGrabZone = page.getByRole('button', { name: 'Drag down or tap to close' }); await compactGrabZone.waitFor(); await page.getByRole('button', { name: /Import from Notes|Import a different plan/ }).click();
const importHandle = page.getByRole('button', { name: 'Drag down or tap to close' }); await importHandle.waitFor(); assert.equal(await page.locator('.modal-layer > .import-plan-screen').count(), 1); await importHandle.press('Enter'); await page.locator('.modal-layer').waitFor({ state: 'detached' });

await openScreen('Appearance'); assert.equal(await page.locator('.theme-choice-layer').count(), 0, 'Appearance keeps Theme and Style inline without a nested sheet'); await page.getByRole('button', { name: 'Close Appearance' }).click(); await page.locator('.modal-layer').waitFor({ state: 'detached' });

assert.deepEqual(errors, []); await browser.close();
console.log('Bottom-sheet handle QA passed: full-width top-edge handles tap-close, drag, fade, spring back, and dismiss while Appearance remains a single flat sheet.');
