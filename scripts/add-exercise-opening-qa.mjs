import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const avoid of ['', 'Avoid leg press']) {
    const state=createReturningUserFixture(3);state.activeWorkout=null;state.profile.avoid=avoid;
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
    const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
    await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'PROFILE',exact:true}).click();
    await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const times=[];
    for(let run=0;run<3;run++) {
      const ms=await page.getByRole('button',{name:'+ Add exercise',exact:true}).first().evaluate(async el=>{
        const start=performance.now();el.click();
        await new Promise(resolve=>{const poll=()=>document.querySelector('.scratch-exercise-results')?requestAnimationFrame(()=>requestAnimationFrame(resolve)):requestAnimationFrame(poll);poll();});
        return performance.now()-start;
      });
      times.push(Math.round(ms));
      assert.ok(ms<1000,`Add exercise should paint within 1s at 4x CPU slowdown, got ${ms}ms`);
      assert.ok(await page.locator('.scratch-exercise-results [role="option"]').count());
      if(avoid)assert.equal(await page.locator('.scratch-exercise-results').getByRole('option',{name:'Leg Press',exact:true}).count(),0);
      await page.locator('.scratch-exercise-search').getByRole('button',{name:'CANCEL',exact:true}).click();
    }
    console.log(JSON.stringify({avoid,cpuSlowdown:4,openToPaintMs:times}));await context.close();
  }
} finally {await browser.close();}
