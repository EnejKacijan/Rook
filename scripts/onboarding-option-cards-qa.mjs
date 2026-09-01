import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const outputRoot = new URL('../artifacts/onboarding-option-cards/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
await page.getByRole('combobox', { name: 'Age range' }).click();
await page.getByRole('option', { name: '18–29' }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();

const goalExplanations = [
  ['Build muscle', 'Built for muscle growth', 'Hypertrophy-focused volume, moderate rep ranges, and controlled effort.'],
  ['Get stronger', 'Built around strength', 'Heavier strength-focused work, key lifts first, and enough recovery for quality sets.'],
  ['Lose fat', 'Built to support fat loss', 'Strength work to help maintain muscle, plus recoverable conditioning that fits your week.'],
  ['General fitness', 'Balanced and sustainable', 'Balanced strength and fitness work across the major movement patterns.'],
  ['Athletic performance', 'Strength that transfers', 'Strength, power, and quality-first training with fatigue kept manageable.']
];
const goalPreview = page.getByLabel('How this affects your plan');
for (const [goal, title, detail] of goalExplanations) {
  await page.getByRole('button', { name: goal }).click();
  await goalPreview.getByText(title, { exact: true }).waitFor();
  assert.equal(await goalPreview.getByText(detail, { exact: true }).count(), 1, `${goal} has concise generator-aligned guidance`);
}
assert.equal(await goalPreview.locator('small').count(), 0, 'goal explanation has no metric pills');
for (const goal of ['Build muscle', 'Get stronger', 'Athletic performance']) {
  await page.getByRole('button', { name: goal }).click();
  await goalPreview.getByText(goalExplanations.find(([name]) => name === goal)[1], { exact: true }).waitFor();
  await page.waitForTimeout(40);
  assert.deepEqual(await page.evaluate(() => ({ window: scrollY, onboarding: document.querySelector('.onboarding')?.scrollTop || 0 })), { window: 0, onboarding: 0 }, `${goal} selection keeps the onboarding screen anchored`);
  await page.screenshot({ path: output(`390-goal-${goal.toLowerCase().replaceAll(' ', '-')}.png`), fullPage: false });
}

for (const width of [375, 390, 430, 500]) {
  await page.setViewportSize({ width, height: 844 });
  await page.getByRole('button', { name: 'Build muscle' }).click();
  const goalCard = page.getByRole('button', { name: 'Build muscle' });
  const goalHeight = (await goalCard.boundingBox()).height;
  assert.equal(await goalCard.getAttribute('aria-pressed'), 'true');
  assert.equal(await goalCard.locator('small').count(), 0, 'single-line Goal cards render no empty subtitle');
  await page.screenshot({ path: output(`${width}-goal.png`), fullPage: false });
  await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: /Intermediate/ }).click();
  const experienceCard = page.getByRole('button', { name: /Intermediate/ });
  const experienceHeight = (await experienceCard.boundingBox()).height;
  assert.ok(experienceHeight - goalHeight <= 8, `Experience card remains compact at ${width}px`);
  assert.equal(await experienceCard.getAttribute('aria-pressed'), 'true');
  const descriptionsFit = await page.locator('.option-card-copy small').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth));
  assert.ok(descriptionsFit, `Experience helper copy stays on one line at ${width}px`);
  await page.screenshot({ path: output(`${width}-experience.png`), fullPage: false });
  await page.getByRole('button', { name: 'Back' }).click();
}

assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log('Onboarding option-card QA passed at 375, 390, 430, and 500px: shared styling, compact descriptions, selected state, and no subtitle wrapping.');
