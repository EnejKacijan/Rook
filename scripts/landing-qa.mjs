import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const target = new URL('../artifacts/landing-copy/', import.meta.url);
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

for (const theme of ['light', 'dark']) {
for (const width of [320, 360, 390, 430, 477, 768]) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  const tagline = page.getByText('Training, built around you', { exact: true });
  await tagline.waitFor();
  await page.getByRole('heading', { name: 'A plan that fits and keeps up.' }).waitFor();
  await page.getByText(/Tell Rook when you can train, your equipment, and your experience/).waitFor();
  const primary = page.getByRole('button', { name: 'BUILD MY PLAN' });
  await primary.waitFor();
  await page.getByText('About 2 minutes · No account needed', { exact: true }).waitFor();
  const exampleWeek = page.getByRole('region', { name: 'EXAMPLE WEEK' });
  await exampleWeek.waitFor();
  assert.equal(await exampleWeek.locator('li').count(), 4, 'example week stays compact and illustrative');
  assert.ok((await exampleWeek.boundingBox()).y > (await primary.boundingBox()).y, 'example week follows the primary CTA');
  const weekGeometry = await exampleWeek.evaluate(node => {
    const header = node.querySelector('.entry-week-header');
    const title = header.firstElementChild.getBoundingClientRect();
    const note = header.lastElementChild.getBoundingClientRect();
    const columns = [...node.querySelectorAll('li')].map(item => item.getBoundingClientRect());
    const accents = [...node.querySelectorAll('li > i')].map(item => getComputedStyle(item).height);
    return {
      headerClear: title.right <= note.left || title.bottom <= note.top,
      widths: columns.map(column => Math.round(column.width * 10) / 10),
      accents,
    };
  });
  assert.equal(weekGeometry.headerClear, true, `${width}px example-week header does not collide`);
  assert.ok(Math.max(...weekGeometry.widths) - Math.min(...weekGeometry.widths) <= .2, `${width}px example-week columns stay equal`);
  assert.equal(new Set(weekGeometry.accents).size, 1, `${width}px accent lines stay consistent`);
  const secondary = page.getByRole('button', { name: /Already have a plan/ });
  assert.match(await secondary.textContent(), /Bring your current routine into Rook/);
  assert.match(await secondary.textContent(), /›/);
  const box = await secondary.boundingBox();
  assert.ok(box.x >= 20 && box.x + box.width <= width - 20, `${width}px secondary action stays within the mobile frame`);
  assert.ok(box.y + box.height < 844, `${width}px actions remain visible without clipping`);
  const scratch = page.getByRole('button', { name: /Start from scratch/ });
  assert.match(await scratch.textContent(), /Create your workouts manually/);
  const scratchBox = await scratch.boundingBox();
  assert.ok(scratchBox.x >= 20 && scratchBox.x + scratchBox.width <= width - 20, `${width}px scratch action stays within the mobile frame`);
  assert.ok(scratchBox.y + scratchBox.height < 844, `${width}px scratch action remains visible without clipping`);
  assert.ok(scratchBox.height >= 44, `${width}px scratch action keeps a comfortable touch target`);
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
      accentText: color('.entry-week-header > span'),
    };
  });
  assert.ok(contrast(colors.body, colors.background) >= 4.5, `${theme} body text meets normal-text contrast`);
  assert.ok(contrast(colors.note, colors.background) >= 4.5, `${theme} supporting text meets normal-text contrast`);
  assert.ok(contrast(colors.ctaInk, colors.cta) >= 4.5, `${theme} CTA label meets contrast`);
  assert.ok(contrast(colors.accentText, colors.background) >= 4.5, `${theme} small accent text meets contrast`);
  assert.deepEqual(errors, [], `${width}px console remains clean: ${errors.join('; ')}`);
  await page.screenshot({ path: output(`${theme}-${width}-landing.png`), fullPage: false });
  await context.close();
}
}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, colorScheme: theme });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Start from scratch/ }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: /Start from scratch/ }).isVisible(), true, `${theme} short viewport keeps secondary routes reachable`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${theme} short viewport does not overflow horizontally`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
    document.querySelector('.entry-week-header small').textContent = 'Built around four available training days';
    document.querySelectorAll('.entry-week li small')[0].textContent = 'Upper body strength';
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${theme} enlarged and localized copy does not overflow horizontally`);
  await page.getByRole('button', { name: /Start from scratch/ }).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button', { name: /Start from scratch/ }).isVisible(), true, `${theme} enlarged copy keeps routes reachable`);
  await context.close();
}

await browser.close();
console.log('Landing QA passed in light and dark from 320 px through desktop width.');
