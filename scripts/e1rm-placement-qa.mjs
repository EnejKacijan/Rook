import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, exerciseName } from '../src/domain.js';

const out='artifacts/e1rm-placement';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const resting of [false,true]){
    const state=createReturningUserFixture(2);
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    state.activeWorkout=startWorkout(state,state.program.days[0]);
    if(resting){state.activeWorkout.exercises[0].sets[0].completed=true;state.activeWorkout.rest={seconds:600,endsAt:Date.now()+600000};}
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
    const snapshot=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts,exercises:s.activeWorkout.exercises,index:s.activeWorkout.exerciseIndex,rest:s.activeWorkout.rest};});
    const original=await snapshot();
    assert.equal(await page.locator('.exercise-e1rm-trend').count(),0,'no graph in logger');
    const prefix=`${width}-${style}-${appearance}-${resting?'rest':'pending'}`;
    await page.screenshot({path:`${out}/${prefix}-logger.png`});
    await page.getByRole('button',{name:'Exercise options',exact:true}).click();
    assert.equal(await page.locator('.exercise-e1rm-trend').count(),0,'no graph in options menu');
    await page.getByRole('button',{name:/View exercise details/}).click();
    await page.locator('.exercise-e1rm-trend svg').waitFor();
    await page.locator('.exercise-e1rm-trend').scrollIntoViewIfNeeded();await page.waitForTimeout(200);
    await page.screenshot({path:`${out}/${prefix}-details.png`});
    await page.getByRole('button',{name:/^Close .* details$/}).click();
    await page.locator('.exercise-e1rm-trend').waitFor({state:'detached'});
    assert.equal(await page.locator('.exercise-e1rm-trend').count(),0,'graph disappears on closing details');
    await page.getByRole('button',{name:'Exercise options',exact:true}).waitFor();
    assert.deepEqual(await snapshot(),original,'viewing history leaves sets, rest deadline, plan and history untouched');
    await page.getByRole('button',{name:'Back to Today',exact:true}).click();
    await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
    const name=exerciseName(state.activeWorkout.exercises[0]);
    await page.getByRole('button',{name:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).last().click();
    await page.locator('.exercise-e1rm-trend svg').waitFor();
    await page.getByRole('button',{name:/^Close .* details$/}).click();
    await page.locator('.exercise-e1rm-trend').waitFor({state:'detached'});
    await page.locator('.progression-overview').waitFor();
    assert.deepEqual(await snapshot(),original,'Progress details also preserve active workout and completed history');
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await context.close();console.log(`PASS ${prefix}`);
  }
} finally {await browser.close();}
