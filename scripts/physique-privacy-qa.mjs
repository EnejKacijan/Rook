import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram } from '../src/domain.js';
const output = 'artifacts/physique-privacy';
await mkdir(output, { recursive: true });
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [width, appearance] of [[390, 'light'], [320, 'dark']]) {
    const state = blankState();
    Object.assign(state.profile, { onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Mon', 'Thu'], sessionMinutes: 60, equipment: ['full gym'], appearancePreference: appearance, themePreference: appearance, stylePreference: 'standard' });
    state.program = buildProgram(state.profile);
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: appearance, serviceWorkers: 'block' });
    await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
    const page = await context.newPage(); let requests = 0, fail = false;
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/ai/status', r => r.fulfill({ json: { available: true, provider: 'openai' } }));
    await page.route('**/api/ai', r => {
      const body = r.request().postDataJSON();
      assert.equal(body.operation, 'physique-review'); requests++;
      assert.ok(body.payload.photos[0].dataUrl.startsWith('data:image/jpeg'));
      return r.fulfill(fail ? { status: 503, json: { error: 'Service unavailable' } } : { json: { data: { status: 'success', summary: 'Possible training priorities, not objective facts. Choose only what fits your goals.', suggestions: [
        { priorityId: 'upper_chest', priorityLevel: 'moderate', reason: 'An optional area to emphasize if it matches your goals.' },
        { priorityId: 'lateral_delts', priorityLevel: 'moderate', reason: 'Another possible focus; you decide whether to use it.' },
      ] } } });
    });
    const snap = async name => {
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${output}/${width}-${appearance}-${name}.png`, fullPage: false });
    };
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.locator('[data-profile-area="training"]').click();
    await page.getByRole('button',{name:/Training priorities/}).click();
    const enter = () => page.locator('.physique-review-entry').click();
    await enter();
    assert.match(await page.locator('.photo-privacy').innerText(), /OpenAI.*one-time/s);
    assert.match(await page.locator('.physique-caution').innerText(), /not objective facts/);
    await snap('intro');
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    const privacy = page.locator('#physique-photo-privacy');
    assert.match(await privacy.innerText(), /30 days.*Immediate deletion is not guaranteed/s);
    assert.ok(await privacy.evaluate(n => Boolean(n.compareDocumentPosition(document.querySelector('.photo-inputs')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    assert.equal(await page.locator('.photo-inputs input').first().getAttribute('aria-describedby'), 'physique-photo-privacy');
    assert.equal(requests, 0);
    await snap('upload-privacy');
    await page.getByRole('button', { name: 'SKIP', exact: true }).scrollIntoViewIfNeeded();
    const skipBox = await page.getByRole('button', { name: 'SKIP', exact: true }).boundingBox();
    assert.ok(skipBox.y >= 0 && skipBox.y + skipBox.height <= 900, 'Skip remains fully reachable after scrolling');
    await snap('upload-footer');
    await page.locator('.photo-inputs input').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: pixel });
    await page.getByText('synthetic.png · ready', { exact: true }).waitFor();
    assert.equal(requests, 0, 'picker alone never uploads');
    await page.getByRole('button', { name: 'REVIEW PHOTOS', exact: true }).click();
    await page.getByRole('heading', { name: 'Possible areas to emphasize', exact: true }).waitFor();
    assert.equal(requests, 1);
    await snap('successful-suggestions');
    const options = page.locator('.physique-suggestions button');
    await options.first().click();
    assert.equal(await options.first().getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('lift-v2-state').includes('data:image')), false);
    await page.getByRole('button', { name: 'KEEP MY ORIGINAL CHOICES', exact: true }).click();
    await enter(); await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    assert.equal(await page.locator('.photo-inputs label.ready').count(), 0, 'leaving releases screen photo state');
    fail = true;
    await page.locator('.photo-inputs input').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: pixel });
    await page.getByText('synthetic.png · ready', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'REVIEW PHOTOS', exact: true }).click();
    await page.getByRole('heading', { name: "We couldn't get a useful physique review from these photos." }).waitFor();
    await snap('unavailable');
    await page.getByRole('button', { name: 'TRY DIFFERENT PHOTOS', exact: true }).click();
    assert.equal(await page.locator('.photo-inputs label.ready').count(), 1, 'failure retains temporary photo for retry');
    await page.getByRole('button', { name: 'SKIP', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width} ${appearance}: disclosure before picker, explicit send, suggestions, deselection, temporary retention, skip and error`);
    await context.close();
  }
} finally { await browser.close(); }
