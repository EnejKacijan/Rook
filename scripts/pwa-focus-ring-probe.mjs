import { chromium, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createReturningUserFixture } from '../src/demoFixture.js';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/pwa-focus-ring';
await mkdir(out, { recursive: true });
const results = [];
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch({ ...(engine === 'chromium' ? { channel: 'chrome' } : {}), headless: true });
  try { for (const standalone of [false, true]) {
    const state = createReturningUserFixture(1);
    Object.assign(state.profile, { stylePreference: 'standard', appearancePreference: 'dark', themePreference: 'dark' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(({ state, standalone }) => {
      localStorage.setItem('lift-v2-state', JSON.stringify(state));
      Object.defineProperty(navigator, 'standalone', { value: standalone });
      window.focusProbe = [];
      const describe = el => el && ({ tag: el.tagName, label: el.getAttribute?.('aria-label'), class: el.className,
        focus: el.matches?.(':focus'), visible: el.matches?.(':focus-visible'), outline: getComputedStyle(el).outline,
        offset: getComputedStyle(el).outlineOffset });
      const record = (event, extra = {}) => window.focusProbe.push({ event, time: performance.now(), visibility: document.visibilityState,
        active: describe(document.activeElement), scroll: [scrollX, scrollY], ...extra });
      const focus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function(options) {
        record('script-focus-before', { target: describe(this), options, owner: new Error().stack.split('\n').slice(2, 5) });
        const result = focus.call(this, options); record('script-focus-after'); return result;
      };
      for (const name of ['visibilitychange', 'focusin', 'focusout', 'pointerdown', 'touchstart', 'keydown'])
        document.addEventListener(name, e => record(name, { key: e.key, pointerType: e.pointerType, target: describe(e.target) }), true);
      for (const name of ['pageshow', 'pagehide', 'blur', 'focus']) window.addEventListener(name, e => record(name, { persisted: e.persisted }));
      window.captureFocus = label => { record(label); return window.focusProbe.at(-1); };
    }, { state, standalone });
    const page = await context.newPage();
    await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:4177');
    const samples = [];
    const sample = async label => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); samples.push(await page.evaluate(label => captureFocus(label), label)); };
    const resume = async label => {
      const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront(); await page.bringToFront(); await other.close();
      await sample(`${label}-real-tab-foreground`);
      // Additional explicit lifecycle notifications, not a claim of native iOS backgrounding.
      await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); document.dispatchEvent(new Event('visibilitychange')); });
      await sample(`${label}-lifecycle-notifications`);
    };
    await page.getByRole('button', { name: 'PROFILE', exact: true }).tap();
    await page.locator('[data-profile-area="program"]').tap(); await sample('touch-program-back');
    await resume('program');
    await page.getByRole('button', { name: /^Training block/ }).tap();
    await page.locator('.training-block-screen').waitFor(); await sample('touch-sheet-open');
    await resume('sheet');
    await page.screenshot({ path: `${out}/before-${engine}-${standalone ? 'standalone' : 'browser'}.png` });
    await page.getByRole('button', { name: 'Close Training block', exact: true }).tap();
    await page.locator('.modal-layer').waitFor({ state: 'detached' }); await sample('touch-sheet-close');
    await page.getByRole('button', { name: 'Back to Profile', exact: true }).tap();
    await page.keyboard.press('Tab'); await sample('keyboard-tab');
    // Keyboard-focus history followed by pointer navigation is a realistic mixed-modality path.
    await page.locator('[data-profile-area="program"]').tap(); await sample('touch-after-keyboard-program');
    await page.getByRole('button', { name: /^Training block/ }).tap(); await sample('touch-after-keyboard-sheet');
    const trace = await page.evaluate(() => window.focusProbe);
    results.push({ engine, standalone, samples, trace }); console.log(engine, standalone, JSON.stringify(samples));
    await context.close();
  }} finally { await browser.close(); }
}
await writeFile(`${out}/before-runtime.json`, JSON.stringify(results, null, 2));
