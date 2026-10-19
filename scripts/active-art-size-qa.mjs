import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { exerciseCatalog, startWorkout } from '../src/domain.js';

const baseline = process.argv.includes('--baseline');
const out = process.env.ROOK_ART_QA_OUTPUT || 'artifacts/active-art-size';
const url = process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
const themes = baseline ? [['standard', 'light']] : [
  ['standard', 'light'], ['standard', 'dark'], ['premium', 'light'], ['premium', 'dark'],
];
const variants = ['short', 'catalog-long', 'imported-long', 'superset', 'images-off'];
const longExercise = Object.values(exerciseCatalog).sort((a, b) => b.name.length - a.name.length)[0];
const results = [];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 430]) for (const [style, appearance] of themes) {
    for (const reduced of (!baseline && width === 390 && style === 'premium' && appearance === 'dark' ? [false, true] : [false])) {
      for (const variant of variants) {
        const key = `${width}-${style}-${appearance}-${variant}${reduced ? '-reduced' : ''}`;
        const state = createReturningUserFixture(0);
        Object.assign(state.profile, { showExerciseImages: variant !== 'images-off', restTimerEnabled: false,
          rirEnabled: true, stylePreference: style, appearancePreference: appearance,
          themePreference: style === 'premium' ? 'premium' : appearance });
        state.activeWorkout = startWorkout(state, state.program.days[0]);
        const active = state.activeWorkout;
        active.exerciseIndex = 0;
        active.exercises.forEach(e => { delete e.supersetId; e.sets.forEach(s => { s.completed = false; }); });
        active.exercises[0].exerciseId = variant === 'catalog-long' ? longExercise.id : 'leg-press';
        if (variant === 'imported-long') active.exercises[0].importedName = 'Leg Press with a controlled eccentric tempo';
        if (variant === 'superset') active.exercises.slice(0, 2).forEach(e => { e.supersetId = 'art-review-pair'; });
        const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true,
          isMobile: true, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await context.addInitScript(s => {
          if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s));
        }, state);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'RESUME WORKOUT', exact: true }).click();
        await page.locator('.exercise-heading h1').waitFor();
        if (variant !== 'images-off') await page.waitForFunction(() => {
          const img = document.querySelector('.exercise-heading-art');
          return img?.complete && img.naturalWidth > 0;
        });
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('.exercise-heading');
          const box = n => { if (!n) return null; const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          const art = header.querySelector('.exercise-heading-art-button'), img = art?.querySelector('img');
          return { title: header.querySelector('h1').textContent, header: box(header), art: box(art), image: box(img),
            titleBox: box(header.querySelector('h1')), eyebrow: box(header.querySelector('.eyebrow')),
            actions: box(header.querySelector('.workout-exercise-actions')),
            columns: getComputedStyle(header).gridTemplateColumns,
            objectFit: img && getComputedStyle(img).objectFit,
            overflow: document.documentElement.scrollWidth > innerWidth,
            transform: art && getComputedStyle(art).transform,
            appearance: document.documentElement.dataset.appearance, style: document.documentElement.dataset.style };
        });
        assert.equal(geometry.overflow, false, `${key}: no document overflow`);
        assert.equal(geometry.appearance, appearance);
        assert.equal(geometry.style, style);
        const overlap = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.x, b.x) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > .5;
        for (const [a, b] of [['art', 'titleBox'], ['art', 'actions'], ['art', 'eyebrow'], ['titleBox', 'actions'], ['eyebrow', 'actions']]) {
          assert.equal(Boolean(overlap(geometry[a], geometry[b])), false, `${key}: ${a}/${b} do not overlap`);
        }
        if (variant === 'images-off') {
          assert.equal(geometry.art, null);
          assert.equal(geometry.columns.split(' ').length, 1, 'no empty art column');
        } else {
          const size = width <= 374 ? variant === 'imported-long' ? 52 : 60 : baseline ? 72 : 84;
          assert.equal(geometry.art.width, size, key);
          assert.equal(geometry.art.height, size, key);
          assert.equal(Number.parseFloat(geometry.columns), size, 'grid track matches button');
          assert.equal(geometry.objectFit, 'contain');
          assert.equal(geometry.transform, 'none');
          assert.ok(geometry.image.x >= geometry.art.x && geometry.image.right <= geometry.art.right);
          assert.ok(geometry.image.y >= geometry.art.y && geometry.image.bottom <= geometry.art.bottom);
          const art = page.locator('.exercise-heading-art-button');
          const focusId = await art.getAttribute('id');
          await art.tap();
          await page.locator('.exercise-visual-viewer').waitFor();
          await page.getByRole('button', { name: 'Close visual viewer', exact: true }).click();
          await page.waitForFunction(id => document.activeElement?.id === id, focusId);
        }
        await page.screenshot({ path: `${out}/${key}.png`, animations: 'disabled' });
        assert.deepEqual(errors, []);
        // Review fixtures contain synthetic data only; useful for inspection in the in-app browser.
        await writeFile(`${out}/${key}.json`, JSON.stringify(state));
        results.push({ key, ...geometry, viewerFocus: variant !== 'images-off' });
        await context.close();
        console.log(`PASS ${key}: ${geometry.art ? geometry.art.width + 'px' : 'no artwork'}`);
      }
    }
  }
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`Active art QA passed: ${results.length} cases, layout/containment/theme and viewer return focus.`);
