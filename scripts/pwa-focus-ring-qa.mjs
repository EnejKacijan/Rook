import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startFreestyle } from './qa-current-navigation.mjs';
const out = 'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/pwa-focus-ring';
await mkdir(out, { recursive: true });
const results = [];
const smoke = process.argv.includes('--smoke');
const settle = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
async function info(locator) {
  return locator.evaluate(e => ({ active: document.activeElement === e, focus: e.matches(':focus'), focusVisible: e.matches(':focus-visible'),
    origin: e.getAttribute('data-rook-pointer-focus'), outlineStyle: getComputedStyle(e).outlineStyle,
    outlineWidth: getComputedStyle(e).outlineWidth, outlineColor: getComputedStyle(e).outlineColor,
    scroll: [scrollX, scrollY], label: e.getAttribute('aria-label') }));
}
async function assertPointer(locator) {
  const value = await info(locator); assert.ok(value.active && value.focus, JSON.stringify(value));
  assert.equal(value.origin, 'true', JSON.stringify(value)); assert.equal(value.outlineStyle, 'none', JSON.stringify(value)); return value;
}
async function assertKeyboard(locator) {
  const value = await info(locator); assert.ok(value.active && value.focusVisible, JSON.stringify(value));
  assert.equal(value.origin, null); assert.ok(value.outlineStyle !== 'none' && parseFloat(value.outlineWidth) >= 2, JSON.stringify(value)); return value;
}
async function tabTo(page, locator) {
  for (let i = 0; i < 50; i++) {
    if (await locator.evaluate(e => document.activeElement === e)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${await locator.getAttribute('aria-label')}`);
}
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.FOCUS_QA_ENGINE && process.env.FOCUS_QA_ENGINE !== engine) continue;
  const browser = await type.launch({ ...(engine === 'chromium' ? { channel: 'chrome' } : {}), headless: true });
  try { for (const width of smoke ? [320] : [320, 390]) for (const style of smoke ? ['standard'] : ['standard', 'premium']) for (const appearance of smoke ? ['light'] : ['light', 'dark']) for (const standalone of smoke ? [false] : [false, true]) {
    const key = `${engine}-${width}-${style}-${appearance}-${standalone ? 'standalone' : 'browser'}`;
    const state = createReturningUserFixture(1);
    Object.assign(state.profile, { stylePreference: style, appearancePreference: appearance, themePreference: style === 'premium' ? 'premium' : appearance });
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
      reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await context.addInitScript(({ state, standalone }) => {
      if (!localStorage.getItem('focus-qa-seeded')) { localStorage.setItem('lift-v2-state', JSON.stringify(state)); localStorage.setItem('focus-qa-seeded', 'yes'); }
      Object.defineProperty(navigator, 'standalone', { value: standalone });
      window.focusQaEvents = [];
      for (const event of ['pageshow', 'pagehide', 'focus', 'blur']) addEventListener(event, () => focusQaEvents.push({ event, visibility: document.visibilityState }));
      document.addEventListener('visibilitychange', () => focusQaEvents.push({ event: 'visibilitychange', visibility: document.visibilityState }));
    }, { state, standalone });
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
    let fault = null;
    try {
      await page.goto(process.env.QA_URL || 'http://127.0.0.1:4177'); await page.locator('.today-screen').waitFor();
      const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
      await page.getByRole('button', { name: 'PROFILE', exact: true }).tap();
      const program = page.locator('[data-profile-area="program"]'); await program.tap();
      const back = page.getByRole('button', { name: 'Back to Profile', exact: true }); await settle(page);
      const touchBack = await assertPointer(back);
      const resume = async (target, keyboard = false) => {
        const before = await info(target);
        const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront(); await page.bringToFront(); await other.close();
        await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
        await (keyboard ? assertKeyboard(target) : assertPointer(target)); assert.deepEqual((await info(target)).scroll, before.scroll);
      };
      await resume(back);
      if (engine === 'chromium') {
        // Explicit fault injection, NOT a claim of physical-iOS reproduction:
        // force the UA's stale focus-visible flag on the same touch-focused Back.
        const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument');
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.profile-subpage-header .detail-header-back' });
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
        const guarded = await assertPointer(back);
        await back.evaluate(e => e.removeAttribute('data-rook-pointer-focus'));
        const withoutGuard = await info(back); assert.equal(withoutGuard.outlineStyle, 'solid');
        if (width === 390 && standalone && appearance === 'dark') await page.screenshot({ path: `${out}/${key}-controlled-stale-before.png` });
        await back.evaluate(e => e.setAttribute('data-rook-pointer-focus', 'true'));
        if (width === 390 && standalone && appearance === 'dark') await page.screenshot({ path: `${out}/${key}-controlled-stale-after.png` });
        await page.emulateMedia({ forcedColors: 'active' });
        assert.equal((await info(back)).outlineStyle, 'solid', 'Forced-color accessibility is not suppressed');
        await page.emulateMedia({ forcedColors: 'none' }); await assertPointer(back);
        fault = { controlledUaFlag: true, withoutGuard, guarded, forcedColorsPreserved: true };
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        await cdp.detach();
      }
      const block = page.getByRole('button', { name: /^Training block/ });
      let touchClose;
      for (let cycle = 0; cycle < 3; cycle++) {
        await block.tap(); const close = page.getByRole('button', { name: 'Close Training block', exact: true });
        await close.waitFor(); await settle(page); touchClose = await assertPointer(close); await resume(close);
        if (cycle === 0 && standalone && appearance === 'dark') await page.screenshot({ path: `${out}/${key}-touch-sheet.png` });
        await close.tap(); await page.locator('.modal-layer').waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        assert.equal(await page.locator('.app-content').evaluate(e => e.inert), false);
      }
      await back.tap(); await program.waitFor(); await assertPointer(program);
      // Switch modality with a real keyboard event, then activate the focused hub entry.
      await page.keyboard.press('Tab'); await tabTo(page, program); await assertKeyboard(program);
      await page.keyboard.press('Enter'); await back.waitFor(); await settle(page); const keyboardBack = await assertKeyboard(back);
      await page.keyboard.press('Tab'); await tabTo(page, block); await assertKeyboard(block);
      await page.keyboard.press('Enter'); const close = page.getByRole('button', { name: 'Close Training block', exact: true });
      await close.waitFor(); await settle(page); const keyboardClose = await assertKeyboard(close);
      await resume(close, true);
      if (standalone && appearance === 'dark') await page.screenshot({ path: `${out}/${key}-keyboard-sheet.png` });
      const panel = page.locator('.training-block-screen');
      const controls = panel.locator('button:visible:not(:disabled), [role="button"][tabindex="0"]:visible');
      for (let i = 0; i < await controls.count() + 2; i++) {
        await page.keyboard.press('Tab'); assert.ok(await panel.evaluate(p => p.contains(document.activeElement)), 'Tab remains trapped in the sheet');
      }
      await page.keyboard.press('Escape'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
      // ModalLayer deliberately restores its trigger on the next animation frame.
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await assertKeyboard(block);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await back.tap(); await program.waitFor(); await assertPointer(program);
      // Ordinary native focus and the real shared search clear are not opted into suppression.
      let search = false;
      if (width === 390 && style === 'standard' && appearance === 'dark' && standalone) {
        await page.getByRole('button', { name: 'TODAY', exact: true }).tap();
        const options = page.getByRole('button', { name: 'Today options', exact: true }); await options.tap();
        const menu = page.locator('.today-actions-sheet'); await menu.waitFor(); await settle(page);
        await assertPointer(menu.getByRole('button', { name: 'Close More options', exact: true }));
        await page.keyboard.press('Tab');
        const adjust = menu.getByRole('button', { name: 'Adjust week', exact: true }); await tabTo(page, adjust); await assertKeyboard(adjust);
        await page.keyboard.press('Escape'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
        await startFreestyle(page);
        const add = page.getByRole('button', { name: '+ ADD EXERCISE', exact: true }); await add.tap();
        const input = page.getByRole('searchbox', { name: 'Search exercises', exact: true }); await input.tap(); await input.fill('Push');
        const clear = page.getByRole('button', { name: 'Clear search', exact: true }); await clear.tap();
        assert.equal(await input.inputValue(), ''); assert.equal((await info(input)).active, true); assert.equal((await info(input)).origin, null);
        await input.fill('Push'); await page.keyboard.press('Tab'); await tabTo(page, clear); await assertKeyboard(clear);
        await page.keyboard.press('Enter'); assert.equal(await input.inputValue(), ''); assert.equal((await info(input)).origin, null);
        await page.keyboard.press('Escape'); await page.locator('.modal-layer').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Cancel workout', exact: true }).tap(); search = true;
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const final = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
      assert.deepEqual(final.program, initial.program); assert.deepEqual(final.workouts, initial.workouts); assert.deepEqual(errors, []);
      results.push({ key, passed: true, touchBack, touchClose, keyboardBack, keyboardClose, fault, cycles: 3, search,
        lifecycle: await page.evaluate(() => focusQaEvents), physicalDevice: false }); console.log('PASS', key);
    } catch (error) { await page.screenshot({ path: `${out}/${key}-failure.png` }); throw error; }
    finally { await context.close(); await writeFile(`${out}/results${smoke ? '-smoke' : ''}${process.env.FOCUS_QA_ENGINE ? `-${engine}` : ''}.json`, JSON.stringify(results, null, 2)); }
  }} finally { await browser.close(); }
}
