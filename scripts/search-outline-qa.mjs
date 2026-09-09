import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/search-outline';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill('MONDAY\nRavnotežje 3x8');await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
const input=page.locator('.import-resolution-match input[type=search]');await input.waitFor();await input.click();await page.waitForTimeout(300);
assert.equal(await input.evaluate(e=>getComputedStyle(e).outlineOffset),'-3px');assert.equal(await input.evaluate(e=>e.matches(':focus-visible')),true);
await page.screenshot({path:`${out}/${width}-${style}-${appearance}.png`});await input.fill('BOSU');assert.equal(await input.inputValue(),'BOSU');await input.fill('');assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(e=>document.activeElement===e),true);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log(`PASS ${width} ${style} ${appearance}`);await context.close();
}}finally{await browser.close();}
