import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/progress-nav-icon';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
for(const [width,appearance,style] of [[390,'light','standard'],[390,'dark','standard'],[390,'light','premium'],[390,'dark','premium'],[320,'light','standard']]){
 const state=createReturningUserFixture(1);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 const nav=page.locator('.bottom-nav'),icon=nav.locator('[data-nav-icon="progress"]');
 const measure=()=>nav.evaluate(el=>{const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};return [box(el),...[...el.querySelectorAll('button,svg')].map(box)];});
 const before=await measure();assert.equal(before[0][3],56);
 const untouched=await nav.locator('svg:not([data-nav-icon="progress"])').evaluateAll(els=>els.map(el=>el.innerHTML));
 await page.waitForTimeout(200);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-inactive.png`});
 const inactive=await icon.locator('.nav-icon-line rect').first().evaluate(el=>({fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke}));assert.equal(inactive.fill,'none');
 await nav.getByRole('button',{name:'PROGRESS',exact:true}).click();await page.locator('.progress-screen').waitFor();await page.waitForTimeout(200);
 assert.deepEqual(await measure(),before);assert.equal(await nav.getByRole('button',{name:'PROGRESS',exact:true}).getAttribute('aria-current'),'page');
 assert.deepEqual(await nav.locator('svg:not([data-nav-icon="progress"])').evaluateAll(els=>els.map(el=>el.innerHTML)),untouched);
 const active=await icon.locator('.nav-icon-solid rect').first().evaluate(el=>({fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke}));assert.equal(active.fill,active.stroke);assert.notEqual(active.fill,inactive.stroke);
 assert.equal(active.fill,await nav.getByRole('button',{name:'PROGRESS',exact:true}).evaluate(el=>getComputedStyle(el).color));
 assert.equal(await icon.evaluate(el=>el.getBoundingClientRect().width),22);
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-active.png`});await context.close();console.log(`${width} ${style} ${appearance}: stable geometry, route and styling passed`);
}
}finally{await browser.close();}
