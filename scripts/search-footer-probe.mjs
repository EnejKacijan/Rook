import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const phase = process.env.QA_PHASE || 'before';
const out = `artifacts/ROOK-BASELINE-CORRECTION-REVIEW/search-footer/${phase}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true,
      hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce', recordVideo: { dir: out, size: { width, height: 844 } } });
    await context.addInitScript(() => {
      const viewport = new EventTarget(); Object.assign(viewport, { height: 844, offsetTop: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.qaViewport = (height, offsetTop = 0) => { Object.assign(viewport, { height, offsetTop }); viewport.dispatchEvent(new Event('resize')); };
    });
    const page = await context.newPage();
    await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:4177');
    await page.getByRole('button', { name: /Start from scratch/i }).click();
    await page.getByRole('button', { name: 'Mon', exact: true }).click();
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    const editor = page.locator('.scratch-editor-screen'); await editor.waitFor();
    const measure = () => editor.evaluate(root => {
      const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const footer = root.querySelector('.sheet-action-footer');
      return { at: performance.now(), root: rect(root), footer: rect(footer), button: rect(footer.querySelector('button')),
        scroll: root.scrollTop, content: root.scrollHeight, docScroll: scrollY,
        viewport: visualViewport.height, offsetTop: visualViewport.offsetTop,
        ready: footer.textContent, position: getComputedStyle(footer).position,
        inset: root.style.getPropertyValue('--sheet-action-height') };
    });
    const samples = [{ step: 'empty', ...await measure() }];
    for (const [index, query] of ['Bench Press', 'Row', 'Leg Press'].entries()) {
      await editor.getByRole('button', { name: index === 0 ? '+ Add first exercise' : '+ Add exercise', exact: true }).click();
      const input = editor.getByRole('searchbox'); await input.fill(query);
      await page.evaluate(() => window.qaViewport(420, 0));
      samples.push({ step: `search-${index}`, ...await measure() });
      await editor.evaluate(root => {
        window.qaFrames = []; window.qaSampling = true;
        const sample = () => {
          const footer = root.querySelector('.sheet-action-footer'), button = footer.querySelector('button');
          const r = footer.getBoundingClientRect(), b = button.getBoundingClientRect();
          window.qaFrames.push({ at: performance.now(), footerTop: r.top, footerBottom: r.bottom,
            height: r.height, buttonTop: b.top, buttonBottom: b.bottom, scroll: root.scrollTop, content: root.scrollHeight,
            viewport: visualViewport.height, focused: document.activeElement?.tagName });
          if (window.qaSampling) requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      });
      await editor.getByRole('option').first().click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      samples.push({ step: `added-keyboard-${index}`, ...await measure() });
      await page.screenshot({ path: `${out}/${width}-added-${index}-keyboard.png` });
      await page.evaluate(() => window.qaViewport(844, 0));
      await page.evaluate(() => new Promise(resolve => { let n = 0; const frame = () => ++n < 12 ? requestAnimationFrame(frame) : resolve(); requestAnimationFrame(frame); }));
      await page.evaluate(() => window.qaSampling = false);
      samples.push({ step: `added-${index}`, ...await measure(), frames: await page.evaluate(() => window.qaFrames) });
    }
    await page.screenshot({ path: `${out}/${width}-final.png` });
    results.push({ width, samples }); await context.close();
  }
} finally { await browser.close(); await writeFile(`${out}/footer-probe.json`, JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results.map(r => ({ width: r.width, samples: r.samples.map(({ frames, ...sample }) => sample) })), null, 2));
