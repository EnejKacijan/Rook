// Visual review gallery for Personal Themes (and any registered seasonal theme).
// Captures representative screens in Light and Dark at phone widths, and fails
// on horizontal overflow or console errors. Run against `npm run preview`:
//   CHROME_PATH=/path/to/chrome THEMES=forest,ocean WIDTHS=390 node scripts/theme-gallery-qa.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, validateProgram, weekday } from '../src/domain.js';

const base = process.env.ROOK_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const themes = (process.env.THEMES || 'forest,champagne,ocean,slate,plum,terracotta').split(',').filter(Boolean);
const modes = (process.env.MODES || 'light,dark').split(',').filter(Boolean);
const widths = (process.env.WIDTHS || '390').split(',').map(Number);
const screens = (process.env.SCREENS || 'today,calendar,adjust,editor,search,workout,coach,progress,profile,studio').split(',');
const root = new URL(process.env.OUT ? `file://${process.env.OUT.replace(/\/?$/, '/')}` : '../artifacts/theme-gallery/', import.meta.url);
await mkdir(root, { recursive: true });
const out = name => fileURLToPath(new URL(name, root));

function fixture() {
  const state = blankState();
  const today = weekday();
  state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: [today, today === 'Sat' ? 'Tue' : 'Sat', today === 'Thu' ? 'Mon' : 'Thu'], sessionMinutes: 60,
    environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true,
    appearancePreference: 'light', stylePreference: 'standard', themePreference: 'light' };
  state.program = buildProgram(state.profile);
  assert.deepEqual(validateProgram(state.program, state.profile).errors, []);
  state.ai.planUpgradeDismissed = true;
  state.selectedDay = today;
  state.selectedDate = isoDay();
  return state;
}

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
for (const theme of themes) for (const mode of modes) for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: mode, serviceWorkers: 'block' });
  await context.addInitScript(([state, palette, appearance]) => {
    if (sessionStorage.getItem('rook-gallery-loaded')) return;
    localStorage.setItem('lift-v2-state', JSON.stringify(state));
    localStorage.setItem('rook.local-review.personal-theme.v1', JSON.stringify({ schemaVersion: 2, basePalette: palette, appearance, paletteCustomizations: {} }));
    sessionStorage.setItem('rook-gallery-loaded', '1');
  }, [fixture(), theme, mode]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' }));
  await page.goto(base, { waitUntil: 'networkidle' });
  const tag = `${theme}-${mode}-${width}`;
  const overflow = async label => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 1) failures.push(`${tag} ${label}: horizontal overflow ${wide}px`);
  };
  const shot = async label => { await page.waitForTimeout(250); await overflow(label); await page.screenshot({ path: out(`${tag}-${label}.png`) }); };
  try {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appearance), mode);
    if (screens.includes('today')) await shot('today');
    const closeLayer = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(350); };
    if (screens.includes('calendar')) {
      await page.getByRole('button', { name: /^Open calendar/ }).click();
      await page.locator('[aria-label="Workout calendar"]').first().waitFor();
      await shot('calendar'); await closeLayer();
    }
    if (screens.some(name => ['adjust', 'editor', 'search'].includes(name))) {
      await page.getByRole('button', { name: 'ADJUST TODAY', exact: true }).click();
      await page.getByRole('heading', { name: 'What changed today?' }).waitFor();
      if (screens.includes('adjust')) await shot('adjust');
      await page.getByRole('button', { name: /^Edit today's exercises/ }).click();
      await page.waitForTimeout(400);
      if (screens.includes('editor')) await shot('editor');
      const add = page.getByRole('button', { name: /^\+ Add (first )?exercise$/i }).first();
      if (screens.includes('search') && await add.isVisible()) {
        await add.click(); await page.waitForTimeout(400);
        const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
        if (await search.isVisible()) { await search.fill('press'); }
        await shot('search'); await closeLayer();
      }
      await closeLayer(); await closeLayer();
      if (await page.locator('.modal-layer').count()) { await closeLayer(); }
    }
    if (screens.includes('workout')) {
      const start = page.getByRole('button', { name: /^start workout$/i }).first();
      if (await start.isVisible()) { await start.click(); await page.waitForTimeout(400); await shot('workout');
        const back = page.getByRole('button', { name: /^Back/ }).first(); if (await back.isVisible()) await back.click(); }
    }
    if (screens.includes('coach')) { await page.getByRole('button', { name: 'COACH', exact: true }).click(); await shot('coach'); }
    if (screens.includes('progress')) { await page.getByRole('button', { name: 'PROGRESS', exact: true }).click(); await shot('progress'); }
    if (screens.includes('profile')) { await page.getByRole('button', { name: 'PROFILE', exact: true }).click(); await shot('profile'); }
    if (screens.includes('studio')) {
      await page.locator('[data-profile-area="display"]').click();
      await page.getByRole('button', { name: /^Appearance/ }).click();
      if (screens.includes('appearance')) await shot('appearance');
      await page.getByRole('button', { name: /^Choose a theme/ }).click();
      await page.locator('.pro-theme-studio').waitFor();
      await page.locator('.pro-theme-custom > summary').click();
      await shot('studio');
    }
  } catch (error) { failures.push(`${tag}: ${error.message.split('\n')[0]}`); }
  if (errors.length) failures.push(`${tag}: console ${errors.join(' | ')}`);
  await context.close();
}
await browser.close();
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`theme gallery: ${themes.length} themes × ${modes.length} modes × ${widths.length} widths clean`);
