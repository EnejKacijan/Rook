// Phone check for multiple exercise notes: Bench Press in Upper B gets a
// session-only note while keeping its pinned reminder; the next Upper B shows
// the reminder only, Upper A shows neither, and history keeps today's note.
// Usage: node scripts/exercise-notes-multiple-qa.mjs [baseUrl] [outDir]
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout, completeWorkout, isoDay, exercisePersonalNotes} from '../src/domain.js';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const out = process.argv[3] || 'artifacts/exercise-notes-multiple';
mkdirSync(out, {recursive: true});
const REMINDER = 'Arch, feet planted, bar to mid-chest';
const TODAY = 'Left shoulder tight today, stopped at 80 kg';

function seed() {
  const s = createReturningUserFixture(2);
  s.selectedDate = isoDay();
  const upperA = s.program.days.find(d => d.name === 'Upper A'), upperB = s.program.days.find(d => d.name === 'Upper B');
  upperA.exercises[0].exerciseId = 'barbell-bench-press';
  upperB.exercises[0].exerciseId = 'barbell-bench-press';
  upperB.exercises[0].personalNote = REMINDER;
  s.activeWorkout = startWorkout(s, upperB);
  return s;
}

async function open(browser, state, {width, dark}) {
  const c = await browser.newContext({viewport: {width, height: 844}, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: dark ? 'dark' : 'light'});
  await c.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('lift-v2-state', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, state);
  const p = await c.newPage();
  await p.route('**/api/**', r => r.fulfill({json: {available: false}}));
  await p.goto(base);
  return {c, p};
}
const readState = p => p.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));

const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
try {
  for (const {width, dark} of [{width: 393, dark: false}, {width: 320, dark: true}]) {
    const tag = `${width}${dark ? '-dark' : ''}`;
    const {c, p} = await open(browser, seed(), {width, dark});
    await p.getByRole('button', {name: 'RESUME WORKOUT', exact: true}).first().click();
    const heading = p.locator('.exercise-heading');
    await heading.waitFor();
    assert.match(await heading.locator('h1').innerText(), /Bench Press/);
    assert.match(await heading.locator('.exercise-personal-note-action').innerText(), new RegExp(REMINDER));
    await p.screenshot({path: `${out}/01-upper-b-pinned-${tag}.png`});

    await heading.getByRole('button', {name: 'Exercise options', exact: true}).click();
    await p.locator('.active-exercise-options-sheet').getByRole('button', {name: 'Exercise notes', exact: true}).click();
    const sheet = p.locator('.exercise-note-sheet');
    await sheet.waitFor();
    await sheet.getByRole('textbox').fill(TODAY);
    const future = sheet.getByRole('checkbox', {name: /Save for future workouts/});
    assert.equal(await future.isChecked(), false, 'new notes stay with this session');
    assert.match(await sheet.locator('.exercise-note-option').first().innerText(), /Future Upper B workouts/);
    assert.equal(await sheet.getByRole('checkbox', {name: /Pin under exercise name/}).isChecked(), false);
    await p.waitForTimeout(400);
    await p.screenshot({path: `${out}/02-add-today-note-${tag}.png`});
    await sheet.getByRole('button', {name: 'ADD NOTE', exact: true}).click();
    await sheet.waitFor({state: 'detached'});
    assert.match(await heading.locator('.exercise-personal-note-action').innerText(), new RegExp(REMINDER), 'pinned reminder stays');
    assert.equal(await heading.locator('.exercise-more-notes').innerText(), '+1 more note');
    await p.screenshot({path: `${out}/03-after-add-${tag}.png`});
    await heading.locator('.exercise-more-notes').click();
    await sheet.waitFor();
    const items = await sheet.locator('.exercise-note-item').allInnerTexts();
    assert.equal(items.length, 2);
    assert.match(items[0], /Pinned · Future Upper B workouts/);
    assert.match(items[1], /This workout only/);
    await p.waitForTimeout(400);
    await p.screenshot({path: `${out}/04-notes-list-${tag}.png`});
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scroll');
    await sheet.getByRole('button', {name: 'Close', exact: true}).click();

    // Finish the session with the bench sets logged.
    let state = await readState(p);
    const bench = state.activeWorkout.exercises[0];
    bench.sets.forEach(set => Object.assign(set, {weight: 80, reps: 6, completed: true}));
    state = completeWorkout(state);
    const done = state.workouts.at(-1);
    assert.deepEqual(exercisePersonalNotes(done.exercises[0]).map(n => n.text), [REMINDER, TODAY]);
    const upperB = state.program.days.find(d => d.name === 'Upper B'), upperA = state.program.days.find(d => d.name === 'Upper A');
    await c.close();

    // History: the completed session shows today's note.
    {
      const {c, p} = await open(browser, state, {width, dark});
      await p.evaluate(() => document.body.dataset.ready = '1');
      await p.waitForTimeout(300);
      const id = done.id;
      // Open the completed workout from the Today screen.
      const view = p.getByRole('button', {name: /view workout|workout details|session details/i}).first();
      if (await view.count()) await view.click();
      else await p.locator(`[data-workout-id="${id}"]`).first().click().catch(() => {});
      await p.locator('.session-log-trigger').first().waitFor({timeout: 5000});
      const trigger = p.locator('.session-log-trigger', {hasText: 'Bench Press'}).first();
      await trigger.click();
      const log = p.locator('.session-log-item.is-expanded .sheet-footnote');
      await log.waitFor();
      const text = await log.innerText();
      assert.match(text, new RegExp(TODAY));
      await log.scrollIntoViewIfNeeded();
      await p.waitForTimeout(400);
      await p.screenshot({path: `${out}/05-history-${tag}.png`});
      await c.close();
    }

    // Next Upper B: pinned reminder only. Upper A: no notes.
    for (const [day, label] of [[upperB, 'next-upper-b'], [upperA, 'upper-a']]) {
      const next = structuredClone(state); next.activeWorkout = startWorkout(next, day);
      const {c, p} = await open(browser, next, {width, dark});
      await p.getByRole('button', {name: 'RESUME WORKOUT', exact: true}).first().click();
      const heading = p.locator('.exercise-heading');
      await heading.waitFor();
      assert.match(await heading.locator('h1').innerText(), /Bench Press/);
      if (label === 'next-upper-b') {
        assert.match(await heading.locator('.exercise-personal-note-action').innerText(), new RegExp(REMINDER));
        assert.equal(await heading.locator('.exercise-more-notes').count(), 0, 'today’s note stayed with its session');
      } else {
        assert.equal(await heading.locator('.exercise-personal-note-action, .exercise-more-notes').count(), 0);
      }
      assert.equal(await heading.innerText().then(t => t.includes(TODAY)), false);
      await p.screenshot({path: `${out}/${label === 'next-upper-b' ? '06' : '07'}-${label}-${tag}.png`});
      await c.close();
    }
    console.log(`PASS ${tag}`);
  }
} finally { await browser.close(); }
