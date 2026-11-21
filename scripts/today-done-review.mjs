// Review capture for the Today "workout done" state. Synthetic data only.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, completeWorkout, weekday, isoDay, WEEKDAYS, startWorkout, startOptionalSession, finishOptionalSession } from '../src/domain.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';
import { normalizePersonalTheme } from '../src/personalThemes.js';

const base = process.env.QA_URL || 'http://127.0.0.1:4400';
const out = process.argv[2] || 'artifacts/today-done';
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
await mkdir(out, { recursive: true });
// Evening of a fixed Saturday so every fixture lands on the same calendar day.
const QA_NOW = Date.parse(process.env.QA_NOW || '2026-11-21T18:30:00+01:00');
const RealDate = Date, offset = QA_NOW - RealDate.now();
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); } static now() { return RealDate.now() + offset; } };

function fixture(kind) {
  let s = blankState(); const today = weekday(), index = WEEKDAYS.indexOf(today);
  Object.assign(s.profile, { onboardingComplete: true, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: [today, WEEKDAYS[(index + 2) % 7], WEEKDAYS[(index + 4) % 7]], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'] });
  s.program = buildProgram(s.profile); s.selectedDate = isoDay(); s.selectedDay = today; s.ai.planUpgradeDismissed = true;
  const t0 = Date.now() - 3 * 3600e3;
  if (kind !== 'none') {
    s.activeWorkout = startWorkout(s, s.program.days.find(d => d.weekday === today));
    s.activeWorkout.startedAt = t0;
    s.activeWorkout.warmupSkipped = true; s.activeWorkout.rampUpSkipped = true;
    s.activeWorkout.exercises.forEach((e, ei) => e.sets.forEach((set, si) => {
      if (kind === 'early' && ei >= 2) return;
      Object.assign(set, { reps: 8, weight: set.weight ?? 40, completed: true, completedAt: t0 + 60e3 * (ei * 8 + si * 2) });
    }));
    if (kind === 'early') s.activeWorkout.endedEarly = true;
    s = completeWorkout(s);
    s.workouts.at(-1).durationSeconds = 54 * 60;
    if (kind === 'long') s.workouts.at(-1).name = 'Upper body strength with chest and back emphasis';
  }
  const extraWorkout = name => {
    s = addFreestyleExercise(startFreestyleWorkout(s), 'push-up');
    s = addFreestyleExercise(s, 'plank');
    Object.assign(s.activeWorkout.exercises[0].sets[0], { reps: 12, completed: true });
    s = completeWorkout(s); s.workouts.at(-1).durationSeconds = 18 * 60;
    if (name) s.workouts.at(-1).name = name;
  };
  const conditioning = (config, seconds) => {
    s = startOptionalSession(s, config, Date.now() - seconds * 1000); s = finishOptionalSession(s);
  };
  if (/cond/.test(kind)) conditioning({ kind: 'Conditioning', intent: 'conditioning', activity: 'Rower', format: 'intervals', intervals: { rounds: 8, workSeconds: 30, restSeconds: 60 }, intensity: 'Hard' }, 12 * 60);
  if (/two|three/.test(kind)) extraWorkout();
  if (/three/.test(kind)) { extraWorkout('Evening arms'); conditioning({ kind: 'Conditioning', intent: 'conditioning', activity: 'Bike', format: 'steady', duration: 20, intensity: 'Moderate' }, 20 * 60); }
  s.selectedDate = isoDay();
  return s;
}

const themes = [
  ['forest', 'light'], ['forest', 'dark'], ['champagne', 'light'], ['champagne', 'dark'],
  ['ocean', 'light'], ['ocean', 'dark'], ['slate', 'light'], ['slate', 'dark'],
  ['plum', 'light'], ['plum', 'dark'], ['terracotta', 'light'], ['terracotta', 'dark'],
  ['halloween', 'light'], ['halloween', 'dark'],
];
const kinds = ['one', 'cond', 'two', 'three', 'early', 'long'];
const matrix = [];
for (const kind of kinds) for (const width of [320, 393, 430]) matrix.push({ kind, width, theme: themes[1 + (width === 393 ? 0 : -1)] });
for (const theme of themes) for (const kind of ['one', 'three']) matrix.push({ kind, width: 393, theme });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
for (const { kind, width, theme } of matrix) {
  const name = `${kind}-${width}-${theme.join('-')}`;
  if (only && !only.test(name)) continue;
  const seed = fixture(kind);
  const personal = { ...normalizePersonalTheme({ basePalette: theme[0], appearance: theme[1] }) };
  // Node has no import.meta.glob, so seasons are not registered here: build the v3 payload by hand.
  if (theme[0] === 'halloween') Object.assign(personal, { schemaVersion: 3, basePalette: 'halloween', accent: 'halloween', base: 'neutral', seasonalCustomizations: { halloween: { accent: 'halloween', base: 'neutral' } }, seasonalValidUntil: '2026-11-02' });
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block', reducedMotion: 'reduce', timezoneId: 'Europe/Ljubljana', locale: 'en-US' });
  await context.clock.install({ time: Date.now() });
  await context.addInitScript(([s, p]) => { if (!localStorage.getItem('lift-v2-state')) { localStorage.setItem('lift-v2-state', JSON.stringify(s)); localStorage.setItem('rook.local-review.personal-theme.v1', JSON.stringify(p)); } }, [seed, personal]);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { available: false } }));
  await page.goto(base); await page.locator('.today-screen').waitFor(); await page.waitForTimeout(400);
  const tall = await page.evaluate(() => Math.max(...[document.scrollingElement, ...document.querySelectorAll('.app-shell, .app-shell *')].map(e => e.scrollHeight)));
  await page.setViewportSize({ width, height: Math.max(844, Math.min(2400, tall + 40)) }); await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.today-screen *')].filter(e => !e.closest('.week-pager, .week-range-track, [class*=week-pager]')).filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.className).slice(0, 5));
  if (errors.length || overflow.length) console.log(name, { errors, overflow });
  await context.close();
}
await browser.close();
console.log('done');
