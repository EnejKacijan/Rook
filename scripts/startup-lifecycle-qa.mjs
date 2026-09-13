import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {deserializeState,serializeState} from '../src/domain.js';
const dir='artifacts/ROOK-STABILITY-PASS',base='http://127.0.0.1:4173';await mkdir(dir,{recursive:true});
const fixture=deserializeState(createReturningUserFixture(2)),raw=serializeState(fixture),results=[];
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
 await context.addInitScript(raw=>{if(!localStorage.getItem('startup-lifecycle-seeded')){localStorage.setItem('lift-v2-state',raw);localStorage.setItem('startup-lifecycle-seeded','yes');}},raw);
 const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});
 const check=async(name,p=page)=>{await p.getByRole('button',{name:'TODAY',exact:true}).waitFor();const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(s.workouts,JSON.parse(raw).workouts);assert.equal(s.program.id,fixture.program.id);assert.equal(await p.locator('.entry-screen').count(),0);results.push({name,passed:true});};
 await check('normal-start');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload({waitUntil:'networkidle'});await check('service-worker-controlled-reload');
 assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
 const cdp=await context.newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await cdp.send('Page.setWebLifecycleState',{state:'active'});await check('chromium-freeze-resume');
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await check('lifecycle-event-handlers');
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});await page.reload({waitUntil:'networkidle'});await check('service-worker-update-check-and-reload');
 const next=await context.newPage();await page.close();await next.goto(base,{waitUntil:'networkidle'});await check('close-reopen-same-origin',next);
 await context.close();
}finally{await browser.close();await writeFile(`${dir}/startup-lifecycle-results.json`,JSON.stringify({physicalDevice:false,results},null,2));}
console.log(`Startup lifecycle checks: ${results.length} passed, 0 failed (Chromium simulation, not physical PWA).`);
