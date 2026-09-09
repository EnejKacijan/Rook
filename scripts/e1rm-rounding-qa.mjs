import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const out='artifacts/e1rm-rounding';await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--before');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const width of (baseline?[390]:[320,390]))for(const style of (baseline?['standard']:['standard','premium']))for(const appearance of (baseline?['light']:['light','dark']))for(const units of (baseline?['kg']:['kg','lb'])){
    const state=createReturningUserFixture(2);state.activeWorkout=null;
    Object.assign(state.profile,{units,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    state.workouts=[1,2].map(i=>({id:`e1rm-${i}`,name:'Upper',status:'completed',completedAt:`2026-09-0${i}T12:00:00Z`,canonicalPlanDate:`2026-09-0${i}`,workoutDateKey:`2026-09-0${i}`,exercises:[{id:`bench-${i}`,exerciseId:'barbell-bench-press',repMin:6,repMax:8,sets:[{id:`set-${i}`,weight:40,reps:8,rir:1,completed:true,planned:true}]}]}));
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    const original=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts};});
    await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
    await page.getByRole('button',{name:/Bench Press/}).last().click();
    await page.locator('.exercise-performance-insights').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    if(!baseline){
      const metric=page.locator('.exercise-performance-metrics div').filter({hasText:'Estimated 1RM'});
      assert.equal((await metric.locator('dd').innerText()).trim(),units==='kg'?'51 kg':'112 lb');
      assert.doesNotMatch(await page.locator('.exercise-e1rm-trend').innerText(),/\d+\.\d+/);
      assert.match(await page.locator('.exercise-e1rm-note').innerText(),/Estimated, not measured/);
      const point=page.locator('.e1rm-point-hit').last().locator('..');
      await point.focus();await point.press('Enter');
      assert.match(await page.locator('.e1rm-summary').innerText(),new RegExp(`Estimated 1RM ${units==='kg'?51:112} ${units}`));
      await point.press('Escape');
    }
    await page.screenshot({path:`${out}/${baseline?'before':'after'}-${width}-${style}-${appearance}-${units}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts};}),original);
    assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}-${style}-${appearance}-${units}`);
  }
} finally {await browser.close();}
