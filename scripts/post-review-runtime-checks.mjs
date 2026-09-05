import assert from 'node:assert/strict';

export async function verifySearchClear(page) {
  for (const field of await page.locator('.rook-search-field input:visible').all()) {
    const original = await field.inputValue();
    await field.fill('Cable');
    const clear = field.locator('..').getByRole('button', { name: 'Clear search', exact: true });
    await clear.click();
    assert.equal(await field.inputValue(), '');
    assert.equal(await field.evaluate(el => el === document.activeElement), true);
    await field.fill(original);
  }
}

// Desktop simulation only: replace CSS env() with a 34px inset in the test page.
// This checks layout rules, not a physical iOS keyboard or Safari behavior.
export async function verifyLongContent(page, label) {
  const state = await page.evaluate(() => {
    const scrolls = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight).map(el => [el, el.scrollTop]);
    window.__reviewScrolls = scrolls;
    return [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).filter(css => css.includes('env(safe-area-inset-bottom')).join('\n').replace(/env\(safe-area-inset-bottom(?:\s*,[^)]*)?\)/g, '34px');
  });
  const override = await page.addStyleTag({ content: state });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: simulated safe-area horizontal fit`);
    const candidates = page.locator('.detail-screen button:visible, .sheet-scroll button:visible, .workout-screen button:visible');
    const count = await candidates.count();
    if (count) {
      const last = candidates.last();
      await last.scrollIntoViewIfNeeded();
      const box = await last.boundingBox();
      assert.ok(box && box.y >= -1 && box.y + box.height <= page.viewportSize().height + 1, `${label}: last action remains reachable`);
    }
    for (const button of await page.locator('.sheet-close:visible, .sheet-back:visible, .rook-search-clear:visible').all()) {
      assert.ok(await button.evaluate(el => Boolean(el.getAttribute('aria-label') || el.textContent.trim())), `${label}: named utility control`);
    }
  } finally {
    await override.evaluate(el => el.remove());
    await page.evaluate(() => { for (const [el, top] of window.__reviewScrolls || []) el.scrollTop = top; delete window.__reviewScrolls; });
  }
}
