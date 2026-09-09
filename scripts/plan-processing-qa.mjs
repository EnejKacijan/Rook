import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/plan-processing';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const [kind,width,appearance,style,reduced] of ['build','import'].flatMap(kind=>[['light','standard'],['dark','standard'],['light','premium'],['dark','premium']].flatMap(([appearance,style])=>[320,390].map(width=>[kind,width,appearance,style,false]))).concat([['build',390,'light','standard',true],['import',390,'dark','standard',true]])){
 const state=createReturningUserFixture(1);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));window.qaPlanGate=()=>new Promise((resolve,reject)=>{window.qaReleasePlan=resolve;window.qaFailPlan=()=>reject(Error('Synthetic processing failure'));});},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Test-only latency injection before unchanged real generator/parser execution.
 await page.route('**/src/App.jsx*',async route=>{const response=await route.fetch();let body=await response.text();assert.ok(body.includes('const startedAt = performance.now();'));body=body.replace('const startedAt = performance.now();','const startedAt = performance.now(); await window.qaPlanGate?.();');await route.fulfill({response,body});});
 await page.route('**/src/aiService.js*',async route=>{const response=await route.fetch();let body=await response.text();assert.ok(body.includes("onStage?.('reading');")||body.includes('onStage?.("reading");'));body=body.replace(/onStage\?\.\(['"]reading['"]\);/,"onStage?.('reading'); await window.qaPlanGate?.();");await route.fulfill({response,body});});
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_PROGRESS_QA_URL || 'http://127.0.0.1:4174',{waitUntil:'networkidle'});
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const initial=await stored();await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Replace plan/}).click();
 if(kind==='build')await page.getByRole('button',{name:/Build a personalized plan/}).click();else{await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();await page.getByPlaceholder(/Paste your workout notes/).fill('MONDAY - PUSH\nBench Press 3x8\nTUESDAY - LEGS\nSquat 3x5');}
 const start=()=>page.getByRole('button',{name:kind==='build'?/BUILD NEW PLAN|TRY AGAIN/:/CREATE PREVIEW|TRY AGAIN/}).click();
 await start();await page.locator('.plan-processing').waitFor({timeout:5000}).catch(async error=>{console.log(await page.locator('body').innerText(),errors,await page.evaluate(()=>typeof window.qaReleasePlan));throw error;});await page.waitForTimeout(180);
 const key=`${kind}-${width}-${style}-${appearance}${reduced?'-reduced':''}`;
 const bar=page.getByRole('progressbar');assert.equal(await bar.getAttribute('aria-valuenow'),null);assert.equal((await bar.boundingBox()).height,4);assert.equal(await page.locator('.plan-processing .building-spinner').count(),0);
 assert.equal(await bar.locator('span').evaluate(el=>getComputedStyle(el).backgroundColor),await page.evaluate(()=>{const el=document.createElement('i');el.style.color='var(--rook-accent)';document.body.append(el);const color=getComputedStyle(el).color;el.remove();return color;}));
 if(reduced)assert.equal(await bar.locator('span').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${key}-processing.png`});
 assert.deepEqual((await stored()).program,initial.program);
 if(kind==='import'&&!reduced&&width===390){
  await page.evaluate(()=>window.qaFailPlan());await page.getByRole('button',{name:'TRY AGAIN',exact:true}).waitFor();assert.equal(await page.locator('.plan-processing').count(),0);assert.deepEqual((await stored()).program,initial.program);await page.screenshot({path:`${out}/import-error.png`});await start();await page.locator('.plan-processing').waitFor();
 }
 if(kind==='build'&&width===320){
  await page.locator('.plan-processing').getByRole('button',{name:'CANCEL'}).click();await page.evaluate(()=>window.qaReleasePlan());await page.waitForTimeout(100);assert.deepEqual((await stored()).program,initial.program);await start();await page.locator('.plan-processing').waitFor();
 }
 // Observe every completion mutation: no transient full-bar success flash.
 await page.evaluate(()=>{window.qaFullProgress=false;new MutationObserver(records=>{if(document.querySelector('.plan-processing [aria-valuenow="100"]')||records.some(r=>r.attributeName==='aria-valuenow'&&r.target.getAttribute('aria-valuenow')==='100'))window.qaFullProgress=true;}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-valuenow']});});
 await page.evaluate(()=>window.qaReleasePlan());
 await page.locator('.plan-processing').waitFor({state:'detached'});await page.locator(kind==='build'?'.plan-editor':'.plan-editor').first().waitFor();
 assert.equal(await page.evaluate(()=>window.qaFullProgress),false);
 assert.deepEqual((await stored()).program,initial.program);assert.deepEqual((await stored()).workouts,initial.workouts);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${key}-review.png`});
 await context.close();console.log(`${key}: truthful progress, real processing, success and unchanged persisted plan passed`);
}
}finally{await browser.close();}
