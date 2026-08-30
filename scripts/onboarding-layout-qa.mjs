import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const outputRoot = new URL('../artifacts/onboarding-layout/', import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 700 }, serviceWorkers: 'block' });
const page = await context.newPage();
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();

async function verify(name) {
  await page.waitForTimeout(50);
  await page.waitForFunction(() => window.scrollY === 0 && document.querySelector('.onboarding')?.scrollTop === 0);
  const layout = await page.evaluate(() => {
    const onboarding = document.querySelector('.onboarding');
    const footer = document.querySelector('.onboarding-footer')?.getBoundingClientRect();
    const brand = document.querySelector('.brand')?.getBoundingClientRect();
    return { innerHeight, clientHeight: onboarding?.clientHeight || 0, scrollHeight: onboarding?.scrollHeight || 0, scrollTop: onboarding?.scrollTop || 0, scrollLeft: onboarding?.scrollLeft || 0, brandTop: brand?.top || 0, footerBottom: footer?.bottom || 0 };
  });
  await page.screenshot({ path: output(`${name}.png`) });
  assert.ok(layout.scrollHeight <= layout.clientHeight + 1, `${name} fits without questionnaire scrolling (${layout.scrollHeight}/${layout.clientHeight})`);
  assert.equal(layout.scrollTop, 0, `${name} starts at the top`);
  assert.equal(layout.scrollLeft, 0, `${name} stays horizontally aligned`);
  assert.ok(layout.brandTop >= 20, `${name} keeps the ROOK brand visible`);
  assert.ok(layout.footerBottom <= layout.innerHeight, `${name} footer remains visible (${layout.footerBottom}/${layout.innerHeight})`);
}

await verify('01-personal');
await page.getByLabel('Age range').selectOption({ index: 2 });
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('02-goal');
await page.getByRole('button', { name: 'Build muscle' }).click();
await verify('02-goal-selected');
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('03-experience');
await page.getByRole('button', { name: /^Beginner/ }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('04-schedule');
await page.getByRole('button', { name: '3 days' }).click();
await page.getByLabel('Select all days').check();
await page.getByRole('button', { name: '60 min' }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('05-setup');
await page.getByRole('button', { name: 'Home gym' }).click();
await verify('05-setup-home');
await page.getByRole('button', { name: 'Dumbbells' }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('06-priorities');
await page.getByRole('button', { name: 'Balanced' }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('07-effort');
await page.getByRole('button', { name: /Balanced starting point/ }).click();
await page.getByRole('button', { name: 'CONTINUE' }).click();
await verify('08-preferences');
await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor();
assert.equal(await page.getByRole('region', { name: 'How your answers shaped this plan' }).count(), 1);
await page.screenshot({ path: output('09-personalized-result.png') });
await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
await page.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete));
await page.screenshot({ path: output('10-post-onboarding.png') });

await browser.close();
console.log('Onboarding layout QA passed: every questionnaire screen fits, and the personalized result plus post-onboarding transition were captured.');
