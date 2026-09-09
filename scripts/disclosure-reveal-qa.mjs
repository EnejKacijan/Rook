import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/disclosure-reveal';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium']){
const state=createReturningUserFixture(2);Object.assign(state.profile,{appearancePreference:'dark',stylePreference:style,themePreference:style==='premium'?'premium':'dark'});
const context=await browser.newContext({viewport:{width,height:760},serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.locator('[data-profile-area="training"]').click();await page.getByRole('button',{name:/Personal details/}).click();await page.locator('.profile-sex-trigger').click();await page.waitForTimeout(650);
const rects=await page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom}};return {options:r(document.querySelector('#profile-sex-options')),footer:r(document.querySelector('.sheet-action-footer')),header:r(document.querySelector('.modal-layer .detail-header'))};});
assert.ok(rects.options.bottom<=rects.footer.top,JSON.stringify(rects));assert.ok(rects.options.top>=rects.header.bottom,JSON.stringify(rects));
await page.screenshot({path:`${out}/${width}-${style}-dark.png`});
await page.keyboard.press('Escape');assert.equal(await page.locator('.profile-sex-trigger').getAttribute('aria-expanded'),'false');
assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).profile.sex,state.profile.sex);
console.log(`PASS ${width} ${style}`);await context.close();
}}finally{await browser.close();}
