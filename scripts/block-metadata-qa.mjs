import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday, WEEKDAYS } from '../src/domain.js';
const out = new URL('../artifacts/block-metadata/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
for (const width of [320, 390, 430]) for (const appearance of ['light', 'dark']) for (const style of ['standard', 'premium']) {
  const state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: [weekday()], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === 'premium' ? 'premium' : appearance });
  state.profile.availableDays = [weekday(), WEEKDAYS[(WEEKDAYS.indexOf(weekday()) + 1) % 7]];
  state.program = buildProgram(state.profile); state.selectedDay = weekday(); state.selectedDate = isoDay();
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
  await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
  const page = await context.newPage();
  await page.route('**/api/ai/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const row = page.locator('.today-block-week'); await row.waitFor();
  assert.match(await row.innerText(), /Week 1 of 6 · Base week/);
  const chevron = row.locator('.today-block-chevron');
  assert.equal(await chevron.getAttribute('aria-hidden'), 'true');
  assert.equal(await chevron.innerText(), '›');
  const preserved = await row.evaluate(e => {
    const icon = e.querySelector('.today-block-chevron');
    const measure = () => [e.getBoundingClientRect().height, e.nextElementSibling.getBoundingClientRect().top];
    const before = measure(); icon.style.display = 'none'; const after = measure(); icon.style.display = '';
    return JSON.stringify(before) === JSON.stringify(after);
  });
  assert.equal(preserved, true, 'chevron does not change row height or surrounding spacing');
  const metrics = await row.evaluate(e => {
    const c = getComputedStyle(e), hit = getComputedStyle(e, '::before');
    return { underline: c.textDecorationLine, hit: parseFloat(hit.height), weight: getComputedStyle(e.querySelector('strong')).fontWeight, phase: getComputedStyle(e.querySelector('span')).fontWeight, width: e.getBoundingClientRect().width, parent: e.parentElement.getBoundingClientRect().width };
  });
  assert.equal(metrics.underline, 'none'); assert.ok(metrics.hit >= 44); assert.equal(metrics.width, metrics.parent); assert.ok(+metrics.weight > +metrics.phase);
  await page.screenshot({ path: fileURLToPath(new URL(`${width}-${style}-${appearance}.png`, out)) });
  const longPhase = await row.evaluate(e => {
    const phase = e.querySelector('.today-block-phase'), end = e.querySelector('.today-block-phase-end');
    const originalPrefix = phase.firstChild.textContent, originalEnd = end.firstChild.textContent;
    const results = [];
    for (const lastWord of ['consolidation', 'VeryLongUnbrokenPhaseName'.repeat(5)]) {
      phase.firstChild.textContent = ' · Extended strength development and sustainable progression ';
      end.firstChild.textContent = lastWord;
      const box = e.getBoundingClientRect(), tail = end.getBoundingClientRect(), icon = end.querySelector('.today-block-chevron').getBoundingClientRect();
      results.push(tail.right <= box.right + 1 && icon.right <= tail.right + 1 && document.documentElement.scrollWidth <= innerWidth);
    }
    phase.firstChild.textContent = originalPrefix; end.firstChild.textContent = originalEnd;
    return results.every(Boolean);
  });
  assert.equal(longPhase, true, 'long phases and unbroken names wrap safely with the chevron attached to the final content');
  const box = await row.boundingBox();
  // Tap empty space at the row's far edge, outside its text and visual line box.
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2 + 20);
  await page.locator('.training-block-weeks').waitFor();
  assert.equal(await page.locator('.training-block-weeks').isVisible(), true);
  await context.close();
}
await browser.close();
console.log('Block metadata: 12 width/theme cases passed, including expanded empty-space tap navigation.');
