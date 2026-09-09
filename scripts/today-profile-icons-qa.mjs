import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/today-profile-icons';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const state=createReturningUserFixture(1);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175');
 const nav=page.locator('.bottom-nav');await nav.waitFor();
 const measure=()=>nav.evaluate(el=>[el,...el.querySelectorAll('button,svg')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
 const before=await measure();assert.equal(before[0][3],56);
 for(const selected of ['TODAY','PROFILE']){
  await nav.getByRole('button',{name:selected,exact:true}).click();await page.waitForTimeout(250);
  assert.deepEqual(await measure(),before);
  for(const id of ['today','profile']){
   const icon=nav.locator(`[data-nav-icon="${id}"]`);
   assert.equal(await icon.locator('.nav-icon-solid').evaluate(e=>getComputedStyle(e).display),selected.toLowerCase()===id?'block':'none');
  }
  await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${selected.toLowerCase()}.png`});
 }
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width} ${style} ${appearance}: both states, unchanged footer geometry`);
}}finally{await browser.close();}
