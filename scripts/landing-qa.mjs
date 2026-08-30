import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const target = new URL('../artifacts/landing-copy/', import.meta.url);
await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

for (const width of [375, 390, 430, 500]) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByText('TRAINING, BUILT AROUND YOU', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'A plan that fits—and keeps up.' }).waitFor();
  await page.getByText(/As you log workouts, Rook uses your real training history to guide what comes next/).waitFor();
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).waitFor();
  const secondary = page.getByRole('button', { name: /I ALREADY HAVE A PLAN/ });
  assert.match(await secondary.textContent(), /Bring your current routine into Rook/);
  assert.match(await secondary.textContent(), /›/);
  const box = await secondary.boundingBox();
  assert.ok(box.x >= 20 && box.x + box.width <= width - 20, `${width}px secondary action stays within the mobile frame`);
  assert.ok(box.y + box.height < 844, `${width}px actions remain visible without clipping`);
  const scratch = page.getByRole('button', { name: /START FROM SCRATCH/ });
  assert.match(await scratch.textContent(), /Create your workouts manually/);
  const scratchBox = await scratch.boundingBox();
  assert.ok(scratchBox.x >= 20 && scratchBox.x + scratchBox.width <= width - 20, `${width}px scratch action stays within the mobile frame`);
  assert.ok(scratchBox.y + scratchBox.height < 844, `${width}px scratch action remains visible without clipping`);
  assert.deepEqual(errors, [], `${width}px console remains clean: ${errors.join('; ')}`);
  await page.screenshot({ path: output(`${width}-landing.png`), fullPage: false });
  await context.close();
}

await browser.close();
console.log('Landing QA passed at 375, 390, 430, and 500 px.');
