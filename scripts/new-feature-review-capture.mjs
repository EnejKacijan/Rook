import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

// Opt-in screenshot routing for the five existing feature QA flows. No app
// styles/state are changed by this helper; ordinary QA output is unaffected.
export function configureNewFeatureReview(browser, folder) {
  const root = process.env.ROOK_NEW_FEATURE_REVIEW;
  if (!root) return;
  const originalContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await originalContext(...args);
    const originalPage = context.newPage.bind(context);
    context.newPage = async (...pageArgs) => {
      const page = await originalPage(...pageArgs);
      const originalScreenshot = page.screenshot.bind(page);
      page.screenshot = async (options = {}) => {
        const name = basename(String(options.path));
        if (process.env.ROOK_NEW_FEATURE_REVIEW_ONLY && !new RegExp(process.env.ROOK_NEW_FEATURE_REVIEW_ONLY).test(name)) return Buffer.alloc(0);
        const matrix = name.match(/^(320|390|430)-(standard|premium)-(light|dark)-/);
        // All four themes at 390; dense Standard Dark at 320 and a wider
        // Premium Light reference at 430. Explicit edge cases stay included.
        if (matrix && matrix[1] !== '390' &&
          !(matrix[1] === '320' && matrix[2] === 'standard' && matrix[3] === 'dark') &&
          !(matrix[1] === '430' && matrix[2] === 'premium' && matrix[3] === 'light')) return Buffer.alloc(0);
        // Backup/onboarding and old-block surfaces are not part of this review.
        if (/clean-restore|old-block|backup-restored/.test(name)) return Buffer.alloc(0);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const directory = join(root, folder);
        await mkdir(directory, { recursive: true });
        return originalScreenshot({ ...options, path: join(directory, name), animations: 'disabled' });
      };
      return page;
    };
    return context;
  };
}
