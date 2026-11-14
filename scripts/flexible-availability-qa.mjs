import { openAdjustWeek } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { adjustWeekState, ADJUSTMENT_TODAY } from '../src/fixtures/adjustWeekState.js';
import { addCalendarDays } from '../src/flexibleWeek.js';

const out=new URL('../artifacts/flexible-availability-results/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const datesThroughSunday=Array.from({length:6},(_,index)=>addCalendarDays(ADJUSTMENT_TODAY,index));
try {
  for(const width of [320,390,430]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) {
    const state=adjustWeekState({shifted:false});
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    try {
      await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
      const page=await context.newPage();
      await page.clock.setFixedTime(new Date(`${ADJUSTMENT_TODAY}T12:00:00`));
      await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
      await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
      const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      await page.getByRole('button',{name:'Today options',exact:true}).waitFor();
      const initial=await read();
      const assertUnchanged=async()=>{
        const current=await read();
        for(const key of ['program','profile','workouts','activeWorkout','flexibleWeek'])assert.deepEqual(current[key],initial[key],key);
      };
      const shot=async name=>{
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await page.screenshot({path:fileURLToPath(new URL([width,style,appearance,name].join('-')+'.png',out))});
      };
      await openAdjustWeek(page);
      const sheet=page.locator('.flexible-week-sheet');
      const button=name=>sheet.getByRole('button',{name,exact:typeof name==='string'});
      await button(/^My available days changed/).click();
      await sheet.getByRole('heading',{name:'When can you train this week?'}).waitFor();
      const available=sheet.locator('[data-available-date]');
      assert.deepEqual(await available.evaluateAll(rows=>rows.map(row=>row.dataset.availableDate)),datesThroughSunday);
      const select=async dates=>{
        for(const day of datesThroughSunday){
          const row=sheet.locator('[data-available-date="'+day+'"]');
          if((await row.getAttribute('aria-pressed')==='true')!==dates.includes(day))await row.click();
        }
      };
      const apply=button('APPLY SCHEDULE');
      await select(datesThroughSunday.slice(0,4));
      await button('REVIEW SCHEDULE').click();
      await sheet.getByRole('heading',{name:'Your updated schedule'}).waitFor();
      assert.equal(await sheet.getByText('Needs a day',{exact:true}).count(),1);
      assert.equal(await apply.isDisabled(),true);
      await shot('insufficient-days');
      await assertUnchanged();
      await button('EDIT DAYS').click();
      await select(datesThroughSunday.slice(1));
      await button('REVIEW SCHEDULE').click();
      assert.equal(await apply.isEnabled(),true);
      const changes=await sheet.locator('.flexible-week-review > article[data-session-id]').evaluateAll(rows=>rows.map(row=>row.dataset.sessionId));
      assert.equal(changes.length,5,'each moved occurrence is listed once');
      await assertUnchanged();
      await shot('ready');
      await apply.click();
      await sheet.waitFor({state:'detached'});
      const saved=await read();
      assert.deepEqual(Object.keys(saved.flexibleWeek.sessions).sort(),changes.sort());
      assert.deepEqual(Object.values(saved.flexibleWeek.sessions).map(row=>row.scheduledDate).sort(),datesThroughSunday.slice(1));
      for(const key of ['program','profile','workouts'])assert.deepEqual(saved[key],initial[key]);
      await page.reload();
      await page.getByRole('button',{name:'Today options',exact:true}).waitFor();
      assert.deepEqual((await read()).flexibleWeek,saved.flexibleWeek);
      console.log(width,style,appearance,'current-week capacity, review, apply and reload passed');
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
