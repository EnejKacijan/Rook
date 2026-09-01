import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const outputRoot = new URL('../artifacts/onboarding-effort/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

async function reachEffortStep(experience) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
  await page.getByRole('combobox', { name: 'Age range' }).click(); await page.getByRole('option', { name: '18–29' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Build muscle' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: new RegExp(`^${experience}`) }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: '3 days' }).click();
  await page.getByLabel('Make any day available').check();
  await page.getByRole('button', { name: '60 min' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Commercial gym' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: 'Balanced' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  assert.equal(await page.locator('.step-count').textContent(), 'STEP 7/8');
  return { context, page, errors };
}

for (const experience of ['Beginner', 'Intermediate', 'Advanced']) {
  const { context, page, errors } = await reachEffortStep(experience);
  await page.waitForFunction(() => window.scrollY === 0);
  const copy = await page.locator('.onboarding-content').innerText();
  if (experience === 'Beginner') {
    assert.doesNotMatch(copy, /\bRIR\b|reps in reserve/i);
    assert.match(copy, /How much work per exercise feels manageable/);
    assert.equal(await page.getByRole('button', { name: /Balanced starting point/ }).count(), 1);
  } else {
    assert.match(copy, /reps in reserve/i);
    assert.match(copy, /RIR/);
  }
  const footer = await page.locator('.onboarding-footer').boundingBox();
  assert.ok(footer && footer.y + footer.height <= 844, `${experience} footer stays visible`);
  await page.screenshot({ path: output(`${experience.toLowerCase()}-390.png`) });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log('Effort guidance QA passed: Beginner uses plain language without RIR; Intermediate and Advanced receive an RIR explanation; mobile footer remains visible.');
