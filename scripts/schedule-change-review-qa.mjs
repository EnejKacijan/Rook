import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startWorkout} from '../src/domain.js';
import {temporaryScheduleSummaryState} from '../src/fixtures/temporaryScheduleSummaryState.js';

const output = 'artifacts/schedule-change-review';
const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4295';
const today = '2026-10-01';
await mkdir(output, {recursive:true});

function fixture(appearance, style) {
  const state = temporaryScheduleSummaryState();
  state.selectedDate = today;
  state.selectedDay = 'Thu';
  Object.assign(state.profile, {appearancePreference:appearance, stylePreference:style, themePreference:style==='premium'?'premium':appearance});
  const sample = Object.values(state.flexibleWeek.sessions)[0];
  const add = (day, originalDate, scheduledDate, skipped) => {
    const id = `${day.id}:${originalDate}`;
    state.flexibleWeek.sessions[id] = {...sample, id, workoutId:day.id, name:day.name, originalDate, scheduledDate, skipped};
    return id;
  };
  const finishedDay = state.program.days[1];
  const finishedId = add(finishedDay,'2026-09-29','2026-10-03',false);
  const workout = startWorkout(state,finishedDay);
  Object.assign(workout, {logicalSessionId:finishedId, startedAt:Date.parse('2026-09-30T12:00:00'), completedAt:'2026-09-30T12:30:00'});
  state.workouts.push(workout);
  add(state.program.days[2],'2026-10-07','2026-10-07',true);
  add(state.program.days[0],'2026-09-07','2026-09-08',false);
  return state;
}

const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  for (const width of [320,390,430]) for (const style of ['standard','premium']) for (const appearance of ['light','dark']) {
    const label = `${width}-${style}-${appearance}`;
    if(process.env.ROOK_QA_CASE && process.env.ROOK_QA_CASE!==label)continue;
    const context = await browser.newContext({viewport:{width,height:width===320?650:844}, isMobile:true, hasTouch:true, serviceWorkers:'block', reducedMotion:'reduce'});
    try {
      const state = fixture(appearance,style);
      await context.addInitScript(seed=>{
        if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state',JSON.stringify(seed));
      },state);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(origin);
      const button = (name, scope=page) => scope.getByRole('button',{name,exact:true});
      const view = button('View change'), sheet = page.locator('.flexible-week-sheet');
      const read = () => page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      const changeRows = sheet.locator('.flexible-schedule-changes > article');
      const capture = async name => {
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if (width===320 || width===390 && style==='standard' && appearance==='dark')
          await page.screenshot({path:`${output}/after-${name}-${label}.png`});
      };
      const oneDivider = async (rows=changeRows) => {
        const last = await rows.last().evaluate(node=>getComputedStyle(node).borderBottomWidth);
        assert.equal(last,'0px','the last row must not draw another line above the footer');
        assert.equal(await sheet.locator('footer').evaluate(node=>getComputedStyle(node,'::before').borderTopWidth),'1px');
      };
      await view.waitFor();
      assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
      assert.equal(await page.locator('html').getAttribute('data-style'),style);
      assert.ok((await view.boundingBox()).height>=44);
      const before = await read();
      await capture('today');
      await view.click();
      await sheet.waitFor();
      assert.equal(await changeRows.count(),2,'focused swap shows only the linked pair');
      assert.equal(await sheet.getByText('Earlier this week',{exact:true}).count(),0);
      await oneDivider();
      await capture('change');
      await button('RESTORE 2 WORKOUTS',sheet).click();
      await sheet.getByRole('heading',{name:'Restore original dates?'}).waitFor();
      assert.equal(await changeRows.count(),2);
      assert.match(await sheet.innerText(),/stays skipped/);
      await oneDivider();
      await capture('restore');
      await button('KEEP CURRENT SCHEDULE',sheet).click();
      assert.deepEqual((await read()).flexibleWeek,before.flexibleWeek);
      await button('VIEW ALL SCHEDULE CHANGES',sheet).click();
      await sheet.getByRole('heading',{name:'Current changes'}).waitFor();
      assert.equal(await changeRows.count(),3,'week overview also shows the upcoming independent change');
      assert.match(await changeRows.last().innerText(),/This skip can be undone/);
      const recent = sheet.getByRole('region',{name:'Earlier this week'});
      assert.equal(await recent.locator('article').count(),1);
      assert.match(await recent.innerText(),/Completed/);
      assert.doesNotMatch(await sheet.innerText(),/Sep 7|Past changes/);
      await oneDivider(recent.locator('article'));
      await capture('overview');
      await button('DONE',sheet).click();
      await sheet.waitFor({state:'detached'});
      await view.click();
      await button('RESTORE 2 WORKOUTS',sheet).click();
      await sheet.getByRole('heading',{name:'Restore original dates?'}).waitFor();
      await button('RESTORE 2 WORKOUTS',sheet).click();
      await sheet.waitFor({state:'detached'});
      const after = await read();
      assert.equal(after.flexibleWeek.revision,before.flexibleWeek.revision+1);
      const retained = Object.fromEntries(Object.entries(before.flexibleWeek.sessions).filter(([,record])=>!['2026-10-01','2026-10-02'].includes(record.originalDate)));
      assert.deepEqual(after.flexibleWeek.sessions,retained);
      assert.deepEqual(after.workouts,before.workouts);
      assert.deepEqual(after.program,before.program);
      await page.reload();
      await page.locator('.today-hero').waitFor();
      assert.equal(await view.count(),0);
      assert.deepEqual((await read()).flexibleWeek,after.flexibleWeek);
      assert.deepEqual(errors,[]);
      console.log(`${label}: focused review, week history, separators, cancel, restore and reload passed`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
