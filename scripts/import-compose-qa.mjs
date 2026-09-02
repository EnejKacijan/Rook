import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const target = new URL('../artifacts/import-plan-polish/', import.meta.url);
await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: async () => 'Bench Press 3×8–10' }
  });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Already have a plan/i }).click();

const screen = page.locator('.import-plan-screen');
const textarea = page.getByPlaceholder('Paste your workout notes here...');
const paste = page.getByRole('button', { name: 'Paste workout notes from clipboard' });
const create = page.getByRole('button', { name: 'CREATE PREVIEW' });
const screenText = await screen.innerText();
assert.match(screenText, /EXAMPLES[\s\S]*Monday: Push[\s\S]*Bench Press 3×8–10[\s\S]*Squat 4×5 @ 2 RIR/);
assert.match(screenText, /Plain-text workout notes work best\. You’ll review anything Rook can’t match\./);
assert.doesNotMatch(screenText, /FAST FORMAT EXAMPLES|No special format is required|Monday - Push|MONDAY — PUSH/);
assert.equal(await create.isDisabled(), true, 'Create Preview starts disabled');

const [textareaBox, pasteBox] = await Promise.all([textarea.boundingBox(), paste.boundingBox()]);
assert.ok(textareaBox && pasteBox, 'textarea and Paste action are visible');
assert.ok(pasteBox.x >= textareaBox.x && pasteBox.y >= textareaBox.y, 'Paste begins inside the textarea');
assert.ok(pasteBox.x + pasteBox.width <= textareaBox.x + textareaBox.width, 'Paste stays inside the textarea width');
assert.ok(pasteBox.y + pasteBox.height <= textareaBox.y + textareaBox.height, 'Paste stays inside the textarea height');

for (const width of [375, 390, 430, 500]) {
  await page.setViewportSize({ width, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px has no horizontal overflow`);
  await page.screenshot({ path: output(`${width}-empty.png`), fullPage: false });
}

await page.setViewportSize({ width: 390, height: 844 });
await paste.click();
assert.equal(await textarea.inputValue(), 'Bench Press 3×8–10');
assert.equal(await create.isEnabled(), true, 'meaningful clipboard text enables Create Preview');
await page.screenshot({ path: output('390-pasted.png'), fullPage: false });
await textarea.fill('   ');
assert.equal(await create.isDisabled(), true, 'whitespace-only notes keep Create Preview disabled');
assert.deepEqual(errors, [], `compose screen remains clean: ${errors.join('; ')}`);

await browser.close();
console.log('Import compose QA passed: examples, helper copy, in-field Paste, responsive layout, and CTA states are correct.');
