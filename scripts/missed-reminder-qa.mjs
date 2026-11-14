import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {todayMissedRestFixture} from '../src/todayMissedRest.fixture.js';
import {applyFlexibleWeek, flexiblePlanFingerprint, missedFlexibleSessions, proposeFlexibleWeek} from '../src/flexibleWeek.js';

const output = 'artifacts/missed-reminder';
const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4295';
const today = '2026-09-18';
await mkdir(output,{recursive:true});
// Fixture dates must match the browser clock, independently of the runner date.
const NativeDate = Date, fixedTime = new NativeDate(`${today}T12:00:00`).getTime();
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixedTime])); }
  static now() { return fixedTime; }
};

const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for (const width of [320,390,430]) for (const style of ['standard','premium']) for (const appearance of ['light','dark']) {
    const label = `${width}-${style}-${appearance}`;
    const state = todayMissedRestFixture({count:2});
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
    try {
      await context.addInitScript(seed=>{
        if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state',JSON.stringify(seed));
      }, state);
      const page = await context.newPage(), errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.setFixedTime(new NativeDate(fixedTime));
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(origin);
      const menu = page.getByRole('button',{name:'Today options',exact:true});
      const missedMenu = page.getByRole('button',{name:'Missed workouts',exact:true});
      const row = page.locator('.today-missed-row'), dot = menu.locator('.today-missed-menu-dot');
      const hide = row.getByRole('button',{name:/Hide missed/});
      const read = () => page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      const set = async next => {
        await page.evaluate(next=>localStorage.setItem('lift-v2-state',JSON.stringify(next)),next);
        await page.reload();
        await menu.waitFor();
      };
      const shot = async name => {
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(width===390&&style==='standard'&&appearance==='dark')await page.screenshot({path:`${output}/${label}-${name}.png`});
      };

      await row.waitFor();
      assert.equal(await dot.count(),0);
      for (const target of [menu,hide,row.locator('.today-missed-open')]) {
        const size = await target.boundingBox();
        assert.ok(size.width>=44&&size.height>=44);
      }
      await shot('visible');
      const before = await read();
      await hide.click();
      await row.waitFor({state:'detached'});
      assert.equal(await dot.count(),0);
      assert.ok(await menu.evaluate(node=>node===document.activeElement),'Hide returns keyboard focus to the menu');
      const hidden = await read();
      assert.ok(hidden.dismissedMissedReminderKey);
      for(const key of ['program','flexibleWeek','workouts','activeWorkout'])assert.deepEqual(hidden[key],before[key]);
      await page.locator('.missed-workout-feedback').getByRole('button',{name:'Undo',exact:true}).click();
      await row.waitFor();
      await hide.click();
      await row.waitFor({state:'detached'});
      await page.reload();
      await menu.click();
      await missedMenu.waitFor();
      assert.match(await missedMenu.innerText(),/2 to review/);
      await shot('overflow');
      await missedMenu.click();
      await page.getByRole('heading',{name:'Choose a missed session'}).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.modal-layer').waitFor({state:'detached'});
      assert.equal(await row.count(),0);

      const session = missedFlexibleSessions(hidden)[0];
      const reduced = applyFlexibleWeek(hidden,proposeFlexibleWeek(hidden,{mode:'skip',sessionId:session.logicalSessionId})).state;
      await set(reduced);
      assert.equal(await row.count(),0,'the remaining previously hidden session does not reprompt');
      assert.match(await menu.evaluate(node=>document.getElementById(node.getAttribute('aria-describedby')).textContent),/1 missed workout/);

      await page.clock.setFixedTime(new NativeDate('2026-09-19T12:00:00'));
      await set({...reduced,selectedDate:'2026-09-19',selectedDay:'Sat'});
      await row.waitFor();
      assert.match(await row.innerText(),/2 missed workouts/);
      await row.locator('.today-missed-open').click();
      await page.getByRole('heading',{name:'Choose a missed session'}).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.modal-layer').waitFor({state:'detached'});
      await row.waitFor({state:'detached'});

      const conflict = structuredClone(state), day = conflict.program.days.at(-1), originalDate = '2026-09-18', id = `${day.id}:${originalDate}`;
      conflict.flexibleWeek = {schemaVersion:1,revision:1,sessions:{[id]:{id,workoutId:day.id,name:day.name,originalDate,scheduledDate:'2026-09-19',skipped:false,planFingerprint:`stale-${flexiblePlanFingerprint(conflict)}`}}};
      conflict.selectedDate = '2026-09-19';
      conflict.selectedDay = 'Sat';
      await set(conflict);
      await page.getByRole('button',{name:/Review schedule/}).waitFor();
      assert.equal(await row.count(),0);
      assert.equal(await dot.count(),1);
      await shot('conflict');
      await menu.click();
      await missedMenu.click();
      await page.getByRole('heading',{name:'Choose a missed session'}).waitFor();
      assert.equal(await page.locator('.missed-session-choices button').count(),2);
      await page.locator('.missed-session-choices button').first().click();
      await page.getByRole('button',{name:'REVIEW SCHEDULE FIRST',exact:true}).click();
      await page.getByRole('heading',{name:'Current changes'}).waitFor();
      await page.getByRole('button',{name:'Close Schedule changes',exact:true}).click();
      await page.locator('.modal-layer').waitFor({state:'detached'});
      assert.equal(await dot.count(),0);
      assert.deepEqual(errors,[]);
      console.log(`${label}: Hide, Undo, resize targets, menu and count, new miss, schedule conflict passed`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
