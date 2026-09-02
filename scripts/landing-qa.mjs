import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, STORAGE_KEY } from '../src/domain.js';

const target = new URL('../artifacts/landing-copy/', import.meta.url);
const appUrl = process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
await mkdir(target, { recursive: true });
const output = name => fileURLToPath(new URL(name, target));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const luminance = value => {
  const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
};

const themeVariants = [
  { theme: 'light', colorScheme: 'light' },
  { theme: 'dark', colorScheme: 'dark' },
  { theme: 'premium', colorScheme: 'dark' },
];

for (const { theme, colorScheme } of themeVariants) {
for (const width of [320, 360, 390, 430, 477, 768]) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme });
  if (theme === 'premium') {
    const premiumState = blankState();
    premiumState.profile.themePreference = 'premium';
    await context.addInitScript(({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    }, { key: STORAGE_KEY, state: premiumState });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  const tagline = page.getByText('Training, built around you', { exact: true });
  await tagline.waitFor();
  await page.getByRole('heading', { name: 'A plan that fits. And keeps up.' }).waitFor();
  await page.getByText(/Tell Rook when you can train, your equipment, and your experience/).waitFor();
  const primary = page.getByRole('button', { name: 'BUILD MY PLAN' });
  await primary.waitFor();
  await page.getByText('About 2 minutes · No account needed', { exact: true }).waitFor();
  const demo = page.getByRole('region', { name: 'SEE HOW ROOK ADAPTS' });
  await demo.waitFor();
  assert.equal(await page.getByText('Illustrative preview', { exact: true }).count(), 0, 'technical preview label is removed');
  assert.equal(await demo.locator('li').count(), 7, 'illustrative week keeps all seven days visible');
  assert.ok((await demo.boundingBox()).y > (await primary.boundingBox()).y, 'optional demo follows the immediately available primary CTA');
  assert.equal(await demo.locator('.training-day').count(), 4);
  await demo.getByRole('button', { name: '3', exact: true }).click();
  assert.equal(await demo.locator('.training-day').count(), 3, 'frequency materially recomposes the illustrative week');
  assert.equal(
    await demo.locator('.entry-week-transition').evaluate(node => getComputedStyle(node).animationDuration),
    '0.19s',
    'frequency change uses the restrained 190 ms week transition',
  );
  assert.match(await demo.getByRole('list').getAttribute('aria-label'), /^3-day illustrative/);
  await demo.getByRole('button', { name: '5', exact: true }).click();
  assert.equal(await demo.locator('.training-day').count(), 5, 'the five-day preview uses a genuinely different weekly structure');
  await demo.getByRole('button', { name: '3', exact: true }).click();
  const labelsBeforeEquipment = await demo.locator('li small').allTextContents();
  await demo.getByRole('button', { name: 'Dumbbells', exact: true }).click();
  assert.deepEqual(await demo.locator('li small').allTextContents(), labelsBeforeEquipment, 'equipment does not fabricate a split change');
  assert.equal(
    await demo.locator('.entry-week-result > p').innerText(),
    'Example only · Rook adapts exercise selection to your equipment.',
  );
  assert.equal(
    await demo.getByRole('button', { name: 'Dumbbells', exact: true }).getAttribute('aria-pressed'),
    'true',
    'equipment selection updates immediately',
  );
  const weekGeometry = await demo.evaluate(node => {
    const header = node.querySelector('.entry-week-header');
    const title = header.firstElementChild.getBoundingClientRect();
    const note = header.lastElementChild.getBoundingClientRect();
    const columns = [...node.querySelectorAll('li')].map(item => item.getBoundingClientRect());
    return {
      headerClear: title.right <= note.left || title.bottom <= note.top,
      widths: columns.map(column => Math.round(column.width * 10) / 10),
    };
  });
  assert.equal(weekGeometry.headerClear, true, `${width}px illustrative-week header does not collide`);
  assert.ok(Math.max(...weekGeometry.widths) - Math.min(...weekGeometry.widths) <= .2, `${width}px seven-day columns stay equal`);
  const secondary = page.getByRole('button', { name: /Already have a plan\?/ });
  assert.match(await secondary.textContent(), /^Already have a plan\?/);
  assert.match(await secondary.textContent(), /Bring your current routine into Rook/);
  const box = await secondary.boundingBox();
  assert.ok(box.x >= 20 && box.x + box.width <= width - 20, `${width}px secondary action stays within the mobile frame`);
  assert.ok(box.y + box.height <= await page.locator('.entry-v2').evaluate(node => node.scrollHeight), `${width}px existing-plan route remains reachable without clipping`);
  const scratch = page.getByRole('button', { name: /Start from scratch/ });
  assert.match(await scratch.textContent(), /Create your workouts manually/);
  const scratchBox = await scratch.boundingBox();
  assert.ok(scratchBox.x >= 20 && scratchBox.x + scratchBox.width <= width - 20, `${width}px scratch action stays within the mobile frame`);
  assert.ok(scratchBox.y + scratchBox.height <= await page.locator('.entry-v2').evaluate(node => node.scrollHeight), `${width}px scratch action remains reachable without clipping`);
  assert.ok(scratchBox.height >= 44, `${width}px scratch action keeps a comfortable touch target`);
  assert.notEqual(
    await secondary.evaluate(node => getComputedStyle(node, '::after').content),
    'none',
    `${width}px secondary routes retain a subtle directional affordance`,
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px has no horizontal overflow`);
  const colors = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector)).color;
    const background = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      background: background('.entry-v2'),
      body: color('.entry-content > p'),
      note: color('.entry-primary-note'),
      cta: background('.entry-primary-action .button'),
      ctaInk: color('.entry-primary-action .button'),
      accentText: color('.entry-demo-header > span'),
      restDayText: color('.entry-week-result .rest-day > strong'),
      selectedControl: background('.entry-days button[aria-pressed="true"]'),
      demoBorder: getComputedStyle(document.querySelector('.entry-demo')).borderTopColor,
    };
  });
  assert.ok(contrast(colors.body, colors.background) >= 4.5, `${theme} body text meets normal-text contrast`);
  assert.ok(contrast(colors.note, colors.background) >= 4.5, `${theme} supporting text meets normal-text contrast`);
  assert.ok(contrast(colors.ctaInk, colors.cta) >= 4.5, `${theme} CTA label meets contrast`);
  assert.ok(contrast(colors.accentText, colors.background) >= 4.5, `${theme} small accent text meets contrast`);
  const restDayContrast = contrast(colors.restDayText, colors.background);
  assert.ok(
    restDayContrast >= 4.5,
    `${theme} ${width}px rest-day labels remain readable at small size (${restDayContrast.toFixed(2)}:1; ${colors.restDayText} on ${colors.background})`,
  );
  assert.notEqual(colors.selectedControl, 'rgba(0, 0, 0, 0)', `${theme} selected demo input has restrained feedback`);
  if (theme === 'dark') assert.ok(contrast(colors.demoBorder, colors.background) >= 1.2, 'dark demo rules remain subtly visible');
  assert.deepEqual(errors, [], `${width}px console remains clean: ${errors.join('; ')}`);
  await page.screenshot({ path: output(`${theme}-${width}-landing.png`), fullPage: false });
  await context.close();
}
}

for (const { theme, colorScheme } of themeVariants) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, colorScheme });
  if (theme === 'premium') {
    const premiumState = blankState();
    premiumState.profile.themePreference = 'premium';
    await context.addInitScript(({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    }, { key: STORAGE_KEY, state: premiumState });
  }
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Start from scratch/ }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: /Start from scratch/ }).isVisible(), true, `${theme} short viewport keeps secondary routes reachable`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${theme} short viewport does not overflow horizontally`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
    document.querySelector('.entry-week-header small').textContent = 'Four available training days';
    const localizedWorkouts = ['Upper body strength', 'Lower hypertrophy', 'Recovery day', 'Upper chest', 'Recovery day', 'Posterior chain', 'Recovery day'];
    document.querySelectorAll('.entry-week-result li small').forEach((node, index) => { node.textContent = localizedWorkouts[index]; });
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${theme} enlarged and localized copy does not overflow horizontally`);
  const enlargedWeekGeometry = await page.locator('.entry-demo').evaluate(node => {
    const header = node.querySelector('.entry-week-header');
    const title = header.firstElementChild.getBoundingClientRect();
    const note = header.lastElementChild.getBoundingClientRect();
    const widths = [...node.querySelectorAll('li')].map(item => item.getBoundingClientRect().width);
    return {
      headerClear: title.right <= note.left || title.bottom <= note.top,
      equalColumns: Math.max(...widths) - Math.min(...widths) <= .2,
    };
  });
  assert.equal(enlargedWeekGeometry.headerClear, true, `${theme} enlarged illustrative-week header wraps without collision`);
  assert.equal(enlargedWeekGeometry.equalColumns, true, `${theme} localized illustrative week keeps equal columns`);
  await page.getByRole('button', { name: /Start from scratch/ }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: /Start from scratch/ }).isVisible(), true, `${theme} enlarged copy keeps routes reachable`);
  await context.close();
}

const reducedContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(appUrl, { waitUntil: 'networkidle' });
const reducedDemo = reducedPage.getByRole('region', { name: 'SEE HOW ROOK ADAPTS' });
await reducedDemo.getByRole('button', { name: '5', exact: true }).click();
assert.equal(
  await reducedDemo.locator('.entry-week-transition').evaluate(node => getComputedStyle(node).animationName),
  'none',
  'reduced motion removes the decorative week transition',
);
await reducedContext.close();

await browser.close();
console.log('Landing QA passed in Light, Dark, and Premium from 320 px through tablet width, including short viewports and reduced motion.');
