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
await page.getByRole('combobox', { name: 'Age range' }).click();
await page.getByRole('option', { name: '18–29' }).click();
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
await page.getByLabel('Make any day available').check();
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
assert.equal(await page.locator('.step-count').textContent(), 'STEP 8/8');
assert.ok(await page.locator('.progress-line > span').evaluate(fill => fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width) > .98, 'final progress fill is complete within border/subpixel rounding');
assert.equal(await page.getByRole('button', { name: /CHOOSE FOR ME/ }).getAttribute('aria-pressed'), 'true');
assert.match(await page.getByRole('button', { name: /CHOOSE FOR ME/ }).textContent(), /Best fit for your goal, experience and 3-day schedule/);
assert.equal(await page.getByRole('button', { name: /I have a specific split/ }).count(), 1);
assert.equal(await page.getByText('EXERCISE PREFERENCE', { exact: true }).count(), 1);
assert.equal(await page.getByPlaceholder("Pain, recent surgery, or movements you've been told to avoid...").count(), 1);
assert.equal(await page.getByText('Write it naturally. Rook will adapt the plan where possible and ask if anything needs clarification.', { exact: true }).count(), 1);

for (const [width, height] of [[320, 568], [375, 640], [390, 700]]) {
  await page.setViewportSize({ width, height });
  const onboarding = page.locator('.onboarding-preferences');
  await onboarding.evaluate(element => element.scrollTo({ top: 0, left: 0 }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}x${height} has no horizontal overflow`);
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Back', exact: true }).scrollIntoViewIfNeeded();
  const footer = await page.locator('.onboarding-footer').boundingBox();
  const back = await page.getByRole('button', { name: 'Back', exact: true }).boundingBox();
  assert.ok(footer.y >= 0 && footer.y + footer.height <= height, `${width}x${height} footer is fully reachable`);
  assert.ok(back.y >= 0 && back.y + back.height <= height, `${width}x${height} Back is fully visible`);
  await page.screenshot({ path: output(`08-preferences-${width}x${height}.png`) });
}
await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor();
assert.equal(await page.getByRole('region', { name: 'How your answers shaped this plan' }).count(), 1);
await page.screenshot({ path: output('09-personalized-result.png') });
await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
await page.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete));
await page.screenshot({ path: output('10-post-onboarding.png') });

await browser.close();
console.log('Onboarding layout QA passed: every questionnaire screen fits, and the personalized result plus post-onboarding transition were captured.');
